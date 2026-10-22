const EMAIL_RE = /[a-zA-Z0-9._%+\-]+\s*@\s*[a-zA-Z0-9.\-]+(?:\s*\.\s*[a-zA-Z]{2,})+/g;
const LOOKS_LIKE_EMAIL = /@|\b[\w.+-]+\s+at\s+[\w.-]+\s*dot\s*\w+/i;

export type ExtractedEmail = { email?: string; invalid: boolean };

export function isValidEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return false;
  if (email.includes('..') || email.startsWith('.') || email.endsWith('.')) return false;
  const m = email.match(/^([a-z0-9._%+\-]+)@([a-z0-9.\-]+)\.([a-z]{2,})$/);
  if (!m) return false;
  if (!m[1] || !m[2] || m[2].startsWith('-') || m[2].endsWith('-')) return false;
  return true;
}

export function extractEmailFromSms(raw: string): ExtractedEmail {
  const text = String(raw || '');
  const matches = text.match(EMAIL_RE) ?? [];
  const cleaned = matches
    .map(m => m.replace(/\s+/g, '').trim().toLowerCase().replace(/[.,;:!?)]+$/g, ''))
    .filter(Boolean);
  const valid = cleaned.find(isValidEmail);
  if (valid) return { email: valid, invalid: false };
  if (LOOKS_LIKE_EMAIL.test(text) || cleaned.length > 0) return { invalid: true };
  return { invalid: false };
}
