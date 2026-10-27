import { parseReplyDelay } from '@/lib/casper/defaults';
import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function settleSeconds(capabilities?: unknown) {
  const envRaw = Number(process.env.CASPER_SETTLE_SEC);
  const env = Number.isFinite(envRaw) ? envRaw : 25;
  const minDelay = parseReplyDelay(capabilities).minSec;
  const upper = Math.min(40, minDelay);
  return Math.round(Math.min(upper, Math.max(8, env)));
}

function rpcMissing(err: unknown) {
  return isMissingSchema(err);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function noteInbound(
  supabase: any,
  args: { leadId: string; userId: string; capabilities?: unknown },
): Promise<string | null> {
  const settle = settleSeconds(args.capabilities);
  try {
    const { data, error } = await supabase.rpc('casper_note_inbound', {
      p_lead: args.leadId,
      p_user: args.userId,
      p_settle_sec: settle,
      p_max_settle_sec: 75,
    });
    if (error) {
      if (rpcMissing(error)) warnMissingSchema('casper_note_inbound', error);
      else console.error('[casper] note inbound', error);
      return null;
    }
    return data ? String(data) : null;
  } catch (err) {
    if (rpcMissing(err)) warnMissingSchema('casper_note_inbound', err);
    else console.error('[casper] note inbound', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tryCasperLock(
  supabase: any,
  args: { leadId: string; userId: string; ttlSec?: number },
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('casper_try_lock', {
      p_lead: args.leadId,
      p_user: args.userId,
      p_ttl_sec: args.ttlSec ?? 90,
    });
    if (error) {
      if (rpcMissing(error)) warnMissingSchema('casper_try_lock', error);
      else console.error('[casper] try lock', error);
      return null;
    }
    return data ? String(data) : null;
  } catch (err) {
    if (rpcMissing(err)) warnMissingSchema('casper_try_lock', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimCasperRun(
  supabase: any,
  args: { leadId: string; token: string },
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('casper_claim_run', {
      p_lead: args.leadId,
      p_token: args.token,
    });
    if (error) {
      if (rpcMissing(error)) warnMissingSchema('casper_claim_run', error);
      return null;
    }
    return data ? String(data) : null;
  } catch (err) {
    if (rpcMissing(err)) warnMissingSchema('casper_claim_run', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function releaseCasperLock(
  supabase: any,
  args: { leadId: string; token: string },
) {
  try {
    const { error } = await supabase.rpc('casper_release_lock', {
      p_lead: args.leadId,
      p_token: args.token,
    });
    if (error && rpcMissing(error)) warnMissingSchema('casper_release_lock', error);
  } catch (err) {
    if (rpcMissing(err)) warnMissingSchema('casper_release_lock', err);
  }
}

export type CasperLeadForBurst = {
  id: string;
  user_id?: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  list_id?: string | null;
  casper_enabled?: boolean | null;
  sms_opt_out?: boolean | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runWhenSettled(
  supabase: any,
  args: {
    leadId: string;
    userId: string;
    trigger?: string;
    lead: CasperLeadForBurst;
    body: string;
    from: string;
    to: string;
  },
): Promise<{ replied: boolean; reason?: string; body?: string; send_at?: string }> {
  const deadline = Date.now() + 40_000;
  for (let hop = 0; hop < 2; hop++) {
    let waitUntilIso: string | null = null;
    try {
      const { data, error } = await supabase
        .from('casper_lead_state')
        .select('wait_until, run_pending')
        .eq('lead_id', args.leadId)
        .maybeSingle();
      if (error && isMissingSchema(error)) {
        warnMissingSchema('casper_lead_state.wait_until', error);
        const { runCasperInboundSms } = await import('@/lib/casper/reply');
        return runCasperInboundSms(supabase, {
          userId: args.userId,
          lead: args.lead,
          body: args.body,
          from: args.from,
          to: args.to,
          delay: true,
        });
      }
      waitUntilIso = data?.wait_until ?? null;
    } catch (err) {
      if (isMissingSchema(err)) {
        warnMissingSchema('casper_lead_state.wait_until', err);
        const { runCasperInboundSms } = await import('@/lib/casper/reply');
        return runCasperInboundSms(supabase, {
          userId: args.userId,
          lead: args.lead,
          body: args.body,
          from: args.from,
          to: args.to,
          delay: true,
        });
      }
    }

    const waitMs = waitUntilIso ? new Date(waitUntilIso).getTime() - Date.now() : 0;
    if (waitMs > 1000) {
      await sleep(Math.min(waitMs, Math.max(0, deadline - Date.now())));
    }

    const { data: again } = await supabase
      .from('casper_lead_state')
      .select('wait_until')
      .eq('lead_id', args.leadId)
      .maybeSingle();
    const still = again?.wait_until ? new Date(again.wait_until).getTime() - Date.now() : 0;
    if (still > 1000) return { replied: false, reason: 'superseded' };
    if (Date.now() >= deadline) break;
  }

  const token = await tryCasperLock(supabase, { leadId: args.leadId, userId: args.userId, ttlSec: 90 });
  if (!token) return { replied: false, reason: 'locked' };

  try {
    const burstStart = await claimCasperRun(supabase, { leadId: args.leadId, token });
    if (!burstStart) return { replied: false, reason: 'nothing_pending' };
    const { runCasperInboundSms } = await import('@/lib/casper/reply');
    return await runCasperInboundSms(supabase, {
      userId: args.userId,
      lead: args.lead,
      body: args.body,
      from: args.from,
      to: args.to,
      delay: true,
      burstStartedAt: burstStart,
      lockToken: token,
    });
  } finally {
    await releaseCasperLock(supabase, { leadId: args.leadId, token });
  }
}

/** Sweep stuck pending runs from the existing outbox/sync worker. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sweepStuckCasperRuns(supabase: any, userId?: string) {
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  try {
    let q = supabase
      .from('casper_lead_state')
      .select('lead_id, user_id')
      .eq('run_pending', true)
      .lt('wait_until', cutoff)
      .limit(5);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) {
      if (isMissingSchema(error)) warnMissingSchema('casper_lead_state.run_pending', error);
      return;
    }
    for (const row of data ?? []) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, user_id, phone, name, company, email, notes, list_id, casper_enabled, sms_opt_out')
        .eq('id', row.lead_id)
        .maybeSingle();
      if (!lead) continue;
      const { data: lastIn } = await supabase
        .from('inbox_messages')
        .select('body')
        .eq('lead_id', lead.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      await runWhenSettled(supabase, {
        leadId: lead.id,
        userId: row.user_id,
        lead,
        body: lastIn?.body || '',
        from: lead.phone || '',
        to: '',
      });
    }
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('casper_lead_state.run_pending', err);
  }
}
