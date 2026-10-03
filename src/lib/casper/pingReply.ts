import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { recordPingMessage, sendCasperPing } from '@/lib/casper/ping';

const PING_BRAIN = `You are Casper, Robert Gulinello's AI co-pilot at One Funding / Meadow Lake. You are texting ROBERT on his personal phone — not a merchant.

WHO YOU ARE
- His teammate. Short, direct, useful.
- You can talk about leads, follow-ups, calendar, underwriting, what needs him.
- You never invent funding, rates, or approvals.
- If you do not know, say so and offer to check the CRM.

TONE
- SMS length. One or two sentences unless he asked for a list.
- No emoji unless he uses them. No hype.

OUTPUT
JSON only:
{ "thinking": "internal note", "sms": "the text to send Robert" }`;

function parseSms(raw: string | null | undefined) {
  const text = (raw ?? '').trim();
  if (!text) return { thinking: '', sms: '' };
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { thinking?: string; sms?: string };
      return { thinking: String(parsed.thinking || ''), sms: String(parsed.sms || '').trim() };
    } catch {
      // fall through
    }
  }
  return { thinking: 'plain-text fallback', sms: text.slice(0, 320) };
}

export async function runCasperPingReply(
  supabase: { from: (table: string) => any },
  args: { userId: string; body: string; alreadyRecorded?: boolean; twilioSid?: string | null },
): Promise<{ replied: boolean; sms?: string; reason?: string }> {
  const inbound = args.body.trim();
  if (!inbound) return { replied: false, reason: 'empty' };

  if (!args.alreadyRecorded) {
    await recordPingMessage(supabase, {
      userId: args.userId,
      direction: 'inbound',
      body: inbound,
      kind: 'chat',
      status: 'received',
      twilioSid: args.twilioSid || null,
    });
  }

  const { data: thread } = await supabase
    .from('casper_ping_messages')
    .select('direction, body, created_at')
    .eq('user_id', args.userId)
    .order('created_at', { ascending: false })
    .limit(16);

  const history = (thread ?? [])
    .slice()
    .reverse()
    .map((m: { direction: string; body: string }) =>
      `${m.direction === 'outbound' ? 'Casper' : 'Robert'}: ${m.body}`,
    )
    .join('\n');

  let sms = '';
  try {
    const openai = getAIClient();
    const completion = await openai.chat.completions.create({
      model: GROK_MINI_MODEL,
      messages: [
        { role: 'system', content: PING_BRAIN },
        {
          role: 'user',
          content: `Thread:\n${history || '(new ping thread)'}\n\nRobert just texted: "${inbound}"`,
        },
      ],
    });
    const parsed = parseSms(completion.choices[0]?.message?.content);
    sms = parsed.sms;
  } catch (err) {
    console.error('[ping] reply', err);
    sms = 'Got it. I am here — try again in a minute if that did not land.';
  }

  if (!sms) sms = 'Got it.';

  const sent = await sendCasperPing(supabase, {
    userId: args.userId,
    body: sms,
    kind: 'chat',
    requireEnabled: false,
  });

  return { replied: sent.sent, sms, reason: sent.reason };
}

/** If Robert's last ping text has no Casper reply yet, answer it. */
export async function catchUpUnansweredPing(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<{ replied: boolean; sms?: string; reason?: string }> {
  const { data: last } = await supabase
    .from('casper_ping_messages')
    .select('id, direction, body, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last || last.direction !== 'inbound') return { replied: false, reason: 'none' };

  const age = Date.now() - new Date(last.created_at).getTime();
  if (age > 2 * 60 * 60 * 1000) return { replied: false, reason: 'stale' };

  const { data: recentOut } = await supabase
    .from('casper_ping_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .gte('created_at', new Date(Date.now() - 25_000).toISOString())
    .limit(1);
  if (recentOut?.length) return { replied: false, reason: 'busy' };

  return runCasperPingReply(supabase, {
    userId,
    body: last.body,
    alreadyRecorded: true,
  });
}
