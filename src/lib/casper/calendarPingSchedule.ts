export const PING_BEFORE_OPTIONS = [
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 180, label: '3 hours before' },
] as const;

export type PingSchedule = {
  offsets: number[];
  times: Record<string, string>;
  sent: number[];
};

const PING_PREFIX = 'PING:';

export function pingLeadLabel(minutes: number) {
  if (minutes === 30) return '30 minutes';
  if (minutes === 60) return '1 hour';
  if (minutes === 120) return '2 hours';
  if (minutes === 180) return '3 hours';
  return `${minutes} minutes`;
}

export function buildPingSchedule(
  date: string,
  startTime: string | null | undefined,
  offsets: number[],
  keepSent: number[] = [],
): PingSchedule {
  const unique = [...new Set(offsets.filter(n => PING_BEFORE_OPTIONS.some(o => o.minutes === n)))].sort((a, b) => a - b);
  const hm = (startTime && /^\d{1,2}:\d{2}/.test(startTime) ? startTime : '09:00').slice(0, 5);
  const padded = hm.length === 4 ? `0${hm}` : hm;
  const start = new Date(`${date}T${padded}`);
  const times: Record<string, string> = {};
  for (const m of unique) {
    times[String(m)] = new Date(start.getTime() - m * 60_000).toISOString();
  }
  return {
    offsets: unique,
    times,
    sent: keepSent.filter(m => unique.includes(m)),
  };
}

export function applyClientTimes(schedule: PingSchedule, times: unknown): PingSchedule {
  if (!times || typeof times !== 'object') return schedule;
  const next = { ...schedule, times: { ...schedule.times } };
  for (const m of schedule.offsets) {
    const t = (times as Record<string, unknown>)[String(m)];
    if (typeof t === 'string' && !Number.isNaN(Date.parse(t))) {
      next.times[String(m)] = new Date(t).toISOString();
    }
  }
  return next;
}

export function earliestPingAt(schedule: PingSchedule): string | null {
  const remaining = schedule.offsets.filter(o => !schedule.sent.includes(o));
  if (!remaining.length) return null;
  const stamps = remaining.map(o => schedule.times[String(o)]).filter(Boolean).sort();
  return stamps[0] ?? null;
}

export function encodePingSchedule(schedule: PingSchedule) {
  return `${PING_PREFIX}${JSON.stringify(schedule)}`;
}

export function decodePingSchedule(raw: unknown, fallbackAt?: string | null): PingSchedule | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Partial<PingSchedule>;
    if (Array.isArray(obj.offsets) && obj.times) {
      return {
        offsets: obj.offsets.map(Number).filter(Number.isFinite),
        times: obj.times,
        sent: Array.isArray(obj.sent) ? obj.sent.map(Number) : [],
      };
    }
  }
  if (typeof raw === 'string' && raw.startsWith(PING_PREFIX)) {
    try {
      return decodePingSchedule(JSON.parse(raw.slice(PING_PREFIX.length)));
    } catch {
      return null;
    }
  }
  if (fallbackAt) {
    return { offsets: [30], times: { '30': fallbackAt }, sent: [] };
  }
  return null;
}

export function offsetsFromEvent(event: {
  alert_schedule?: unknown;
  alert_phone?: string | null;
  alert_at?: string | null;
  alert_enabled?: boolean;
}) {
  const schedule = decodePingSchedule(event.alert_schedule, null)
    || decodePingSchedule(event.alert_phone, event.alert_enabled ? event.alert_at : null);
  return schedule?.offsets ?? [];
}
