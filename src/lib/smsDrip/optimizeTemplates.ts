import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { classifyReply } from '@/lib/smsDrip/classifyReply';
import {
  isFullPacksSource,
  isOptimizedPack,
  optimizedPackId,
  optimizedPackName,
  type LeadSource,
} from '@/lib/smsDrip/leadSources';

export const OPTIMIZED_PACK_ID = 'optimized';
export const OPTIMIZED_PACK_NAME = 'Optimized';
export { isOptimizedPack };

export type OptimizedPack = {
  id: string;
  name: string;
  templates: string[];
  reasoning?: string;
  logic?: string[];
  generatedAt?: string;
  days?: number;
  sourceKey?: string;
  sourceLabel?: string;
};

export type OptimizeBriefing = {
  days: number;
  sourceKey?: string;
  sourceLabel?: string;
  sent?: number;
  replies?: number;
  replyRate?: number;
  optOuts?: number;
  mix?: { positive: number; negative: number; opt_out: number; other: number };
  templates?: {
    preview: string;
    sent: number;
    replies: number;
    optOuts: number;
    replyRate: number;
  }[];
  topIndustries?: { industry: string; replies: number; share: number }[];
  topStates?: { state?: string; label: string; replies: number; share: number }[];
  replyTimes?: {
    peakHour?: { label: string } | null;
    peakWindow?: { label: string } | null;
    peakDay?: { label: string } | null;
    bestSendHours?: { label: string; replyRate: number; sent: number; replies: number }[];
  } | null;
  samples?: { positive: string[]; negative: string[]; opt_out: string[] };
};

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

