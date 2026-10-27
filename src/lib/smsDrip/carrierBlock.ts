/** Twilio 30007 — carrier spam/content filter. Pause the campaign on the first hit. */
export function isCarrierBlockError(error?: string | null): boolean {
  if (!error) return false;
  return /\b30007\b/.test(error) || /carrier blocked/i.test(error);
}

export function dripPauseChipLabel(reason?: string | null): string {
  if (!reason) return 'Paused';
  if (isCarrierBlockError(reason)) return 'Paused — carrier blocked';
  if (/3 failed/i.test(reason)) return 'Paused after 3 failed texts';
  return 'Paused';
}

export function dripPauseBanner(reason?: string | null): { title: string; detail?: string } {
  if (isCarrierBlockError(reason)) {
    return {
      title: 'Sending stopped because a carrier blocked a message (spam filter). Try Customer Care wording with your business name: and STOP/HELP, then Resume.',
      detail: reason ?? undefined,
    };
  }
  return {
    title: 'Sending stopped after 3 failed texts in a row. Fix the message or list, then Resume.',
    detail: reason?.includes('(') ? reason : undefined,
  };
}
