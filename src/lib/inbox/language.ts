import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';
import {
  languageLabel,
  normalizeLang,
  sameSmsText,
} from '@/lib/inbox/languageDisplay';
import { isSmsStopBody } from '@/lib/leads/dnc';

export {
  inboxEnglishGloss,
  languageLabel,
  normalizeLang,
  sameSmsText,
  sentInLabel,
} from '@/lib/inbox/languageDisplay';

export function isLanguageAgnosticSms(body: string | null | undefined) {
  const t = String(body ?? '').trim();
  if (!t || t === 'Attachment: 1 Photo') return true;
  if (isSmsStopBody(t)) return true;
  if (/^(help|info)$/i.test(t)) return true;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length < 3;
}

export function isSubstantialSms(body: string | null | undefined) {
  const t = String(body ?? '').trim();
  if (isLanguageAgnosticSms(t)) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const words = t.split(/\s+/).filter(Boolean);
  return letters.length >= 8 || words.length >= 3;
}

const LANG_HINTS: { lang: string; re: RegExp }[] = [
  { lang: 'es', re: /[áéíóúñ¿¡]|\b(puede|puedo|pueden|conseguir|necesito|necesita|gracias|hola|buenos|favor|vale|cuándo|cuánto|correo|electrónico|aplicación|préstamo|mañana|bancos|estados|cuenta|quiero|quisiera|dinero|para|cuando|facilita)\b/gi },
  { lang: 'pt', re: /[ãõç]|\b(você|obrigado|obrigada|preciso|não|amanhã|dinheiro|bancários|aplicação)\b/gi },
  { lang: 'ht', re: /\b(mwen|pou|avèk|ou|sou|tanpri|lajan|bank)\b/gi },
  { lang: 'fr', re: /[àâçèéêëîïôùû]|\b(bonjour|merci|s'il|vous|pouvez|besoin|argent|banque)\b/gi },
];

/** Cheap guess from merchant texts so existing threads work before the next inbound webhook. */
export function guessSmsLanguage(texts: string[]): string | null {
  const blob = texts.filter(t => t && !isLanguageAgnosticSms(t)).join('\n');
  if (!blob.trim()) return null;
  let best: { lang: string; n: number } | null = null;
  for (const { lang, re } of LANG_HINTS) {
    const n = blob.match(re)?.length ?? 0;
    if (n && (!best || n > best.n)) best = { lang, n };
  }
  return best && best.n >= 1 ? best.lang : null;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type OutboundPrep = {
  body: string;
  bodyOriginal: string;
  bodyEn: string;
  lang: string | null;
  translated: boolean;
};

function emptyPrep(draft: string, lang: string | null): OutboundPrep {
  return { body: draft, bodyOriginal: draft, bodyEn: draft, lang, translated: false };
}

export function languageColumns(prep: OutboundPrep | null | undefined): Record<string, unknown> {
  if (!prep) return {};
  const out: Record<string, unknown> = {};
  if (prep.bodyOriginal) out.body_original = prep.bodyOriginal;
  if (prep.bodyEn) out.body_en = prep.bodyEn;
  if (prep.lang) out.detected_lang = prep.lang;
  return out;
}

function withoutLangCols(row: Record<string, unknown>) {
  const rest = { ...row };
  delete rest.body_original;
  delete rest.body_en;
  delete rest.detected_lang;
  return rest;
}

function withoutLangSelect(select: string) {
  if (!select || select.trim() === '*') return '*';
  const cols = select
    .split(',')
    .map(s => s.trim())
    .filter(s => s && !['body_en', 'body_original', 'detected_lang'].includes(s));
  return cols.join(', ') || '*';
}

async function grokJson(user: string): Promise<Record<string, unknown> | null> {
  try {
    const openai = getAIClient();
    const completion = await openai.chat.completions.create({
      model: GROK_MINI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You translate and detect language for short business SMS. JSON only. Never say "working capital". Keep STOP, HELP, numbers, names, and emails unchanged. No persona names.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: 220,
    });
    return parseJsonObject(completion.choices[0]?.message?.content);
  } catch (err) {
    console.error('[sms-lang] grok', err instanceof Error ? err.message : 'error');
    return null;
  }
}

export async function inspectInboundSms(args: {
  text: string;
  recentInbound?: string[];
  storedLang?: string | null;
}): Promise<{ lang: string | null; en: string; updateStored: boolean }> {
  const text = args.text.trim();
  const stored = normalizeLang(args.storedLang);
  if (!text || isLanguageAgnosticSms(text)) {
    return { lang: stored, en: text, updateStored: false };
  }

  const recent = (args.recentInbound || []).filter(Boolean).slice(-4);
  const parsed = await grokJson(
    `Newest merchant SMS: ${JSON.stringify(text)}
Recent merchant texts: ${JSON.stringify(recent)}
Stored lead language: ${stored || '(none)'}

Return JSON: {"lang":"es","update_stored":true,"en":"English gloss of the newest SMS"}
lang is ISO 639-1 of the NEWEST text. update_stored false if the newest is too short or ambiguous to change the stored language. en is English of the newest (same string if already English).`,
  );

  const lang = normalizeLang(typeof parsed?.lang === 'string' ? parsed.lang : null) || stored;
  const en = String(parsed?.en || text).trim() || text;
  const updateStored = !!lang && isSubstantialSms(text) && parsed?.update_stored !== false;
  return { lang, en, updateStored };
}

export async function prepareOutboundForLead(
  draft: string,
  leadLang: string | null | undefined,
): Promise<OutboundPrep> {
  const text = draft.trim();
  const lang = normalizeLang(leadLang);
  if (!text) return emptyPrep(text, lang);
  if (!lang || lang === 'en' || isLanguageAgnosticSms(text)) return emptyPrep(text, lang || 'en');

  const name = languageLabel(lang) || lang;
  const parsed = await grokJson(
    `Lead language: ${name} (${lang})
Owner draft: ${JSON.stringify(text)}

Return JSON: {"draft_lang":"en","send":"text the lead receives","en":"English gloss"}
send must be in the lead language. If the draft is already in that language, send = draft. en is English of send (the draft if the owner wrote English).`,
  );

  const send = String(parsed?.send || text).trim() || text;
  const en = String(parsed?.en || text).trim() || text;
  const translated = !sameSmsText(send, text);
  return { body: send, bodyOriginal: text, bodyEn: en, lang, translated };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function glossBodies(bodies: string[]): Promise<string[]> {
  if (!bodies.length) return [];
  const parsed = await grokJson(
    `Translate each SMS to English. Same order. Return JSON: {"en":["English 1","English 2"]}
Texts: ${JSON.stringify(bodies)}`,
  );
  const arr = Array.isArray(parsed?.en) ? parsed.en : [];
  return bodies.map((b, i) => {
    const en = String(arr[i] ?? '').trim();
    return en || b;
  });
}

type ThreadBit = { id?: string; direction?: string | null; body?: string | null; body_en?: string | null; detected_lang?: string | null };

/** Store language from the existing thread when inbound webhook has not run yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureLeadSmsLanguage(
  supabase: any,
  leadId: string,
  thread?: ThreadBit[],
): Promise<string | null> {
  const stored = await readLeadSmsLanguage(supabase, leadId);
  if (stored) return stored;

  let inbound: string[] = [];
  if (thread?.length) {
    inbound = thread
      .filter(m => m.direction === 'inbound')
      .map(m => String(m.body || '').trim())
      .filter(Boolean);
  } else {
    try {
      const { data } = await supabase
        .from('inbox_messages')
        .select('body')
        .eq('lead_id', leadId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(8);
      inbound = (data ?? []).map((m: { body?: string }) => String(m.body || '').trim()).filter(Boolean);
    } catch {
      inbound = [];
    }
  }

  let lang = guessSmsLanguage(inbound);
  if (!lang) {
    const latest = inbound.find(t => isSubstantialSms(t));
    if (latest) {
      const inspected = await inspectInboundSms({ text: latest, recentInbound: inbound, storedLang: null });
      lang = inspected.lang;
    }
  }
  if (lang) await persistLeadLanguage(supabase, leadId, lang);
  return lang;
}

/** Fill English glosses on inbound rows that predate the language columns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfillThreadLanguage<T extends ThreadBit>(
  supabase: any,
  args: { leadId: string; messages: T[] },
): Promise<T[]> {
  const messages = args.messages;
  if (!messages.length) return messages;
  const lang = await ensureLeadSmsLanguage(supabase, args.leadId, messages);
  if (!lang || lang === 'en') return messages;

  const need = messages.filter(m =>
    m.direction === 'inbound'
    && m.id
    && m.body
    && !isLanguageAgnosticSms(m.body)
    && !String(m.body_en || '').trim()
  ).slice(-5);
  if (!need.length) return messages;

  const glosses = await glossBodies(need.map(m => String(m.body)));
  for (let i = 0; i < need.length; i++) {
    const row = need[i];
    const en = glosses[i];
    row.detected_lang = lang;
    if (en && !sameSmsText(en, String(row.body))) row.body_en = en;
    await persistMessageLanguage(supabase, {
      messageId: row.id,
      bodyEn: row.body_en,
      lang,
    });
  }
  return messages;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readLeadSmsLanguage(supabase: any, leadId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('sms_language')
      .eq('id', leadId)
      .maybeSingle();
    if (error && isMissingSchema(error)) {
      warnMissingSchema('leads.sms_language', error);
      return null;
    }
    return normalizeLang(data?.sms_language);
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('leads.sms_language', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function persistLeadLanguage(supabase: any, leadId: string, lang: string | null) {
  const code = normalizeLang(lang);
  if (!code) return;
  try {
    const { error } = await supabase.from('leads').update({ sms_language: code }).eq('id', leadId);
    if (error && isMissingSchema(error)) warnMissingSchema('leads.sms_language', error);
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('leads.sms_language', err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function persistMessageLanguage(
  supabase: any,
  args: {
    messageId?: string | null;
    twilioSid?: string | null;
    leadId?: string | null;
    bodyEn?: string | null;
    bodyOriginal?: string | null;
    lang?: string | null;
  },
) {
  const patch: Record<string, unknown> = {};
  if (args.bodyEn) patch.body_en = args.bodyEn;
  if (args.bodyOriginal) patch.body_original = args.bodyOriginal;
  if (args.lang) patch.detected_lang = normalizeLang(args.lang);
  if (!Object.keys(patch).length) return;

  let id = args.messageId || null;
  if (!id && args.twilioSid) {
    const { data } = await supabase
      .from('inbox_messages')
      .select('id')
      .eq('twilio_sid', args.twilioSid)
      .maybeSingle();
    id = data?.id ?? null;
  }
  if (!id && args.leadId) {
    const { data } = await supabase
      .from('inbox_messages')
      .select('id')
      .eq('lead_id', args.leadId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) return;

  try {
    const { error } = await supabase.from('inbox_messages').update(patch).eq('id', id);
    if (error && isMissingSchema(error)) warnMissingSchema('inbox_messages.body_en', error);
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('inbox_messages.body_en', err);
  }
}

/** Detect inbound language, store it on the lead, and attach an English gloss to the message. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyInboundLanguage(
  supabase: any,
  args: { leadId: string; body: string; messageSid?: string | null },
) {
  const text = String(args.body || '').trim();
  if (!text) return;

  const stored = await readLeadSmsLanguage(supabase, args.leadId);

  let recent: string[] = [];
  try {
    const { data } = await supabase
      .from('inbox_messages')
      .select('body')
      .eq('lead_id', args.leadId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(5);
    recent = (data ?? []).map((m: { body?: string }) => String(m.body || '')).filter(Boolean);
  } catch {
    recent = [];
  }

  const inspected = await inspectInboundSms({ text, recentInbound: recent, storedLang: stored });
  if (inspected.updateStored && inspected.lang) {
    await persistLeadLanguage(supabase, args.leadId, inspected.lang);
  }
  const glossLang = inspected.lang || stored;
  if (inspected.en && !sameSmsText(inspected.en, text)) {
    await persistMessageLanguage(supabase, {
      twilioSid: args.messageSid,
      leadId: args.leadId,
      bodyEn: inspected.en,
      lang: glossLang,
    });
  } else if (glossLang && glossLang !== 'en') {
    await persistMessageLanguage(supabase, {
      twilioSid: args.messageSid,
      leadId: args.leadId,
      lang: glossLang,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertInboxMessage(
  supabase: any,
  row: Record<string, unknown>,
  select = '*',
) {
  let res = await supabase.from('inbox_messages').insert(row).select(select).single();
  if (res.error && isMissingSchema(res.error)) {
    warnMissingSchema('inbox_messages.body_en', res.error);
    res = await supabase
      .from('inbox_messages')
      .insert(withoutLangCols(row))
      .select(withoutLangSelect(select))
      .single();
  }
  return res as { data: Record<string, unknown> | null; error: { message?: string } | null };
}

