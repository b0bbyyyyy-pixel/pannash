/**
 * Dialer eligibility rules — pure functions, no DB access.
 * All env defaults are safe: 08:00–21:00 ET, max 3 attempts/day.
 */
import { isValidE164 } from './e164';

const QUIET_START = process.env.DIALER_QUIET_START ?? '08:00';
const QUIET_END   = process.env.DIALER_QUIET_END   ?? '21:00';
const DEFAULT_TZ  = process.env.DIALER_DEFAULT_TIMEZONE ?? 'America/New_York';
export const MAX_ATTEMPTS = parseInt(process.env.DIALER_MAX_ATTEMPTS_PER_DAY ?? '3', 10);

/** Parse "HH:MM" → minutes since midnight */
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Current minute-of-day in a given IANA timezone */
function currentMinutesInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value   ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + m;
  } catch {
    return currentMinutesInTz(DEFAULT_TZ);
  }
}

/** Today's date in YYYY-MM-DD for a given timezone */
export function todayInTz(tz: string | null | undefined): string {
  const zone = tz || DEFAULT_TZ;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ }).format(new Date());
  }
}

/** True if the lead's local time is within calling hours */
export function isWithinDialingHours(timezone: string | null | undefined): boolean {
  const tz = timezone || DEFAULT_TZ;
  const current = currentMinutesInTz(tz);
  return current >= hmToMinutes(QUIET_START) && current < hmToMinutes(QUIET_END);
}

/** True if this lead has hit the per-day attempt cap */
export function attemptsExceeded(
  attemptsToday: number | null | undefined,
  attemptsTodayOn: string | null | undefined,
  timezone: string | null | undefined
): boolean {
  const today = todayInTz(timezone);
  // If the recorded date differs (or is null), counter effectively resets → not exceeded
  if (attemptsTodayOn !== today) return false;
  return (attemptsToday ?? 0) >= MAX_ATTEMPTS;
}

export interface DialerLeadShape {
  phone_e164:       string | null;
  dnc:              boolean | null;
  dialer_status:    string | null;
  next_eligible_at: string | null;
  locked_by:        string | null;
  locked_at:        string | null;
  attempts_today:   number | null;
  attempts_today_on: string | null;
  timezone:         string | null;
}

const LOCK_TTL_MS = 5 * 60 * 1_000; // 5 minutes

/** Full eligibility gate — returns true only if the lead can be dialled right now */
export function isEligible(lead: DialerLeadShape): boolean {
  if (!isValidE164(lead.phone_e164)) return false;
  if (lead.dnc) return false;
  if (['bad_number', 'do_not_contact'].includes(lead.dialer_status ?? '')) return false;
  if (lead.next_eligible_at && new Date(lead.next_eligible_at) > new Date()) return false;
  if (lead.locked_by && lead.locked_at) {
    if (Date.now() - new Date(lead.locked_at).getTime() < LOCK_TTL_MS) return false;
  }
  if (!isWithinDialingHours(lead.timezone)) return false;
  if (attemptsExceeded(lead.attempts_today, lead.attempts_today_on, lead.timezone)) return false;
  return true;
}

/** Compute next_eligible_at after a disposition */
export function nextEligibleAt(disposition: string, callbackAt?: string | null): string | null {
  const now = Date.now();
  switch (disposition) {
    case 'connected':  return new Date(now + 24 * 3_600_000).toISOString();
    case 'voicemail':  return new Date(now + 48 * 3_600_000).toISOString();
    case 'no_answer':  return new Date(now +  4 * 3_600_000).toISOString();
    case 'busy':       return new Date(now +  2 * 3_600_000).toISOString();
    case 'callback':   return callbackAt ?? new Date(now + 24 * 3_600_000).toISOString();
    case 'bad_number': return null; // blocked at dialer_status level
    case 'dnc':        return null; // blocked at dnc level
    default:           return new Date(now + 4 * 3_600_000).toISOString();
  }
}
