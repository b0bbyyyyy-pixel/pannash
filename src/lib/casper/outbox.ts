import { casperEffectiveForLead } from '@/lib/casper/allow';
import { sweepStuckCasperRuns } from '@/lib/casper/burst';
import { mergeCapabilities, parseReplyDelay, type CasperPhase, type CasperReplyDelay } from '@/lib/casper/defaults';
import { leadInAiFullPacks } from '@/lib/casper/fullPacks';
import { checkCasperSms, lastGuardLine } from '@/lib/casper/rails';
import { logCasperRun, upsertCasperLeadState } from '@/lib/casper/runs';
import { CASPER_SENT_BY } from '@/lib/casper/sender';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { applySmsOptOutFromFailure, isSmsStopBody } from '@/lib/leads/dnc';
import { casperSmsToSend, isClearSmsDecline } from '@/lib/casper/smsGuard';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { getTwilioCreds, publicAppUrl } from '@/lib/telephony/twilio';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function outboxProcessorSecret() {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function outboxSelfUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return publicAppUrl();
}

/** Fire a new invocation so Vercel can wait out the delay (Hobby has no per-minute cron). */
export function kickOutboxPump(id: string) {
  const secret = outboxProcessorSecret();
  const url = `${outboxSelfUrl()}/api/casper/outbox`;
  if (!secret) {
    console.error('[casper] outbox pump skipped — no CRON_SECRET or service role');
    return;
  }
  void fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  }).catch(err => console.error('[casper] kick outbox pump', err));
}

export type CasperOutboxStatus = 'pending' | 'sent' | 'cancelled';

export type CasperOutboxRow = {
  id: string;
  user_id: string;
  lead_id: string;
  to_phone: string;
  body: string;
  send_at: string;
  status: CasperOutboxStatus;
  created_at: string;
  thinking?: string | null;
  actions?: unknown;
  phase?: string | null;
  input_summary?: string | null;
  model?: string | null;
  error?: string | null;
};

/** Random wait between the saved min/max, plus ~1s per 20 characters, capped at max. */
export function outboxDelayMs(text: string, delay?: CasperReplyDelay): number {
  const range = parseReplyDelay({
    reply_delay_min_sec: delay?.minSec,
    reply_delay_max_sec: delay?.maxSec,
  });
  const min = range.minSec * 1000;
  const max = range.maxSec * 1000;
  const base = min + Math.random() * Math.max(0, max - min);
  const typing = Math.floor(String(text || '').length / 20) * 1000;
  return Math.min(max, Math.round(base + typing));
}

/** @deprecated Use outboxDelayMs — replies are scheduled, not slept in-request. */
export function humanDelayMs(text: string) {
  return outboxDelayMs(text);
}

