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

export function normCompany(company: string | null | undefined): string {
  return String(company ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hasStablePhone(raw: string | null | undefined): boolean {
  return last10(raw).length === 10;
}

export function companiesCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = normCompany(a);
  const cb = normCompany(b);
  if (!ca || !cb) return true;
  if (ca === cb) return true;
  return ca.length >= 6 && cb.length >= 6 && (ca.includes(cb) || cb.includes(ca));
}

/** Same person: overlapping phones, or the same name when a number is missing/garbled. */
export function isSamePersonLead(
  a: { name?: string | null; phone?: string | null; phone_e164?: string | null; company?: string | null },
  b: { name?: string | null; phone?: string | null; phone_e164?: string | null; company?: string | null },
): boolean {
  if (
    phonesOverlap(a.phone, b.phone) ||
    phonesOverlap(a.phone_e164, b.phone) ||
    phonesOverlap(a.phone, b.phone_e164) ||
    phonesOverlap(a.phone_e164, b.phone_e164)
  ) return true;
  const name = normPersonName(a.name);
  if (name.length < 10 || name !== normPersonName(b.name)) return false;
  const aStable = hasStablePhone(a.phone) || hasStablePhone(a.phone_e164);
  const bStable = hasStablePhone(b.phone) || hasStablePhone(b.phone_e164);
  if (aStable && bStable) return false;
  return companiesCompatible(a.company, b.company);
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
