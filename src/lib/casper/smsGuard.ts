const META_SMS =
  /^(no reply needed|no response needed|nothing to (send|reply)|do not (reply|send|text)|don'?t (reply|send|text)|not sending|skip(ping)? (this )?reply|no sms|silence|n\/a|none|null|internal(?: note)?)\.?$/i;

const DECLINE =
  /^(no|nope|nah|na|not interested|no thanks|no thank you|not looking|all set|pass|not now|we'?re good|we are good|i'?m good|im good)$/i;

const DECLINE_PREFIX =
  /^(no)[, ]+(thanks|thank you|i'?m good|im good|we'?re good|we are good|not interested|not looking)/i;

export function isClearSmsDecline(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
  if (!t) return false;
  return DECLINE.test(t) || DECLINE_PREFIX.test(t);
}

/** Internal notes / empty SMS must never go to the lead. */
export function isUnsendableCasperSms(sms: string, thinking?: string | null): boolean {
  const t = sms.trim();
  if (!t) return true;
  if (thinking && t.toLowerCase() === thinking.trim().toLowerCase()) return true;
  if (t.startsWith('{') && t.endsWith('}')) return true;
  if (META_SMS.test(t)) return true;
  if (/^(thinking|internal|note|system)\s*:/i.test(t)) return true;
  return false;
}
