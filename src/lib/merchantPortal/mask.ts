export function maskSsn(raw: unknown) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `•••-••-${digits.slice(-4)}`;
}

export function maskEin(raw: unknown) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `••-•••${digits.slice(-4)}`;
}

export function money(raw: unknown) {
  const n = Number(String(raw ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export type PortalNeed = { id: string; label: string; done: boolean; doneAt?: string | null };

export const DEFAULT_PORTAL_NEEDS: PortalNeed[] = [
  { id: 'bank_statements', label: 'Last 4 months of business bank statements', done: false },
  { id: 'drivers_license', label: "Driver's license (front)", done: false },
  { id: 'voided_check', label: 'Voided business check', done: false },
];

export function parsePortalNeeds(raw: unknown): PortalNeed[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalNeed[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { id?: unknown; label?: unknown; done?: unknown; doneAt?: unknown };
    const id = String(r.id || '').trim();
    const label = String(r.label || '').trim();
    if (!id || !label) continue;
    out.push({
      id,
      label,
      done: r.done === true,
      doneAt: typeof r.doneAt === 'string' ? r.doneAt : null,
    });
  }
  return out;
}

export function safeFileName(name: string) {
  return String(name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 180) || 'file';
}

export function classifyUploadName(name: string): 'bank_statements' | 'documents' {
  return /bank|statement/i.test(name) ? 'bank_statements' : 'documents';
}

export const MERCHANT_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
]);

export const MERCHANT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export function allowedUpload(fileName: string, mime: string) {
  const type = String(mime || '').toLowerCase();
  if (MERCHANT_UPLOAD_TYPES.has(type)) return true;
  return /\.(pdf|jpe?g|png|heic|heif)$/i.test(fileName);
}

export const BROKER_DISCLAIMER =
  '{business_name} is a broker, not a lender. Offers come from our funding partners. Applying does not guarantee an offer.';

export function withBusinessName(template: string, businessName: string) {
  const name = String(businessName || '').trim() || 'Your broker';
  return template.replace(/\{business_name\}/g, name);
}
