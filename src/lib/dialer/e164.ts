/**
 * E.164 phone number utilities.
 * No external deps. US-first normalization.
 */

/** Attempt to normalize any phone string to E.164. Returns null if un-parseable. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  // Already valid E.164
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;

  // 10-digit US/CA
  if (digits.length === 10) return `+1${digits}`;

  // 11-digit starting with 1 (e.g. "18005551234")
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;

  // International with explicit '+' prefix
  if (trimmed.startsWith('+') && digits.length >= 7 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

/** True if the string is a valid E.164 number (+[country][subscriber]). */
export function isValidE164(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/** Pretty-print an E.164 number for display.  US numbers get (XXX) XXX-XXXX. */
export function formatDisplay(e164: string): string {
  if (/^\+1\d{10}$/.test(e164)) {
    const d = e164.slice(2);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return e164;
}
