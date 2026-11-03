/** Date windows for campaign insights (rolling days or a calendar month). */

export type InsightsRange = {
  since: string | null;
  until: string | null;
  label: string;
  days: number | null;
  month: string | null;
};

export function safeInsightsTz(raw: string | null | undefined) {
  const tz = String(raw || '').trim() || 'America/New_York';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/New_York';
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const g = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(p => p.type === type)?.value);
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute'), s: g('second') };
}

/** Convert a wall-clock time in `tz` to an ISO UTC instant. */
export function zonedWallToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const seen = zonedParts(new Date(utc), tz);
    const seenUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.min, 0);
    const wantUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wantUtc - seenUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc).toISOString();
}

export function currentZonedMonth(tz: string, now = new Date()) {
  const { y, m } = zonedParts(now, tz);
  return `${y}-${pad2(m)}`;
}

export function monthLabel(ym: string) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function monthRange(ym: string, tz: string): Pick<InsightsRange, 'since' | 'until' | 'label' | 'month'> | null {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    since: zonedWallToIso(year, month, 1, 0, 0, tz),
    until: zonedWallToIso(nextYear, nextMonth, 1, 0, 0, tz),
    label: monthLabel(`${year}-${pad2(month)}`),
    month: `${year}-${pad2(month)}`,
  };
}

export function recentMonthValues(tz: string, count = 12, now = new Date()) {
  const { y, m } = zonedParts(now, tz);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
    out.push({ value, label: monthLabel(value) });
  }
  return out;
}

export function parseInsightsRange(params: {
  days?: string | null;
  month?: string | null;
  tz?: string | null;
  now?: Date;
}): InsightsRange {
  const tz = safeInsightsTz(params.tz);
  const now = params.now ?? new Date();
  const monthRaw = String(params.month || '').trim();
  const daysRaw = String(params.days || '').trim();

  const fromMonth = monthRange(monthRaw, tz);
  if (fromMonth) {
    return { days: null, ...fromMonth };
  }

  if (daysRaw === 'month') {
    const current = monthRange(currentZonedMonth(tz, now), tz);
    if (current) return { days: null, ...current };
  }

  if (daysRaw === 'all' || daysRaw === '0') {
    return { since: null, until: null, label: 'All time', days: null, month: null };
  }

  const days = Math.min(365, Math.max(1, Number(daysRaw) || 30));
  return {
    since: new Date(now.getTime() - days * 86_400_000).toISOString(),
    until: null,
    label: `Last ${days} days`,
    days,
    month: null,
  };
}

export function inInsightsRange(iso: string | null | undefined, range: Pick<InsightsRange, 'since' | 'until'>) {
  const value = String(iso || '');
  if (!value) return false;
  if (range.since && value < range.since) return false;
  if (range.until && value >= range.until) return false;
  return true;
}

export function isSuccessfulDripStatus(status: string | null | undefined) {
  const st = String(status || '');
  return st === 'sent' || st === 'delivered' || st === 'replied';
}

export function isAttemptedDripStatus(status: string | null | undefined) {
  const st = String(status || '');
  return isSuccessfulDripStatus(st) || st === 'failed';
}

export function insightsTally(sends: Array<{ sms_status?: string | null }>) {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  for (const s of sends) {
    const st = String(s.sms_status ?? '');
    if (isSuccessfulDripStatus(st)) sent += 1;
    else if (st === 'failed') failed += 1;
    else if (st.startsWith('skipped')) skipped += 1;
    else pending += 1;
  }
  return { sent, failed, skipped, pending };
}
