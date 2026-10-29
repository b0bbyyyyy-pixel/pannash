const SEEN_KEY = 'gostwrk_missed_calls_seen_at';
export const MISSED_CALLS_SEEN_EVENT = 'gostwrk-missed-calls-seen';

export function isMissedCall(c: {
  status?: string | null;
  direction?: string | null;
  answered_at?: string | null;
}) {
  // Outbound no-answer is a call you placed, not a missed inbound.
  if (c.direction !== 'inbound') return false;
  if (c.status === 'no_answer' || c.status === 'agent_no_answer') return true;
  if (c.answered_at) return false;
  return !['in_progress', 'created', 'ringing_agent', 'agent_answered'].includes(c.status ?? '');
}

export function getMissedCallsSeenAt(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(SEEN_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function markMissedCallsSeen(at = Date.now()) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SEEN_KEY, String(at));
  window.dispatchEvent(new Event(MISSED_CALLS_SEEN_EVENT));
}

export function hasUnseenMissedCall(latestMissedAt?: string | null) {
  if (!latestMissedAt) return false;
  const t = new Date(latestMissedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t > getMissedCallsSeenAt();
}

export function missedClockLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}
