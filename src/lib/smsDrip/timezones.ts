/**
 * Lead-local timezone + quiet-hours helpers for SMS drip campaigns.
 *
 * State → IANA zone with the usual splits (a state that spans two zones maps
 * to the zone covering most of its population). AZ has no DST
 * (America/Phoenix handles that automatically), HI and AK included.
 */

const STATE_TZ: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/New_York', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
  WV: 'America/New_York', IN: 'America/Indiana/Indianapolis',
  KY: 'America/New_York', DC: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
  IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  // Mountain
  CO: 'America/Denver', ID: 'America/Boise', MT: 'America/Denver',
  NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix', // no DST
  // Pacific
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  // Alaska / Hawaii
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

export const ALL_STATES = Object.keys(STATE_TZ).sort();

/** Normalize a state string ("TX", "Texas", "tx.") to a 2-letter code, or null. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\.$/, '');
  if (!s) return null;
  const upper = s.toUpperCase();
  if (STATE_TZ[upper]) return upper;
  const byName = STATE_NAMES[s.toLowerCase()];
  return byName ?? null;
}

/** IANA timezone for a lead. City is accepted but state decides. Null when unknown. */
export function zoneForLocation(_city: string | null | undefined, state: string | null | undefined): string | null {
  const code = normalizeState(state);
  return code ? STATE_TZ[code] ?? null : null;
}

/** Current parts (hour, minute, weekday 0–6) in a timezone. */
function nowInZone(tz: string, at: Date = new Date()): { hour: number; minute: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, hour: 'numeric', minute: 'numeric', weekday: 'short',
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    day: dayMap[get('weekday')] ?? 0,
  };
}

function parseHHMM(s: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return { h: 9, m: 0 };
  return { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) };
}

/** Is the lead's local time inside the send window right now? */
export function isInSendWindow(
  tz: string,
  quietStart: string,   // e.g. '09:00'
  quietEnd: string,     // e.g. '20:00'
  sendDays: number[],   // 0=Sun … 6=Sat
  at: Date = new Date(),
): boolean {
  const { hour, minute, day } = nowInZone(tz, at);
  if (!sendDays.includes(day)) return false;
  const start = parseHHMM(quietStart);
  const end = parseHHMM(quietEnd);
  const mins = hour * 60 + minute;
  return mins >= start.h * 60 + start.m && mins < end.h * 60 + end.m;
}

/**
 * Next moment (UTC Date) when the lead's local window opens.
 * Walks forward hour-free: computes candidate local-start instants for today
 * and the following days, returns the first one in the future on an allowed day.
 */
export function nextWindowStart(
  tz: string,
  quietStart: string,
  sendDays: number[],
  from: Date = new Date(),
): Date {
  const start = parseHHMM(quietStart);
  // Offset between the zone's wall clock and UTC right now.
  const local = nowInZone(tz, from);
  const utcH = from.getUTCHours();
  const utcM = from.getUTCMinutes();
  // Zone offset in minutes (wall − UTC), normalized to [-720, 840]
  let offset = (local.hour * 60 + local.minute) - (utcH * 60 + utcM);
  if (offset > 840) offset -= 1440;
  if (offset < -720) offset += 1440;

  for (let addDays = 0; addDays <= 8; addDays++) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + addDays);
    // Set to local quiet start expressed as UTC
    candidate.setUTCHours(start.h, start.m, 0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() - offset);
    if (candidate <= from) continue;
    const { day } = nowInZone(tz, candidate);
    if (!sendDays.includes(day)) continue;
    return candidate;
  }
  // Fallback: 24h out
  return new Date(from.getTime() + 24 * 3600 * 1000);
}

/** "12:05p HT"-style local time label for a UTC instant. */
export function formatLocal(at: string | Date, tz: string | null): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric', minute: '2-digit', hour12: true,
    ...(tz ? { timeZone: tz } : {}),
  };
  let label = d.toLocaleTimeString('en-US', opts)
    .replace(' AM', 'a').replace(' PM', 'p');
  if (tz) {
    const abbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? '';
    if (abbr) label += ` ${abbr.replace('S', '').replace('D', '')}`; // EST/EDT → ET
  }
  return label;
}
