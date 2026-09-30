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

export type FollowUpTimerId = (typeof FOLLOW_UP_TIMERS)[number]['id'];

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

export function followUpTitle(lead: { name?: string | null; company?: string | null }): string {
  const label = (lead.company || lead.name || 'Lead').trim() || 'Lead';
  return `Follow up — ${label}`;
}

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
