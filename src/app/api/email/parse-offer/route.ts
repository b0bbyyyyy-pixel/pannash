import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { downloadMailboxAttachment, getMailboxMessage, MailboxError } from '@/lib/email/mailbox';
import { appendEmailSent } from '@/lib/leads/fileActivity';
import { EMPTY_OFFER_FIELDS, extractMaxCommissionPoints, normalizeEpoOptions, type ParsedOfferFields } from '@/lib/email/offerFields';
import { fetchOfferPages, pickOfferUrls } from '@/lib/email/offerLink';

let _pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null = null;
function getPdfParse() {
  if (!_pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('pdf-parse');
    _pdfParse = typeof mod === 'function' ? mod : mod.default;
  }
  return _pdfParse!;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;


function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(raw.slice(start, end + 1));
    return v && typeof v === 'object' ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== 'null' && s !== 'undefined' ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function readPdfAttachments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  messageId: string,
  atts: { attachmentId: string; filename: string; mime: string }[],
) {
  const chunks: string[] = [];
  for (const att of atts.slice(0, 4)) {
    const isPdf = /pdf/i.test(att.mime) || /\.pdf$/i.test(att.filename);
    if (!isPdf) continue;
    const buf = await downloadMailboxAttachment(supabase, userId, messageId, att.attachmentId);
    if (!buf || buf.length > 8_000_000) continue;
    try {
      const parsed = await getPdfParse()(buf);
      const text = String(parsed.text || '').trim();
      if (text) chunks.push(`ATTACHMENT ${att.filename}:\n${text.slice(0, 8_000)}`);
    } catch {
      /* skip unreadable pdf */
    }
  }
  return chunks.join('\n\n');
}

