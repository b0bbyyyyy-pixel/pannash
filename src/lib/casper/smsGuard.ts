const META_SMS =
  /^(no reply needed|no response needed|nothing to (send|reply)|do not (reply|send|text)|don'?t (reply|send|text)|not sending|skip(ping)? (this )?reply|no sms|silence|n\/a|none|null|internal(?: note)?)\.?$/i;

const QUOTE_CHARS = new Set(['"', "'", '`', '\u201c', '\u201d', '\u2018', '\u2019']);

/** Strip wrapping quotes the model uses for "send nothing" (`""`, `""""`). */
export function normalizeCasperSms(sms: string): string {
  let t = sms.trim();
  for (let n = 0; n < 8; n++) {
    if (t.length < 2) break;
    const a = t[0];
    const b = t[t.length - 1];
    if (!QUOTE_CHARS.has(a) || !QUOTE_CHARS.has(b)) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

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
  const t = normalizeCasperSms(sms);
  if (!t) return true;
  if ([...t].every(ch => QUOTE_CHARS.has(ch) || ch === ' ')) return true;
  if (thinking && t.toLowerCase() === thinking.trim().toLowerCase()) return true;
  if (t.startsWith('{') && t.endsWith('}')) return true;
  if (META_SMS.test(t)) return true;
  if (/^(thinking|internal|note|system)\s*:/i.test(t)) return true;
  return false;
}

export function casperSmsToSend(sms: string, thinking?: string | null): string {
  const t = normalizeCasperSms(sms);
  if (isUnsendableCasperSms(t, thinking)) return '';
  return t.slice(0, 480);
}
