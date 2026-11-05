/**
 * Dialer eligibility rules — pure functions, no DB access.
 *
 * Calling hours are always the *called party's* local time (TCPA: 8am–9pm).
 * Timezone comes from the lead row when it is a valid IANA zone, otherwise
 * from the phone's NANP area code. Unknown zone → not eligible (never
 * fall back to Eastern, which would let Pacific numbers through at 5–8am).
 */
import { isValidE164 } from './e164';
import { getPhoneLocation } from '@/lib/phoneLocation';

const QUIET_START = process.env.DIALER_QUIET_START ?? '08:00';
const QUIET_END   = process.env.DIALER_QUIET_END   ?? '21:00';
/** Federal TCPA floor/ceiling — user windows cannot go outside this. */
const TCPA_START_MIN = 8 * 60;
const TCPA_END_MIN   = 21 * 60;
const FALLBACK_TZ    = 'America/New_York';
export const MAX_ATTEMPTS = parseInt(process.env.DIALER_MAX_ATTEMPTS_PER_DAY ?? '3', 10);

export interface DialerHoursOpts {
  windowStart?: string;
  windowEnd?: string;
  maxAttempts?: number;
  at?: Date;
}

/** Parse "HH:MM" → minutes since midnight */
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isValidIanaTz(tz: string): boolean {
  // Reject abbreviations like "PST"/"ET" that some engines accept but are not
  // IANA zones (and ignore DST). Require Area/Location, plus UTC.
  if (tz !== 'UTC' && tz !== 'GMT' && !tz.includes('/')) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * IANA zone we must use for calling-hours compliance.
 * Prefer a stored valid timezone; otherwise NANP area code (951 → Los Angeles).
 * Returns null when we cannot tell — caller must skip, not guess Eastern.
 */
export function callingTimezone(lead: {
  timezone?: string | null;
  phone_e164?: string | null;
  phone?: string | null;
}): string | null {
  const stored = String(lead.timezone || '').trim();
  if (stored && isValidIanaTz(stored)) return stored;
  const fromPhone = getPhoneLocation(lead.phone_e164 || lead.phone || null)?.timezone;
  if (fromPhone && isValidIanaTz(fromPhone)) return fromPhone;
  return null;
}

/** Current minute-of-day in a given IANA timezone, or null if the zone is invalid. */
function currentMinutesInTz(tz: string, at: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(at);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + m;
  } catch {
    return null;
  }
}

/** Today's date in YYYY-MM-DD for a given timezone */
export function todayInTz(tz: string | null | undefined, at: Date = new Date()): string {
  const zone = tz && isValidIanaTz(tz) ? tz : FALLBACK_TZ;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FALLBACK_TZ }).format(at);
  }
}

/**
 * True if `at` is inside calling hours in `timezone`.
 * Unknown/invalid timezone is never treated as in-window.
 * Optional start/end ("HH:MM") override env defaults (per-user settings),
 * then clamped to TCPA 08:00–21:00.
 */
export function isWithinDialingHours(
  timezone: string | null | undefined,
  windowStart?: string,
  windowEnd?: string,
  at: Date = new Date()
): boolean {
  if (!timezone || !isValidIanaTz(timezone)) return false;
  const current = currentMinutesInTz(timezone, at);
  if (current == null) return false;
  const start = Math.max(hmToMinutes(windowStart || QUIET_START), TCPA_START_MIN);
  const end   = Math.min(hmToMinutes(windowEnd   || QUIET_END),   TCPA_END_MIN);
  return current >= start && current < end;
}

/** True if this lead has hit the per-day attempt cap.
 *  Optional maxAttempts overrides the env default (per-user settings). */
export function attemptsExceeded(
  attemptsToday: number | null | undefined,
  attemptsTodayOn: string | null | undefined,
  timezone: string | null | undefined,
  maxAttempts?: number,
  at?: Date
): boolean {
  const today = todayInTz(timezone, at);
  // If the recorded date differs (or is null), counter effectively resets → not exceeded
  if (attemptsTodayOn !== today) return false;
  return (attemptsToday ?? 0) >= (maxAttempts ?? MAX_ATTEMPTS);
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
export function isEligible(lead: DialerLeadShape, opts?: DialerHoursOpts): boolean {
  if (!isValidE164(lead.phone_e164)) return false;
  if (lead.dnc) return false;
  if (['bad_number', 'do_not_contact'].includes(lead.dialer_status ?? '')) return false;
  if (lead.next_eligible_at && new Date(lead.next_eligible_at) > (opts?.at ?? new Date())) return false;
  if (lead.locked_by && lead.locked_at) {
    if (Date.now() - new Date(lead.locked_at).getTime() < LOCK_TTL_MS) return false;
  }
  const tz = callingTimezone(lead);
  if (!tz) return false;
  if (!isWithinDialingHours(tz, opts?.windowStart, opts?.windowEnd, opts?.at)) return false;
  if (attemptsExceeded(lead.attempts_today, lead.attempts_today_on, tz, opts?.maxAttempts, opts?.at)) return false;
  return true;
}

/** Compute next_eligible_at after a disposition */
export function nextEligibleAt(disposition: string, callbackAt?: string | null): string | null {
  const now = Date.now();
  switch (disposition) {
    case 'connected':  return new Date(now + 24 * 3_600_000).toISOString();
    case 'prospect':
    case 'new_lead':   return new Date(now + 24 * 3_600_000).toISOString();
    case 'voicemail':  return new Date(now + 48 * 3_600_000).toISOString();
    case 'no_answer':  return new Date(now +  4 * 3_600_000).toISOString();
    case 'busy':       return new Date(now +  2 * 3_600_000).toISOString();
    case 'callback':   return callbackAt ?? new Date(now + 24 * 3_600_000).toISOString();
    case 'bad_number': return null; // blocked at dialer_status level
    case 'dnc':        return null; // blocked at dnc level
    default:           return new Date(now + 4 * 3_600_000).toISOString();
  }
}