function clipList(items: string[], n: number) {
  return [...new Set(items.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, n);
}

export function briefingFromInsights(
  insights: Record<string, unknown>,
  extra?: { samples?: OptimizeBriefing['samples']; source?: LeadSource | null },
): OptimizeBriefing {
  const mix = insights.mix && typeof insights.mix === 'object'
    ? insights.mix as OptimizeBriefing['mix']
    : undefined;
  const templates = Array.isArray(insights.templates)
    ? (insights.templates as OptimizeBriefing['templates'])
    : [];
  return {
    days: Number(insights.days) || 30,
    sourceKey: String(insights.sourceKey || extra?.source?.key || '').trim() || undefined,
    sourceLabel: String(insights.sourceLabel || extra?.source?.label || '').trim() || undefined,
    sent: Number(insights.sent) || 0,
    replies: Number(insights.replies) || 0,
    replyRate: Number(insights.replyRate) || 0,
    optOuts: Number(insights.optOuts) || 0,
    mix,
    templates: (templates || []).slice(0, 8),
    topIndustries: Array.isArray(insights.topIndustries)
      ? (insights.topIndustries as OptimizeBriefing['topIndustries'])?.slice(0, 5)
      : [],
    topStates: Array.isArray(insights.topStates)
      ? (insights.topStates as OptimizeBriefing['topStates'])?.slice(0, 5)
      : [],
    replyTimes: (insights.replyTimes as OptimizeBriefing['replyTimes']) || null,
    samples: extra?.samples,
  };
}

export function emptyOptimizedPack(source?: LeadSource | null): OptimizedPack {
  const key = source?.key || '';
  const label = source?.label || '';
  return {
    id: optimizedPackId(key),
    name: optimizedPackName(label),
    templates: ['', '', '', '', ''],
    sourceKey: key || undefined,
    sourceLabel: label || undefined,
  };
}

export function upsertOptimizedPack<T extends { id: string; name: string; templates: string[] }>(
  packs: T[],
  optimized: OptimizedPack,
): (T | OptimizedPack)[] {
  const id = optimized.id || OPTIMIZED_PACK_ID;
  const rest = packs.filter(p => p.id !== id);
  return [...rest, { ...optimized, id, name: optimized.name || OPTIMIZED_PACK_NAME }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function collectReplySamples(
  supabase: any,
  userId: string,
  leadIds?: Set<string> | null,
) {
  const samples = { positive: [] as string[], negative: [] as string[], opt_out: [] as string[] };
  try {
    let q = supabase
      .from('inbox_conversations')
      .select('lead_id, last_message_preview, last_direction, last_inbound_at')
      .eq('user_id', userId)
      .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(leadIds?.size ? 1200 : 400);
    const { data } = await q;
    for (const row of data ?? []) {
      if (leadIds && leadIds.size && row.lead_id && !leadIds.has(row.lead_id)) continue;
      const preview = String(row.last_message_preview || '').trim();
      if (!preview) continue;
      const tone = classifyReply(preview);
      if (tone === 'positive' && samples.positive.length < 8) samples.positive.push(preview.slice(0, 140));
      else if (tone === 'negative' && samples.negative.length < 8) samples.negative.push(preview.slice(0, 140));
      else if (tone === 'opt_out' && samples.opt_out.length < 8) samples.opt_out.push(preview.slice(0, 140));
      if (samples.positive.length >= 8 && samples.negative.length >= 8 && samples.opt_out.length >= 8) break;
    }
  } catch {
    // keep empty samples
  }
  return samples;
}

export async function generateOptimizedSms(briefing: OptimizeBriefing): Promise<OptimizedPack> {
  const openai = getAIClient();
  const sourceLabel = briefing.sourceLabel || 'this lead source';
  const fullPacks = isFullPacksSource({ key: briefing.sourceKey || '', label: sourceLabel });
  const mix = briefing.mix;
  const mixTotal = mix ? mix.positive + mix.negative + mix.opt_out + mix.other : 0;
  const mixLine = mix && mixTotal
    ? `Reply mix: positive ${mix.positive}, negative ${mix.negative}, opt-out ${mix.opt_out}, other ${mix.other}`
    : 'Reply mix: unknown';
  const tplLines = (briefing.templates || [])
    .map(t => `- ${t.replyRate}% reply · ${t.optOuts} opt-outs · ${t.sent} sent · ${t.preview}`)
    .join('\n') || '(none recorded)';
  const hours = briefing.replyTimes?.bestSendHours
    ?.slice(0, 3)
    .map(h => `${h.label} (${h.replyRate}% of ${h.sent})`)
    .join(', ') || '(none)';

  const completion = await openai.chat.completions.create({
    model: GROK_MINI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You write MCA (merchant cash advance) cold SMS drip openers for ONE lead source only: ${sourceLabel}.
Goal: maximize interested replies about funding from THIS source; minimize STOP / unsubscribe / "not interested".
JSON only.
Use only the performance data in the user message. Do not borrow tactics from other lead sources.
${fullPacks
  ? 'This source uses underwriter / bank-statement language. Every SMS must mention funding, underwriting, or bank statements in the first two lines.'
  : 'Match the tone of THIS source\'s best-performing openers. Do not switch to underwriter, bank-statement, or "reviewing you for funding" language unless those exact openers already won on THIS source. Still make a clear business-funding ask — no generic hello or "how\'s it going".'}
Never say "working capital". Do not promise they are approved. Do not invent rates, dollar amounts, or a persona last name.
Keep each SMS under 240 characters. Use {first_name} and {company} where natural. Optional {city} {state}.
Sound like a person texting, not a blast. One clear question. No all-caps, no stacked emojis, no "limited time".
Do not include STOP language (it invites opt-outs).
Return 5 variants the drip can pick at random.`,
      },
      {
        role: 'user',
        content: `Last ${briefing.days} days for ${sourceLabel} only — not other lead sources:
Sent ${briefing.sent ?? 0}, replied ${briefing.replies ?? 0} (${briefing.replyRate ?? 0}%), opted out ${briefing.optOuts ?? 0}.
${mixLine}
Peak replies: ${briefing.replyTimes?.peakHour?.label || 'n/a'} · ${briefing.replyTimes?.peakWindow?.label || ''} · ${briefing.replyTimes?.peakDay?.label || ''}
Best hours to text: ${hours}
Top industries: ${(briefing.topIndustries || []).map(i => i.industry).join(', ') || 'n/a'}
Top states: ${(briefing.topStates || []).map(s => s.label).join(', ') || 'n/a'}

Opening texts by performance on this source:
${tplLines}

Sample positive replies: ${JSON.stringify(clipList(briefing.samples?.positive || [], 8))}
Sample negative replies: ${JSON.stringify(clipList(briefing.samples?.negative || [], 8))}
Sample STOP/opt-out replies: ${JSON.stringify(clipList(briefing.samples?.opt_out || [], 8))}

${fullPacks
  ? 'Each template must include funding, underwriting, or bank statement(s).'
  : 'Stay in this source\'s voice. Do not copy underwriter scripts from other sources.'}

Return JSON:
{"reasoning":"what the last ${briefing.days} days show for ${sourceLabel} and what you changed, 3-6 sentences",
"logic":["specific data-backed bullet","..."],
"templates":["sms 1","sms 2","sms 3","sms 4","sms 5"]}`,
      },
    ],
    temperature: 0.45,
    max_tokens: 900,
  });

  const parsed = parseJsonObject(completion.choices[0]?.message?.content);
  const templates = Array.isArray(parsed?.templates)
    ? (parsed.templates as unknown[])
      .map(t => String(t || '').trim())
      .filter(t => {
        if (!t) return false;
        if (!fullPacks) return true;
        return /funding|underwrit|bank statement/i.test(t);
      })
      .slice(0, 8)
    : [];
  if (templates.length < 1) {
    throw new Error('Could not write optimized texts');
  }
  while (templates.length < 5) templates.push('');
  const logic = Array.isArray(parsed?.logic)
    ? (parsed.logic as unknown[]).map(t => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const reasoning = String(parsed?.reasoning || '').trim()
    || `Wrote texts from recent ${sourceLabel} reply and opt-out rates.`;

  return {
    id: optimizedPackId(briefing.sourceKey),
    name: optimizedPackName(sourceLabel),
    templates,
    reasoning,
    logic,
    generatedAt: new Date().toISOString(),
    days: briefing.days,
    sourceKey: briefing.sourceKey,
    sourceLabel,
  };
}