export function replyInLabel(sendAt: string, now = Date.now()): string {
  const ms = new Date(sendAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'Replying…';
  const m = Math.max(1, Math.round(ms / 60_000));
  return `Replying in ~${m}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cancelPendingOutbox(
  supabase: any,
  args: { leadId: string; userId?: string; exceptId?: string; reason?: string },
): Promise<number> {
  try {
    const patch: Record<string, unknown> = { status: 'cancelled' };
    if (args.reason) patch.error = args.reason;
    let q = supabase
      .from('casper_outbox')
      .update(patch)
      .eq('lead_id', args.leadId)
      .eq('status', 'pending');
    if (args.userId) q = q.eq('user_id', args.userId);
    if (args.exceptId) q = q.neq('id', args.exceptId);
    const { data, error } = await q.select('id, user_id, body');
    if (error) {
      console.error('[casper] cancel pending outbox', error);
      return 0;
    }
    const rows = data ?? [];
    if (args.reason && rows.length) {
      const userId = args.userId || rows[0].user_id;
      await logCasperRun(supabase, {
        userId,
        leadId: args.leadId,
        trigger: 'outbox',
        status: 'ok',
        actions: [{ type: 'sms', cancelled: true, reason: args.reason, result: `cancelled: ${args.reason}` }],
        error: args.reason,
        outputSummary: rows[0].body ?? null,
      });
    }
    return rows.length;
  } catch (err) {
    console.error('[casper] cancel pending outbox', err);
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPendingOutboxForLead(
  supabase: any,
  args: { userId: string; leadId: string },
): Promise<{ id: string; body: string; send_at: string; created_at: string } | null> {
  try {
    const { data, error } = await supabase
      .from('casper_outbox')
      .select('id, body, send_at, created_at')
      .eq('user_id', args.userId)
      .eq('lead_id', args.leadId)
      .eq('status', 'pending')
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export type EnqueueOutboxArgs = {
  userId: string;
  leadId: string;
  toPhone: string;
  body: string;
  thinking?: string | null;
  actions?: unknown[];
  phase?: string | null;
  inputSummary?: string | null;
  model?: string | null;
  sendAt?: string;
  burstStartedAt?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enqueueCasperOutbox(
  supabase: any,
  args: EnqueueOutboxArgs,
): Promise<{ id: string | null; sendAt: string; cancelled: number }> {
  const existing = await getPendingOutboxForLead(supabase, {
    userId: args.userId,
    leadId: args.leadId,
  });
  const cancelled = await cancelPendingOutbox(supabase, {
    leadId: args.leadId,
    userId: args.userId,
  });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('casper_capabilities')
    .eq('user_id', args.userId)
    .maybeSingle();
  const delay = parseReplyDelay(settings?.casper_capabilities);

  const delayMs = outboxDelayMs(args.body, delay);
  let sendAtMs = Date.now() + delayMs;
  if (args.burstStartedAt) {
    const burst = new Date(args.burstStartedAt).getTime();
    if (Number.isFinite(burst)) sendAtMs = Math.max(Date.now() + 2000, burst + delayMs);
  }
  if (args.sendAt) {
    const forced = new Date(args.sendAt).getTime();
    if (Number.isFinite(forced)) sendAtMs = forced;
  } else if (existing?.send_at) {
    const prev = new Date(existing.send_at).getTime();
    if (Number.isFinite(prev) && prev > Date.now()) sendAtMs = Math.min(sendAtMs, prev);
  }
  const sendAt = new Date(sendAtMs).toISOString();
  const row = {
    user_id: args.userId,
    lead_id: args.leadId,
    to_phone: args.toPhone,
    body: args.body,
    send_at: sendAt,
    status: 'pending' as const,
    thinking: args.thinking ?? null,
    actions: args.actions ?? [],
    phase: args.phase ?? null,
    input_summary: args.inputSummary ?? null,
    model: args.model ?? null,
  };

  const { data, error } = await supabase
    .from('casper_outbox')
    .insert(row)
    .select('id, send_at')
    .single();

  if (!error && data?.id) {
    return { id: data.id as string, sendAt: data.send_at as string, cancelled };
  }

  // Concurrent insert won the unique pending index — replace that row.
  if (error) {
    const { data: updated, error: updErr } = await supabase
      .from('casper_outbox')
      .update({
        to_phone: args.toPhone,
        body: args.body,
        send_at: sendAt,
        thinking: args.thinking ?? null,
        actions: args.actions ?? [],
        phase: args.phase ?? null,
        input_summary: args.inputSummary ?? null,
        model: args.model ?? null,
        error: null,
      })
      .eq('lead_id', args.leadId)
      .eq('user_id', args.userId)
      .eq('status', 'pending')
      .select('id, send_at')
      .maybeSingle();
    if (!updErr && updated?.id) {
      return { id: updated.id as string, sendAt: updated.send_at as string, cancelled };
    }
    console.error('[casper] enqueue outbox', error, updErr);
  }

  return { id: null, sendAt, cancelled };
}

type GateResult = { ok: true } | { ok: false; reason: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function outboxStillAllowed(supabase: any, row: CasperOutboxRow): Promise<GateResult> {
  const [{ data: settings }, { data: lead }] = await Promise.all([
    supabase
      .from('user_settings')
      .select('casper_enabled, casper_capabilities')
      .eq('user_id', row.user_id)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('id, list_id, casper_enabled, sms_opt_out')
      .eq('id', row.lead_id)
      .maybeSingle(),
  ]);

  if (!lead) return { ok: false, reason: 'lead_missing' };

  if (!casperEffectiveForLead(!!settings?.casper_enabled, lead.casper_enabled)) {
    return { ok: false, reason: lead.casper_enabled === false ? 'lead_off' : 'global_off' };
  }
  if (lead.sms_opt_out) return { ok: false, reason: 'opt_out' };

  const { data: lastIn } = await supabase
    .from('inbox_messages')
    .select('body, created_at')
    .eq('lead_id', row.lead_id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastIn && isSmsStopBody(lastIn.body)) return { ok: false, reason: 'opt_out' };
  if (lastIn && isClearSmsDecline(lastIn.body)) return { ok: false, reason: 'declined' };
  if (!casperSmsToSend(row.body)) return { ok: false, reason: 'no_sms' };

  // Newer inbound than this draft — inbound handler should have replaced us.
  if (lastIn && new Date(lastIn.created_at).getTime() > new Date(row.created_at).getTime() + 2000) {
    return { ok: false, reason: 'stale_superseded' };
  }

  if (await leadInAiFullPacks(supabase, {
    userId: row.user_id,
    leadId: row.lead_id,
    listId: lead.list_id,
  })) {
    return { ok: false, reason: 'ai_full_packs' };
  }

  const caps = mergeCapabilities(settings?.casper_capabilities);
  if (!caps.chat_sms) return { ok: false, reason: 'chat_sms_off' };

  return { ok: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markOutbox(
  supabase: any,
  id: string,
  status: CasperOutboxStatus,
  error?: string | null,
) {
  const patch: Record<string, unknown> = { status };
  if (error !== undefined) patch.error = error;
  await supabase.from('casper_outbox').update(patch).eq('id', id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearReplyingIfIdle(supabase: any, row: CasperOutboxRow, handedOff?: boolean) {
  const { data: still } = await supabase
    .from('casper_outbox')
    .select('id')
    .eq('lead_id', row.lead_id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();
  if (still) return;

  const phase = (row.phase as CasperPhase) || 'chatting';
  await upsertCasperLeadState(supabase, {
    leadId: row.lead_id,
    userId: row.user_id,
    phase,
    pausedReason: handedOff || phase === 'handed_off' ? 'handed_off' : null,
  });
}

function sameSmsBody(a: string, b: string) {
  return String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();
}

/** First writer to flip pending → sent owns the Twilio send. Others no-op. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function claimPendingOutbox(supabase: any, id: string): Promise<CasperOutboxRow | null> {
  const { data, error } = await supabase
    .from('casper_outbox')
    .update({ status: 'sent' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[casper] claim outbox', error);
    return null;
  }
  return (data as CasperOutboxRow) || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recentlySentSameSms(supabase: any, row: CasperOutboxRow): Promise<boolean> {
  const since = new Date(Date.now() - 180_000).toISOString();
  const { data } = await supabase
    .from('inbox_messages')
    .select('body')
    .eq('lead_id', row.lead_id)
    .eq('direction', 'outbound')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(8);
  return (data ?? []).some((m: { body?: string }) => sameSmsBody(String(m.body || ''), row.body));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendOneOutbox(supabase: any, raw: CasperOutboxRow): Promise<{ sent: boolean; reason?: string }> {
  const row = await claimPendingOutbox(supabase, raw.id);
  if (!row) return { sent: false, reason: 'already_claimed' };

  const gate = await outboxStillAllowed(supabase, row);
  if (!gate.ok) {
    await markOutbox(supabase, row.id, 'cancelled', gate.reason);
    await logCasperRun(supabase, {
      userId: row.user_id,
      leadId: row.lead_id,
      trigger: 'outbox',
      status: 'ok',
      thinking: row.thinking,
      actions: [...(Array.isArray(row.actions) ? row.actions : []), { type: 'sms', cancelled: true, reason: gate.reason, result: `blocked: ${gate.reason}` }],
      model: row.model,
      inputSummary: row.input_summary,
      outputSummary: row.body,
      error: gate.reason,
    });
    await clearReplyingIfIdle(supabase, row, row.phase === 'handed_off');
    return { sent: false, reason: gate.reason };
  }

  const rails = await checkCasperSms(supabase, {
    userId: row.user_id,
    leadId: row.lead_id,
    toPhone: row.to_phone,
    body: row.body,
    initiatedBy: 'merchant_reply',
    thinking: row.thinking,
  });
  if (!rails.ok) {
    await markOutbox(supabase, row.id, 'cancelled', rails.blocked);
    await logCasperRun(supabase, {
      userId: row.user_id,
      leadId: row.lead_id,
      trigger: 'outbox',
      status: 'ok',
      thinking: row.thinking,
      actions: [
        ...(Array.isArray(row.actions) ? row.actions : []),
        ...rails.results.filter(r => r.result).map(r => ({ type: 'rail', result: r.result })),
        { type: 'sms', cancelled: true, reason: rails.blocked },
      ],
      model: row.model,
      inputSummary: row.input_summary,
      outputSummary: rails.body,
      error: rails.blocked,
      stage: rails.stage,
      guardResults: rails.results,
    });
    await clearReplyingIfIdle(supabase, row, row.phase === 'handed_off');
    return { sent: false, reason: rails.blocked || 'blocked' };
  }
  if (rails.rescheduleTo && new Date(rails.rescheduleTo).getTime() > Date.now() + 5000) {
    await supabase.from('casper_outbox').update({
      status: 'pending',
      send_at: rails.rescheduleTo,
      body: rails.body,
      error: lastGuardLine(rails.results),
    }).eq('id', row.id);
    kickOutboxPump(row.id);
    await logCasperRun(supabase, {
      userId: row.user_id,
      leadId: row.lead_id,
      trigger: 'outbox',
      status: 'ok',
      thinking: row.thinking,
      actions: [
        ...(Array.isArray(row.actions) ? row.actions : []),
        ...rails.results.filter(r => r.result).map(r => ({ type: 'rail', result: r.result })),
      ],
      error: lastGuardLine(rails.results),
      stage: rails.stage,
      guardResults: rails.results,
      outputSummary: rails.body,
    });
    return { sent: false, reason: lastGuardLine(rails.results) || 'rescheduled' };
  }
  row.body = rails.body;

  const creds = await getTwilioCreds(supabase, row.user_id);
  if (!creds) {
    await markOutbox(supabase, row.id, 'cancelled', 'no_twilio');
    await logCasperRun(supabase, {
      userId: row.user_id,
      leadId: row.lead_id,
      trigger: 'outbox',
      status: 'error',
      thinking: row.thinking,
      actions: Array.isArray(row.actions) ? row.actions : [],
      model: row.model,
      inputSummary: row.input_summary,
      outputSummary: row.body,
      error: 'No Twilio connection',
    });
    await clearReplyingIfIdle(supabase, row, row.phase === 'handed_off');
    return { sent: false, reason: 'no_twilio' };
  }

  if (await recentlySentSameSms(supabase, row)) {
    await markOutbox(supabase, row.id, 'cancelled', 'duplicate_body');
    await logCasperRun(supabase, {
      userId: row.user_id,
      leadId: row.lead_id,
      trigger: 'outbox',
      status: 'ok',
      thinking: row.thinking,
      actions: [...(Array.isArray(row.actions) ? row.actions : []), { type: 'sms', cancelled: true, reason: 'duplicate_body' }],
      model: row.model,
      inputSummary: row.input_summary,
      outputSummary: row.body,
      error: 'duplicate_body',
    });
    await clearReplyingIfIdle(supabase, row, row.phase === 'handed_off');
    return { sent: false, reason: 'duplicate_body' };
  }

  let sid: string | null = null;
  let sendStatus: 'sent' | 'failed' = 'sent';
  let sendError: string | null = null;
  try {
    const sent = await sendTwilioSms(creds, row.to_phone, row.body);
    sid = sent.sid;
    if (sent.status === 'failed') {
      sendStatus = 'failed';
      sendError = sent.error ?? 'Send failed';
    }
  } catch (err) {
    sendStatus = 'failed';
    sendError = err instanceof Error ? err.message : 'Send failed';
  }
  await applySmsOptOutFromFailure(supabase, {
    userId: row.user_id,
    phone: row.to_phone,
    leadId: row.lead_id,
    error: sendError,
  });

  await recordOutboundInboxSms(supabase, {
    userId: row.user_id,
    leadId: row.lead_id,
    toPhone: row.to_phone,
    body: row.body,
    twilioSid: sid,
    status: sendStatus,
    errorMessage: sendError,
    sentBy: CASPER_SENT_BY,
  });

  const actions = [
    ...(Array.isArray(row.actions) ? row.actions : []),
    { type: 'sms', sid, status: sendStatus, error: sendError },
  ];

  await logCasperRun(supabase, {
    userId: row.user_id,
    leadId: row.lead_id,
    trigger: 'outbox',
    status: sendStatus === 'failed' ? 'error' : 'ok',
    thinking: row.thinking,
    actions,
    model: row.model,
    inputSummary: row.input_summary,
    outputSummary: row.body,
    error: sendError,
  });

  if (sendStatus === 'failed') {
    await markOutbox(supabase, row.id, 'cancelled', sendError);
    await clearReplyingIfIdle(supabase, row, row.phase === 'handed_off');
    return { sent: false, reason: sendError || 'send_failed' };
  }

  await clearReplyingIfIdle(supabase, row, row.phase === 'handed_off');
  return { sent: true };
}

/** Wait until send_at (in ≤40s slices) then send. Returns hop=true if another invocation should continue. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pumpCasperOutboxRow(
  supabase: any,
  id: string,
): Promise<{ sent?: boolean; hop?: boolean; reason?: string }> {
  const { data: raw } = await supabase.from('casper_outbox').select('*').eq('id', id).maybeSingle();
  if (!raw || raw.status !== 'pending') return { reason: raw?.status || 'missing' };
  const row = raw as CasperOutboxRow;
  const wait = new Date(row.send_at).getTime() - Date.now();
  if (wait > 1000) {
    await sleep(Math.min(wait, 40_000));
    const { data: again } = await supabase
      .from('casper_outbox')
      .select('id, status, send_at')
      .eq('id', id)
      .maybeSingle();
    if (!again || again.status !== 'pending') return { reason: again?.status || 'missing' };
    if (new Date(again.send_at).getTime() - Date.now() > 1000) return { hop: true };
  }
  const result = await sendOneOutbox(supabase, row);
  return { sent: result.sent, reason: result.reason };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processDueCasperOutbox(
  supabase: any,
  userId?: string,
): Promise<{ processed: number; sent: number; cancelled: number }> {
  const now = new Date().toISOString();
  let q = supabase
    .from('casper_outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .order('send_at', { ascending: true })
    .limit(25);
  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) {
    console.error('[casper] process outbox', error);
    return { processed: 0, sent: 0, cancelled: 0 };
  }

  await sweepStuckCasperRuns(supabase, userId);

  let sent = 0;
  let cancelled = 0;
  for (const row of (data ?? []) as CasperOutboxRow[]) {
    try {
      const result = await sendOneOutbox(supabase, row);
      if (result.sent) sent += 1;
      else cancelled += 1;
    } catch (err) {
      console.error('[casper] send outbox', row.id, err);
      cancelled += 1;
    }
  }

  return { processed: (data ?? []).length, sent, cancelled };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextPendingOutboxAt(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('casper_outbox')
      .select('send_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('send_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.send_at ?? null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPendingOutbox(supabase: any, userId: string) {
  let { data, error } = await supabase
    .from('casper_outbox')
    .select('id, lead_id, to_phone, body, send_at, created_at, leads(name, company)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('send_at', { ascending: true })
    .limit(50);

  if (error) {
    const fallback = await supabase
      .from('casper_outbox')
      .select('id, lead_id, to_phone, body, send_at, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('send_at', { ascending: true })
      .limit(50);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    console.error('[casper] list pending outbox', error);
    return [];
  }

  const rows = data ?? [];
  const leadIds = [...new Set(rows.map((r: { lead_id: string }) => r.lead_id).filter(Boolean))];
  const names = new Map<string, { name: string; company: string | null }>();
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, company')
      .in('id', leadIds);
    for (const lead of leads ?? []) {
      names.set(lead.id, { name: lead.name || 'Lead', company: lead.company ?? null });
    }
  }

  return rows.map((row: {
    id: string;
    lead_id: string;
    to_phone: string;
    body: string;
    send_at: string;
    created_at: string;
    leads?: { name?: string | null; company?: string | null } | { name?: string | null; company?: string | null }[] | null;
  }) => {
    const embedded = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    const lookup = names.get(row.lead_id);
    return {
      id: row.id,
      lead_id: row.lead_id,
      to_phone: row.to_phone,
      body: row.body,
      send_at: row.send_at,
      created_at: row.created_at,
      lead_name: lookup?.name || embedded?.name || 'Lead',
      company: lookup?.company ?? embedded?.company ?? null,
    };
  });
}
