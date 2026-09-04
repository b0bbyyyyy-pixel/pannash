/**
 * Dialer queue helpers — DB-touching logic kept out of route files.
 * Accepts an already-authed supabase client so the caller controls auth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

import { isEligible, todayInTz, type DialerLeadShape } from './canDial';

const LOCK_TTL_MS = 5 * 60 * 1_000;

/** Full lead shape returned to the UI */
export interface QueueLead {
  id: string;
  name: string;
  company: string | null;
  phone_e164: string;
  timezone: string | null;
  dnc: boolean;
  dialer_status: string | null;
  next_eligible_at: string | null;
  last_disposition: string | null;
  last_called_at: string | null;
  last_call_notes: string | null;
  notes: string | null;
  stage: string | null;
  month_key: string | null;
  attempts_today: number;
  attempts_today_on: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

const LEAD_SELECT = [
  'id', 'name', 'company', 'phone_e164', 'timezone',
  'dnc', 'dialer_status', 'next_eligible_at',
  'last_disposition', 'last_called_at', 'last_call_notes',
  'notes', 'stage', 'month_key',
  'attempts_today', 'attempts_today_on',
  'locked_by', 'locked_at',
].join(', ');

const staleLockIso = () => new Date(Date.now() - LOCK_TTL_MS).toISOString();

// ─── claim ────────────────────────────────────────────────────────────────────

/**
 * Find the next eligible lead and optimistically lock it for this agent.
 * Returns the locked lead or null if queue is empty / quiet hours.
 */
export async function claimNextLead(
  supabase: SupabaseClient,
  userId: string
): Promise<QueueLead | null> {
  // Fetch a generous batch; filter timezone/attempts in JS
  const { data: candidates, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('user_id', userId)
    .eq('dnc', false)
    .not('phone_e164', 'is', null)
    .or(`locked_by.is.null,locked_at.lt.${staleLockIso()}`)
    .or(`next_eligible_at.is.null,next_eligible_at.lte.${new Date().toISOString()}`)
    .order('next_eligible_at', { ascending: true, nullsFirst: true })
    .limit(40);

  if (error || !candidates?.length) return null;

  const eligible = (candidates as QueueLead[]).filter((l) =>
    !['bad_number', 'do_not_contact'].includes(l.dialer_status ?? '') &&
    isEligible(l)
  );
  if (!eligible.length) return null;

  const lead = eligible[0];

  // Optimistic lock: only updates if still unlocked / stale
  const { error: lockErr } = await supabase
    .from('leads')
    .update({ locked_by: userId, locked_at: new Date().toISOString() })
    .eq('id', lead.id)
    .or(`locked_by.is.null,locked_at.lt.${staleLockIso()}`);

  if (lockErr) return null;
  return lead as QueueLead;
}

/** Unlock a lead and clear the lock fields */
export async function unlockLead(
  supabase: SupabaseClient,
  leadId: string,
  userId: string
) {
  await supabase
    .from('leads')
    .update({ locked_by: null, locked_at: null })
    .eq('id', leadId)
    .eq('locked_by', userId);
}

/** Return the lead currently locked by this agent (or null) */
export async function getCurrentLead(
  supabase: SupabaseClient,
  userId: string
): Promise<QueueLead | null> {
  const { data } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('user_id', userId)
    .eq('locked_by', userId)
    .gt('locked_at', staleLockIso())   // not stale
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as QueueLead | null) ?? null;
}

export interface QueuePreview {
  id: string;
  name: string;
  company: string | null;
  phone_e164: string;
  timezone: string | null;
  next_eligible_at: string | null;
  last_disposition: string | null;
}

/** Preview the next N eligible leads (read-only, no lock) */
export async function peekQueue(
  supabase: SupabaseClient,
  userId: string,
  excludeId: string | null,
  limit = 10
): Promise<QueuePreview[]> {
  const { data } = await supabase
    .from('leads')
    .select('id, name, company, phone_e164, timezone, next_eligible_at, last_disposition, dnc, dialer_status, locked_by, locked_at, attempts_today, attempts_today_on')
    .eq('user_id', userId)
    .eq('dnc', false)
    .not('phone_e164', 'is', null)
    .neq('id', excludeId ?? '00000000-0000-0000-0000-000000000000')
    .or(`next_eligible_at.is.null,next_eligible_at.lte.${new Date().toISOString()}`)
    .order('next_eligible_at', { ascending: true, nullsFirst: true })
    .limit(40);

  if (!data) return [];
  // Cast to the full shape needed by isEligible, then strip to QueuePreview on return
  type PeekRow = QueuePreview & DialerLeadShape;
  return (data as PeekRow[]).filter((l) => isEligible(l)).slice(0, limit);
}

/** Increment attempts_today (resetting if date changed in lead tz) */
export async function incrementAttempts(
  supabase: SupabaseClient,
  lead: QueueLead,
  userId: string
) {
  const today = todayInTz(lead.timezone);
  const currentCount = lead.attempts_today_on === today ? (lead.attempts_today ?? 0) : 0;

  await supabase
    .from('leads')
    .update({
      attempts_today: currentCount + 1,
      attempts_today_on: today,
      last_called_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .eq('user_id', userId);
}
