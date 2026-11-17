import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { CONV_COLS, CONV_COLS_MIN, asRows, selectFirst } from '@/lib/leads/listColumns';
import { isSmsStopBody } from '@/lib/leads/dnc';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { isAttachmentPlaceholder } from '@/lib/inbox/outboundMms';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Msg = { lead_id: string; direction: string; body: string; created_at: string; sent_by?: string | null };
type Person = {
  leadId: string;
  name: string;
  company: string | null;
  phone: string;
  lastMessageAt: string | null;
  lastDirection: 'inbound' | 'outbound' | null;
  action: 'reply' | 'follow_up';
  reason: string;
};

const SKIP_STATUSES = new Set(['dnc', 'do not contact', 'dead', 'not interested']);
const SKIP_FOLLOW_STATUSES = new Set(['funded', 'closed']);

function clip(s: string, n = 160) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function hoursAgo(iso: string | null | undefined) {
  if (!iso) return 9999;
  const n = Date.parse(iso);
  if (Number.isNaN(n)) return 9999;
  return (Date.now() - n) / 3_600_000;
}

function looksLikeQuestion(body: string) {
  const t = body.toLowerCase();
  return /[?]/.test(t) || /\b(can you|could you|let me know|did you|have you|what(?:'s| is)|when|how much|please (?:send|call|text))\b/.test(t);
}

function looksLikePromise(body: string) {
  return /\b(i(?:['’]ll| will)|let me (?:check|look|send|get)|get back|circle back|send (?:you|it|over)|call you)\b/i.test(body);
}

function scoreThread(args: {
  lastDirection: string | null;
  lastAt: string | null;
  unread: number;
  lastInbound?: string;
  lastOutbound?: string;
  theyReplied: boolean;
}) {
  let score = 0;
  const hours = hoursAgo(args.lastAt);
  if (args.lastDirection === 'inbound') {
    score += 90;
    if (looksLikeQuestion(args.lastInbound || '')) score += 35;
    if (hours >= 1) score += 10;
    if (hours >= 4) score += 15;
    if (hours >= 12) score += 20;
    if (hours >= 36) score += 15;
    if (hours > 24 * 30) score -= 40;
    if (args.unread > 0) score += 12;
  } else if (args.theyReplied) {
    if (looksLikePromise(args.lastOutbound || '')) score += 45;
    if (hours >= 18) score += 20;
    if (hours >= 48) score += 18;
    if (hours >= 168) score += 8;
    if (hours > 24 * 45) score -= 25;
  }
  return score;
}

function parseCleared(raw: unknown) {
  if (!Array.isArray(raw)) return new Map<string, string>();
  const map = new Map<string, string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const leadId = String(r.leadId ?? r.lead_id ?? '').trim();
    const at = String(r.at ?? '').trim();
    if (leadId && at && !Number.isNaN(Date.parse(at))) map.set(leadId, at);
  }
  return map;
}

function isClearedLead(
  conv: Record<string, unknown>,
  cleared: Map<string, string>,
) {
  const at = cleared.get(String(conv.lead_id ?? ''));
  if (!at) return false;
  const inbound = String(conv.last_inbound_at ?? '')
    || (conv.last_direction === 'inbound' ? String(conv.last_message_at ?? '') : '');
  if (!inbound) return true;
  const inboundMs = Date.parse(inbound);
  const clearedMs = Date.parse(at);
  if (Number.isNaN(inboundMs) || Number.isNaN(clearedMs)) return true;
  return inboundMs <= clearedMs;
}

function parsePeople(raw: string): { leadId: string; reason: string; action: string }[] {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { people?: unknown };
    if (!Array.isArray(obj.people)) return [];
    return obj.people
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const leadId = String(r.leadId ?? r.lead_id ?? '').trim();
        if (!leadId) return null;
        return {
          leadId,
          reason: String(r.reason ?? '').trim(),
          action: String(r.action ?? '').trim(),
        };
      })
      .filter(Boolean) as { leadId: string; reason: string; action: string }[];
  } catch {
    return [];
  }
}

export async function GET() {
  return runWhoToText([]);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return runWhoToText(parseCleared((body as { cleared?: unknown }).cleared));
}

async function runWhoToText(cleared: Map<string, string>) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );

    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const convRes = await selectFirst([
      () => supabase
        .from('inbox_conversations')
        .select(CONV_COLS)
        .eq('user_id', user.id)
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(180),
      () => supabase
        .from('inbox_conversations')
        .select(CONV_COLS_MIN)
        .eq('user_id', user.id)
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(180),
    ]);
    const convs = asRows(convRes.data).filter((c) => !isSmsStopBody(String(c.last_message_preview ?? '')));
    if (!convs.length) return NextResponse.json({ people: [] });

    const leadIds = [...new Set(convs.map((c) => String(c.lead_id ?? '')).filter(Boolean))];
    const leadsById = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < leadIds.length; i += 80) {
      const chunk = leadIds.slice(i, i + 80);
      const { data } = await supabase
        .from('leads')
        .select('id, name, company, phone, lead_status, sms_opt_out')
        .eq('user_id', user.id)
        .in('id', chunk);
      for (const row of data ?? []) {
        leadsById.set(String((row as { id: string }).id), row as Record<string, unknown>);
      }
    }

    const eligible = convs.filter((c) => {
      const lead = leadsById.get(String(c.lead_id ?? ''));
      if (!lead) return false;
      if (lead.sms_opt_out) return false;
      if (isClearedLead(c, cleared)) return false;
      const status = String(lead.lead_status ?? '').trim().toLowerCase();
      if (SKIP_STATUSES.has(status)) return false;
      if (c.last_direction !== 'inbound' && SKIP_FOLLOW_STATUSES.has(status)) return false;
      return true;
    });

    const pre = eligible
      .map((c) => {
        const lastDirection = (c.last_direction === 'inbound' || c.last_direction === 'outbound')
          ? c.last_direction
          : null;
        return {
          conv: c,
          score: scoreThread({
            lastDirection,
            lastAt: String(c.last_message_at ?? ''),
            unread: Number(c.unread_count) || 0,
            lastInbound: lastDirection === 'inbound' ? String(c.last_message_preview ?? '') : '',
            lastOutbound: lastDirection === 'outbound' ? String(c.last_message_preview ?? '') : '',
            theyReplied: Boolean(c.last_inbound_at) || lastDirection === 'inbound',
          }),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);

    const msgsByLead = new Map<string, Msg[]>();
    const fetchIds = pre.map((p) => String(p.conv.lead_id));
    for (let i = 0; i < fetchIds.length; i += 12) {
      const chunk = fetchIds.slice(i, i + 12);
      await Promise.all(chunk.map(async (leadId) => {
        const { data } = await supabase
          .from('inbox_messages')
          .select('lead_id, direction, body, created_at, sent_by')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(8);
        const rows = ((data ?? []) as Msg[]).slice().reverse();
        msgsByLead.set(leadId, rows);
      }));
    }

    const ranked = pre.map(({ conv, score }) => {
      const leadId = String(conv.lead_id);
      const lead = leadsById.get(leadId)!;
      const msgs = msgsByLead.get(leadId) ?? [];
      const last = msgs[msgs.length - 1];
      const lastInbound = [...msgs].reverse().find((m) => m.direction === 'inbound');
      const lastOutbound = [...msgs].reverse().find((m) => m.direction === 'outbound');
      const lastDirection = (last?.direction === 'inbound' || last?.direction === 'outbound')
        ? last.direction
        : (conv.last_direction === 'inbound' || conv.last_direction === 'outbound' ? conv.last_direction : null);
      const nextScore = scoreThread({
        lastDirection,
        lastAt: last?.created_at || String(conv.last_message_at ?? ''),
        unread: Number(conv.unread_count) || 0,
        lastInbound: lastInbound?.body,
        lastOutbound: lastOutbound?.body,
        theyReplied: msgs.some((m) => m.direction === 'inbound'),
      });
      const action: Person['action'] = lastDirection === 'inbound' ? 'reply' : 'follow_up';
      const fallbackReason = action === 'reply'
        ? (looksLikeQuestion(lastInbound?.body || '')
          ? 'They asked a question and you have not texted back.'
          : 'They texted you and the thread is waiting on your reply.')
        : 'This conversation went quiet after you last texted.';
      return {
        person: {
          leadId,
          name: String(lead.name || '').trim() || 'Unknown',
          company: (lead.company ? String(lead.company) : null),
          phone: String(lead.phone || ''),
          lastMessageAt: last?.created_at || (conv.last_message_at ? String(conv.last_message_at) : null),
          lastDirection,
          action,
          reason: fallbackReason,
        } satisfies Person,
        score: nextScore,
        transcript: msgs
          .map((m) => {
            const body = isAttachmentPlaceholder(m.body) ? '[attachment]' : clip(m.body, 140);
            const who = m.direction === 'inbound' ? 'Them' : 'You';
            return `${who}: ${body}`;
          })
          .join('\n'),
      };
    }).sort((a, b) => b.score - a.score);

    const heuristicTop = ranked.filter((r) => r.score > 0).slice(0, 10);
    const pool = heuristicTop.length ? heuristicTop : ranked.slice(0, 10);
    if (!pool.length) return NextResponse.json({ people: [] });

    let people = pool.slice(0, 10).map((r) => r.person);
    try {
      const openai = getAIClient();
      const digest = pool.slice(0, 36).map((r, i) => (
        `#${i + 1} leadId=${r.person.leadId}
name=${r.person.name}${r.person.company ? ` (${r.person.company})` : ''}
last=${r.person.lastDirection || 'unknown'} ${Math.round(hoursAgo(r.person.lastMessageAt))}h ago
thread:
${r.transcript || '(no recent messages)'}`
      )).join('\n\n');

      const completion = await openai.chat.completions.create({
        model: GROK_MINI_MODEL,
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You help an MCA broker remember who to text. Pick the TOP 10 people who need a reply or a follow-up now.
Prioritize:
1. They texted last and he has not answered — especially questions, docs, rates, timing, or "did you get this"
2. He promised to get back / send something / check and then went quiet
3. A real conversation stalled after interest
Skip: STOP/DNC, empty thanks-and-bye with nothing needed, cold blasts that never replied, already fully handled.
Return JSON: {"people":[{"leadId":"...","action":"reply"|"follow_up","reason":"one short sentence"}]}
Use only leadIds from the digest. Reasons must be specific to that thread, not generic.`,
          },
          { role: 'user', content: digest },
        ],
      });
      const picked = parsePeople(completion.choices[0]?.message?.content || '');
      const byId = new Map(ranked.map((r) => [r.person.leadId, r.person]));
      const seen = new Set<string>();
      const fromAi: Person[] = [];
      for (const row of picked) {
        const person = byId.get(row.leadId);
        if (!person || seen.has(row.leadId)) continue;
        seen.add(row.leadId);
        fromAi.push({
          ...person,
          action: row.action === 'follow_up' ? 'follow_up' : 'reply',
          reason: clip(row.reason || person.reason, 180),
        });
        if (fromAi.length >= 10) break;
      }
      if (fromAi.length) {
        for (const r of pool) {
          if (fromAi.length >= 10) break;
          if (seen.has(r.person.leadId)) continue;
          fromAi.push(r.person);
        }
        people = fromAi.slice(0, 10);
      }
    } catch {
      // Heuristic ranking still returns a useful list if Grok is down.
    }

    return NextResponse.json({ people });
  } catch (err) {
    console.error('[inbox/who-to-text]', err);
    return NextResponse.json({ error: 'Could not scan texts' }, { status: 500 });
  }
}
