/**
 * Single-line hunt dialer — classify Twilio AMD / call status so we can
 * skip machines and no-answers, and only hand off when a person answers.
 * One call at a time. Never parallel-dials.
 */

export type HuntVerdict = 'wait' | 'human' | 'voicemail' | 'no_answer' | 'busy';

export interface HuntCallSnapshot {
  status?: string | null;
  answering_machine?: boolean | null;
  answered_at?: string | null;
  answered_by?: string | null;
  started_at?: string | null;
}

const MACHINE = /^(machine_|fax$)/i;
const DONE = new Set(['completed', 'no_answer', 'no-answer', 'busy', 'failed', 'canceled', 'cancelled']);

/** Wait for Twilio AMD (timeout 5s) before treating an unanswered pickup as a person. */
export const AMD_HUMAN_FALLBACK_MS = 6_500;

/** Map Twilio AnsweredBy + call row → what hunt should do. */
export function huntVerdict(snap: HuntCallSnapshot, now = Date.now()): HuntVerdict {
  const by = String(snap.answered_by || '').trim().toLowerCase();
  const status = String(snap.status || '').trim().toLowerCase().replace('-', '_');

  // Machine always wins — never beep / wrap-up a voicemail.
  if (MACHINE.test(by) || by === 'fax' || snap.answering_machine === true) return 'voicemail';
  if (by === 'human' || snap.answering_machine === false) return 'human';
  if (status === 'busy') return 'busy';

  const answered = !!snap.answered_at;
  if (answered && (by === 'unknown' || by === '')) {
    const started = snap.started_at ? Date.parse(snap.started_at) : NaN;
    const answeredAt = Date.parse(snap.answered_at!);
    const age = now - (Number.isFinite(answeredAt) ? answeredAt : Number.isFinite(started) ? started : now);
    // Only assume a quiet person after AMD has had its full window.
    if (age >= AMD_HUMAN_FALLBACK_MS) return 'human';
    return 'wait';
  }

  if (DONE.has(status) && !answered) return status === 'busy' ? 'busy' : 'no_answer';
  return 'wait';
}

export function isMachineAnsweredBy(answeredBy: string | null | undefined): boolean {
  const by = String(answeredBy || '').trim().toLowerCase();
  return MACHINE.test(by) || by === 'fax';
}

export function isHumanAnsweredBy(answeredBy: string | null | undefined): boolean {
  return String(answeredBy || '').trim().toLowerCase() === 'human';
}
