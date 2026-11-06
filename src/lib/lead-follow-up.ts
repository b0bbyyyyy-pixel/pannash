export const FOLLOW_UP_TIMERS = [
  { id: '1_day', label: '1 day', days: 1 },
  { id: '3_days', label: '3 days', days: 3 },
  { id: '1_week', label: '1 week', days: 7 },
  { id: '2_weeks', label: '2 weeks', days: 14 },
  { id: '15_day', label: '15 Day Countdown', days: 15 },
  { id: '30_day', label: '30 Day Countdown', days: 30 },
  { id: '60_day', label: '60 Day Countdown', days: 60 },
  { id: 'custom', label: 'Custom', days: null as number | null },
] as const;

export const CALLBACK_TIMERS = [
  { id: '15_min', label: '15 min', minutes: 15 },
  { id: '1_hour', label: '1 hour', minutes: 60 },
  { id: '2_hours', label: '2 hours', minutes: 120 },
  { id: 'tomorrow', label: 'Tomorrow', minutes: null as number | null },
  { id: 'custom', label: 'Custom', minutes: null as number | null },
] as const;

export type FollowUpTimerId = (typeof FOLLOW_UP_TIMERS)[number]['id'];
export type CallbackTimerId = (typeof CALLBACK_TIMERS)[number]['id'];
export type FollowUpKind = 'callback' | 'followup';

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localTimeHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Preset timers land at 10:00 local, matching follow-up scheduler. */
export function followUpDueFromPreset(days: number, now = new Date()): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + days);
  due.setHours(10, 0, 0, 0);
  return due;
}

export function followUpDueFromCustom(dateStr: string, timeStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const [hh, mm] = (timeStr || '10:00').split(':').map(Number);
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh || 10, mm || 0, 0, 0);
  return Number.isNaN(due.getTime()) ? null : due;
}

export function followUpDueFromMinutes(minutes: number, now = new Date()): Date {
  const due = new Date(now.getTime() + Math.max(1, minutes) * 60_000);
  due.setSeconds(0, 0);
  return due;
}

/** Tomorrow at 10:00 local, same landing time as other presets. */
export function followUpDueTomorrow(now = new Date()): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + 1);
  due.setHours(10, 0, 0, 0);
  return due;
}

export function resolveFollowUpDue(opts: {
  timerId: string;
  customDate?: string;
  customTime?: string;
  now?: Date;
}): Date | null {
  const now = opts.now ?? new Date();
  if (opts.timerId === 'custom') return followUpDueFromCustom(opts.customDate || '', opts.customTime || '10:00');
  if (opts.timerId === 'tomorrow') return followUpDueTomorrow(now);
  const callback = CALLBACK_TIMERS.find(t => t.id === opts.timerId);
  if (callback?.minutes != null) return followUpDueFromMinutes(callback.minutes, now);
  const follow = FOLLOW_UP_TIMERS.find(t => t.id === opts.timerId);
  if (follow?.days != null) return followUpDueFromPreset(follow.days, now);
  return null;
}

export function isFollowUpTimerId(id: string): id is FollowUpTimerId {
  return FOLLOW_UP_TIMERS.some(t => t.id === id);
}

export function isCallbackTimerId(id: string): id is CallbackTimerId {
  return CALLBACK_TIMERS.some(t => t.id === id);
}

export function followUpTitle(lead: { name?: string | null; company?: string | null }): string {
  const label = (lead.company || lead.name || 'Lead').trim() || 'Lead';
  return `Follow up — ${label}`;
}

export function callbackTitle(lead: { name?: string | null; company?: string | null }): string {
  const label = (lead.company || lead.name || 'Lead').trim() || 'Lead';
  return `Call back — ${label}`;
}

export function followUpKindFromUd(ud: unknown): FollowUpKind | null {
  const rec = ud && typeof ud === 'object' ? (ud as Record<string, unknown>) : {};
  return rec.followUpKind === 'callback' ? 'callback' : rec.followUpKind === 'followup' ? 'followup' : null;
}

export function callbackAlarmAcked(ud: unknown, dueAt?: string | null) {
  const rec = ud && typeof ud === 'object' ? (ud as Record<string, unknown>) : {};
  const acked = typeof rec.followUpAlarmAckedAt === 'string' ? rec.followUpAlarmAckedAt : '';
  if (!acked) return false;
  if (!dueAt) return true;
  return new Date(acked).getTime() >= new Date(dueAt).getTime();
}

export const CALLBACK_ALARM_EVENT = 'gostwrk:callback-alarm';

export function renderFollowUpSms(
  template: string,
  lead: { name?: string | null; company?: string | null; email?: string | null; phone?: string | null },
): string {
  const first = (lead.name || '').trim().split(/\s+/)[0] || '';
  return template
    .replace(/\{first_name\}/gi, first)
    .replace(/\{company\}/gi, (lead.company || '').trim())
    .replace(/\[Name\]/g, lead.name || '')
    .replace(/\[Company\]/g, lead.company || '')
    .replace(/\[Email\]/g, lead.email || '')
    .replace(/\[Phone\]/g, lead.phone || '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export const DEFAULT_FOLLOW_UP_SMS =
  'Hey {first_name}, just following up — any updates on your end?';
