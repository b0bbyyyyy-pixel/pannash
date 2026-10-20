import { toE164 } from '@/lib/dialer/e164';

export function last10(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

/** Every plausible 10-digit identity for a stored phone, including garbled 11-digit values. */
export function phoneKeys(raw: string | null | undefined): string[] {
  const d = String(raw ?? '').replace(/\D/g, '');
  const keys = new Set<string>();
  if (d.length >= 10) keys.add(d.slice(-10));
  if (d.length === 11 && d[0] === '1') keys.add(d.slice(1));
  if (d.length === 11 && d[0] !== '1') keys.add(d.slice(0, 10));
  if (d.length === 12 && d.startsWith('1')) keys.add(d.slice(1, 11));
  return [...keys].filter(k => k.length === 10);
}

export function phonesOverlap(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const other = new Set(phoneKeys(b));
  return phoneKeys(a).some(k => other.has(k));
}

export function normPersonName(name: string | null | undefined): string {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function phoneVariants(raw: string): string[] {
  const e164 = toE164(raw);
  const keys = phoneKeys(raw);
  const d = keys[0] || last10(raw);
  return [...new Set([
    raw,
    e164,
    ...keys,
    ...keys.map(k => `+1${k}`),
    ...keys.map(k => `1${k}`),
    d,
    d ? `+1${d}` : '',
    d ? `1${d}` : '',
  ].filter(Boolean))] as string[];
}
