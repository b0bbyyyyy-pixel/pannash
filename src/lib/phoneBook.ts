import { toE164, formatDisplay } from '@/lib/dialer/e164';

export type BookContact = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  source: 'lender' | 'saved';
};

export type PhoneBookStore = {
  extras: BookContact[];
  hidden: string[];
};

export function emptyPhoneBook(): PhoneBookStore {
  return { extras: [], hidden: [] };
}

export function parsePhoneBook(raw: unknown): PhoneBookStore {
  if (!raw || typeof raw !== 'object') return emptyPhoneBook();
  const r = raw as Record<string, unknown>;
  const extras = Array.isArray(r.extras)
    ? r.extras.map(normalizeContact).filter((c): c is BookContact => !!c)
    : [];
  const hidden = Array.isArray(r.hidden)
    ? r.hidden.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  return { extras, hidden };
}

export function slugContactId(name: string) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function splitParts(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[,;|/]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function uniqEmails(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    for (const part of splitParts(raw)) {
      const email = part.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

function uniqPhones(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    for (const part of splitParts(raw)) {
      const e164 = toE164(part);
      const key = e164 || part.replace(/\D/g, '');
      if (!key || key.length < 7) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e164 || part);
    }
  }
  return out;
}

export function formatBookPhone(n: string) {
  const e164 = toE164(n);
  return e164 ? formatDisplay(e164) : n;
}

export function normalizeContact(raw: unknown): BookContact | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name || '').trim();
  const emails = uniqEmails(Array.isArray(r.emails) ? r.emails : [r.email, r.ccEmail, r.cc_email]);
  const phones = uniqPhones(Array.isArray(r.phones) ? r.phones : [r.phone, r.contactPhone, r.contact_phone, r.repDirectPhone, r.rep_direct_phone]);
  if (!name && !emails.length && !phones.length) return null;
  const id = String(r.id || '').trim() || `saved:${slugContactId(name || emails[0] || phones[0] || 'contact')}`;
  return {
    id,
    name: name || emails[0] || formatBookPhone(phones[0] || '') || 'Contact',
    emails,
    phones,
    source: r.source === 'lender' ? 'lender' : 'saved',
  };
}

export function contactFromLender(row: Record<string, unknown>): BookContact | null {
  const name = String(row.name || '').trim();
  const emails = uniqEmails([row.email, row.cc_email, row.ccEmail]);
  const phones = uniqPhones([row.contact_phone, row.contactPhone, row.rep_direct_phone, row.repDirectPhone]);
  if (!emails.length && !phones.length) return null;
  const rep = String(row.rep_name || row.repName || '').trim();
  return {
    id: `lender:${slugContactId(name || emails[0] || phones[0])}`,
    name: rep && name && !name.toLowerCase().includes(rep.toLowerCase()) ? `${rep} · ${name}` : (name || rep),
    emails,
    phones,
    source: 'lender',
  };
}

export function mergePhoneBook(store: PhoneBookStore, lenders: Array<Record<string, unknown>>): BookContact[] {
  const hidden = new Set(store.hidden);
  const extras = store.extras.filter(c => c.source === 'saved' && !hidden.has(c.id));
  const extraIds = new Set(extras.map(c => c.id));
  const fromLenders = lenders
    .map(contactFromLender)
    .filter((c): c is BookContact => !!c && !hidden.has(c.id) && !extraIds.has(c.id));
  return [...extras, ...fromLenders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
