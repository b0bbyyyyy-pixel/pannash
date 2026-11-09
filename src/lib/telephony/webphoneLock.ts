export const WEBPHONE_LOCK_KEY = 'pannash.webphone.lock';
export const WEBPHONE_LOCK_STALE_MS = 8_000;

export type WebphoneLock = { id: string; at: number; busy?: boolean };

export function newWebphoneTabId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseWebphoneLock(raw: string | null | undefined): WebphoneLock | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as WebphoneLock;
    if (!value || typeof value.id !== 'string' || typeof value.at !== 'number') return null;
    return value;
  } catch {
    return null;
  }
}

export function shouldTakeWebphoneLock(opts: {
  mine: string;
  existing: WebphoneLock | null;
  now: number;
  steal: boolean;
  staleMs?: number;
}) {
  if (!opts.existing) return true;
  if (opts.existing.id === opts.mine) return true;
  if (opts.now - opts.existing.at > (opts.staleMs ?? WEBPHONE_LOCK_STALE_MS)) return true;
  return opts.steal;
}

export function isPhoneBrowser(ua: string) {
  return /iPhone|iPad|Android.+Mobile/i.test(ua);
}

/**
 * How long to wait after the tab is hidden before dropping the Twilio Device.
 * `null` means stay registered — a desktop CRM tab has to keep the webphone
 * even when it is not focused, otherwise the phone rings and nothing pops up
 * on the computer in front of you.
 */
export function webphoneHideUnregisterMs(opts: { phone: boolean }): number | null {
  if (opts.phone) return 400;
  return null;
}
