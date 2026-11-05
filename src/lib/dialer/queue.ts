/**
 * Dialer queue helpers — DB-touching logic kept out of route files.
 * Accepts an already-authed supabase client so the caller controls auth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

import { isEligible, todayInTz, callingTimezone, type DialerHoursOpts, type DialerLeadShape } from './canDial';
import { getTelephonySettings } from '@/lib/telephony/twilio';

const LOCK_TTL_MS = 5 * 60 * 1_000;
const SCAN_PAGE = 80;
const SCAN_CAP = 400;

/** Full lead shape returned to the UI */
export interface QueueLead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
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
  lead_status: string | null;
  month_key: string | null;
  list_id: string | null;
  in_pipeline: boolean | null;
  attempts_today: number;
  attempts_today_on: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

const LEAD_SELECT = [
  'id', 'name', 'company', 'email', 'phone_e164', 'timezone',
  'dnc', 'dialer_status', 'next_eligible_at',
  'last_disposition', 'last_called_at', 'last_call_notes',
  'notes', 'stage', 'lead_status', 'month_key', 'list_id', 'in_pipeline',
  'attempts_today', 'attempts_today_on',
  'locked_by', 'locked_at',
].join(', ');

const PEEK_SELECT = [
  'id', 'name', 'company', 'phone_e164', 'timezone', 'next_eligible_at',
  'last_disposition', 'dnc', 'dialer_status', 'locked_by', 'locked_at',
  'attempts_today', 'attempts_today_on',
].join(', ');

const staleLockIso = () => new Date(Date.now() - LOCK_TTL_MS).toISOString();

async function hoursOpts(supabase: SupabaseClient, userId: string): Promise<DialerHoursOpts> {
  const s = await getTelephonySettings(supabase, userId);
  return {
    windowStart: s.calling_window_start,
    windowEnd: s.calling_window_end,
    maxAttempts: s.max_attempts_per_day,
  };
}

function eligibleNow(lead: DialerLeadShape, opts: DialerHoursOpts): boolean {
  if (['bad_number', 'do_not_contact'].includes(lead.dialer_status ?? '')) return false;
  return isEligible(lead, opts);
}

/**
 * Walk the ordered candidate list until we have `want` leads that are in
 * the called party's local calling window (skips CA at 6am, etc.).
 */
async function scanEligible(
  supabase: SupabaseClient,
  userId: string,
  listId: string | null | undefined,
  excludeId: string | null,
  opts: DialerHoursOpts,
  want: number,
  select: string,
): Promise<QueueLead[]> {
  const found: QueueLead[] = [];
  const nowIso = new Date().toISOString();
  const stale = staleLockIso();

  for (let offset = 0; offset < SCAN_CAP && found.length < want; offset += SCAN_PAGE) {
    let query = supabase
      .from('leads')
      .select(select)
      .eq('user_id', userId)
      .eq('dnc', false)
      .not('phone_e164', 'is', null)
      .or(`locked_by.is.null,locked_at.lt.${stale}`)
      .or(`next_eligible_at.is.null,next_eligible_at.lte.${nowIso}`)
      .order('next_eligible_at', { ascending: true, nullsFirst: true })
      .range(offset, offset + SCAN_PAGE - 1);

    if (listId) query = query.eq('list_id', listId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error || !data?.length) break;

    for (const row of data as QueueLead[]) {
      if (eligibleNow(row, opts)) {
        found.push(row);
        if (found.length >= want) break;
      }
    }
    if (data.length < SCAN_PAGE) break;
  }

  return found;
}

// ─── claim ────────────────────────────────────────────────────────────────────

/**
 * Find the next eligible lead and optimistically lock it for this agent.
 * Returns the locked lead or null if queue is empty / quiet hours.
 */
export async function claimNextLead(
  supabase: SupabaseClient,
  userId: string,
  listId?: string | null
): Promise<QueueLead | null> {
  const opts = await hoursOpts(supabase, userId);
  const eligible = await scanEligible(supabase, userId, listId, null, opts, 1, LEAD_SELECT);
  if (!eligible.length) return null;

  const lead = eligible[0];

  // Optimistic lock: only updates if still unlocked / stale
  const { error: lockErr } = await supabase
    .from('leads')
    .update({ locked_by: userId, locked_at: new Date().toISOString() })
    .eq('id', lead.id)
    .or(`locked_by.is.null,locked_at.lt.${staleLockIso()}`);

  // If the lock update fails (e.g. RLS / race condition), log but still proceed —
  // this is a single-user CRM so double-claim risk is negligible.
  if (lockErr) console.warn('[claimNextLead] lock update failed:', lockErr.message);
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

/** Take or refresh a lock on a specific lead owned by this user. */
export async function lockLead(
  supabase: SupabaseClient,
  leadId: string,
  userId: string
): Promise<QueueLead | null> {
  const { data: lead } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('id', leadId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!lead) return null;

  const { error } = await supabase
    .from('leads')
    .update({ locked_by: userId, locked_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('user_id', userId);

  if (error) console.warn('[lockLead] lock update failed:', error.message);
  return lead as QueueLead;
}

/** Return the lead currently locked by this agent (or null) */
export async function getCurrentLead(
  supabase: SupabaseClient,
  userId: string,
  listId?: string | null
): Promise<QueueLead | null> {
  let query = supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('user_id', userId)
    .eq('locked_by', userId)
    .gt('locked_at', staleLockIso())   // not stale
    .order('locked_at', { ascending: false })
    .limit(1);

  if (listId) query = query.eq('list_id', listId);

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const lead = data as QueueLead;
  const opts = await hoursOpts(supabase, userId);
  // Locked leads fail isEligible's lock check — clear it to evaluate hours/DNC.
  const unlocked: DialerLeadShape = { ...lead, locked_by: null, locked_at: null };
  if (!eligibleNow(unlocked, opts)) {
    await unlockLead(supabase, lead.id, userId);
    return null;
  }
  return lead;
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
  limit = 10,
  listId?: string | null
): Promise<QueuePreview[]> {
  const opts = await hoursOpts(supabase, userId);
  const rows = await scanEligible(supabase, userId, listId, excludeId, opts, limit, PEEK_SELECT);
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    company: l.company,
    phone_e164: l.phone_e164,
    timezone: l.timezone,
    next_eligible_at: l.next_eligible_at,
    last_disposition: l.last_disposition,
  }));
}

/** Increment attempts_today (resetting if date changed in lead tz) */
export async function incrementAttempts(
  supabase: SupabaseClient,
  lead: QueueLead,
  userId: string
) {
  const tz = callingTimezone(lead);
  const today = todayInTz(tz);
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