function normalize(raw: Record<string, unknown>): ParsedOfferFields {
  const verdictRaw = String(raw.verdict || '').toLowerCase();
  const verdict: ParsedOfferFields['verdict'] =
    verdictRaw === 'approved' || verdictRaw === 'declined' ? verdictRaw : 'other';
  const typeRaw = String(raw.offerType || '').toLowerCase();
  const offerType: ParsedOfferFields['offerType'] =
    typeRaw === 'loc' ? 'loc' : typeRaw === 'mca' ? 'mca' : null;
  const freq = str(raw.paymentFrequency);
  const locFreq = str(raw.locPaymentFrequency);
  return {
    verdict,
    offerType,
    lenderName: str(raw.lenderName),
    amount: num(raw.amount),
    buyRate: num(raw.buyRate),
    addedPoints: num(raw.addedPoints),
    factorRate: num(raw.factorRate),
    termLength: num(raw.termLength),
    paymentFrequency: freq,
    monthlyAPR: num(raw.monthlyAPR),
    locTermMonths: num(raw.locTermMonths),
    locPaymentFrequency: locFreq,
    url: str(raw.url),
    notes: str(raw.notes),
    epoOptions: normalizeEpoOptions(raw.epoOptions, num(raw.amount)),
  };
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
  const user = await getRequestUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let messageId = '';
  let leadId = '';
  try {
    const body = await req.json();
    messageId = String(body.messageId || '').trim();
    leadId = String(body.leadId || '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

  let leadName = '';
  let company = '';
  if (leadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, company')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    leadName = String(lead.name || '');
    company = String(lead.company || '');
  }

  let message;
  try {
    message = await getMailboxMessage(supabase, user.id, messageId);
  } catch (err) {
    const box = err instanceof MailboxError ? err : new MailboxError('Could not read that email.');
    return NextResponse.json(
      { error: box.message, needsReconnect: box.needsReconnect },
      { status: box.needsReconnect ? 403 : 500 },
    );
  }

  let ai: ReturnType<typeof getAIClient>;
  try {
    ai = getAIClient();
  } catch {
    return NextResponse.json({ error: 'XAI_API_KEY is not configured.' }, { status: 500 });
  }

  const offerUrls = pickOfferUrls([
    ...message.links,
    ...(message.body.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []),
  ]);
  const [pages, attachmentText] = await Promise.all([
    fetchOfferPages(offerUrls),
    readPdfAttachments(supabase, user.id, message.id, message.attachments),
  ]);

  let completion;
  try {
    completion = await ai.chat.completions.create({
    model: GROK_MINI_MODEL,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `Extract a merchant-cash-advance or line-of-credit offer from a lender email, its HTML table, attachments, and any linked page. Reply with JSON only:
{"verdict":"approved"|"declined"|"other","offerType":"mca"|"loc"|null,"lenderName":string|null,"amount":number|null,"buyRate":number|null,"addedPoints":number|null,"factorRate":number|null,"termLength":number|null,"paymentFrequency":"Daily"|"Weekly"|"Bi-Weekly"|"Monthly"|null,"monthlyAPR":number|null,"locTermMonths":number|null,"locPaymentFrequency":"Weekly"|"Monthly"|null,"url":string|null,"notes":string|null,"epoOptions":[{"days":30,"amount":65000,"factorRate":1.15}]}
Rules:
- The email HTML often has the offer table (amount, factor/buy rate, term, payment, pre-pay) even when the portal link requires login. Read that table.
- Prefer numbers from the email table or PDF over a login page.
- amount is the offer or credit limit in dollars (no $ or commas).
- buyRate and factorRate are multipliers like 1.29. If only one rate is listed, put it in both.
- addedPoints is the MAX commission/points the lender allows on this offer (commission slider max). "Commission 12.00% · 12.00% max" → 12. Not origination. Not broker split.
- termLength is MCA payment count. 10 months daily ≈ 210. 12 months weekly ≈ 52.
- monthlyAPR is a percent like 2.5.
- url is the clickable offer / SYNQ / portal link.
- epoOptions are early payoff / pre-pay / prepay / EPO / buyout rows. Labels like 30/60/90, Early payoff, Prepay schedule.
- Each EPO row: days (convert weeks: 4 weeks = 28), amount = buyout total in dollars at the full offer size, factorRate if listed as a multiplier (1.15 not 15).
- If only a factor is listed for that window, set factorRate and amount null.
- [] if the email has no pre-pay schedule.
- Do not say login-required if any dollar amount or factor rate is present in the email or PDF.
- notes is one short sentence.`,
      },
      {
        role: 'user',
        content: `Lead: ${leadName || 'unknown'}${company ? ` · ${company}` : ''}
From: ${message.from}
To: ${message.to}
Subject: ${message.subject}
Date: ${message.date}
Offer links found: ${offerUrls.join(' ') || '(none)'}

EMAIL:
${message.body || message.snippet || '(empty body)'}

${attachmentText || 'ATTACHMENTS: (none)'}

${pages || 'LINKED PAGE: (login wall or could not open)'}`,
      },
    ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI parse failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const raw = completion.choices[0]?.message?.content || '';
  const parsed = parseJsonObject(raw);
  const offer = parsed ? normalize(parsed) : { ...EMPTY_OFFER_FIELDS, notes: 'Could not read offer terms from this email.' };
  if (!offer.url && offerUrls[0]) offer.url = offerUrls[0];
  if (offer.buyRate == null && offer.factorRate != null) offer.buyRate = offer.factorRate;
  if (offer.factorRate == null && offer.buyRate != null) offer.factorRate = offer.buyRate;
  offer.epoOptions = normalizeEpoOptions(offer.epoOptions, offer.amount);
  if (offer.addedPoints == null) {
    offer.addedPoints = extractMaxCommissionPoints(`${message.body}\n${attachmentText}\n${pages}`);
  }
  if (offer.amount == null && offerUrls[0] && !/\$|factor/i.test(message.body + attachmentText)) {
    offer.notes = offer.notes
      || 'Found the offer link, but the email and portal page had no dollar amount. Open the link and enter the terms.';
  }

  if (leadId && message.folder === 'sent') {
    const sentAt = message.date ? new Date(message.date) : null;
    await appendEmailSent(supabase, {
      userId: user.id,
      leadId,
      to: message.to,
      subject: message.subject,
      at: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt.toISOString() : undefined,
    });
  }

  return NextResponse.json({ offer, message: { id: message.id, folder: message.folder, subject: message.subject, from: message.from, to: message.to, date: message.date } });
}
