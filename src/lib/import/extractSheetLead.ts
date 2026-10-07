/** Deterministic lead fields from a Google Sheets / CSV row. */

const COMPANY_HINT =
  /\b(llc|l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|llp|plc|p\.?c\.?|pllc|co\.|company|enterprises|solutions|services|group|holdings|partners|associates|industries|ventures|international|mechanical|construction|trucking|logistics|electric|plumbing|roofing|landscaping)\b/i;

const INDUSTRY_HINT =
  /^(construction|home|professional|business|food|beverage|retail|e-?commerce|transportation|logistics|health|medical|other|adult|entertainment|personal|service|restaurants?)(\s+[&/,\-]?\s*\w+)*$/i;

const ADDRESS_HINT = /\b(st|street|rd|road|ave|avenue|blvd|dr|drive|ln|lane|way|pkwy|parkway|ct|court|pl|place|box|suite|ste|hwy|highway|sq|square|#)\b/i;

export type SheetLeadFields = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  address: string | null;
};

function clean(v: unknown): string {
  return String(v ?? '').trim();
}

function emptyish(v: string): boolean {
  return !v || /^(none|null|n\/?a|undefined|nil|-|--|\.)$/i.test(v);
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isPhone(v: string): boolean {
  const d = v.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 && !v.includes('@');
}

function isPersonToken(v: string): boolean {
  return /^[A-Za-z][A-Za-z'\-]{1,24}$/.test(v) && !COMPANY_HINT.test(v) && !INDUSTRY_HINT.test(v);
}

function looksLikeCompany(v: string): boolean {
  if (emptyish(v) || isEmail(v) || isPhone(v) || INDUSTRY_HINT.test(v)) return false;
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{2,4}/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  if (COMPANY_HINT.test(v)) return true;
  // "Hyche Center", "True Value" — 2–8 words, letters, not an address or "96 Jemison"
  const words = v.split(/\s+/);
  if (/^\d/.test(v)) return false;
  return words.length >= 2 && words.length <= 8 && !ADDRESS_HINT.test(v) && /[a-zA-Z]/.test(v);
}

export function extractSheetLead(cells: unknown[]): SheetLeadFields {
  const vals = cells.map(clean);
  let email: string | null = null;
  let industry: string | null = null;
  let address: string | null = null;
  const phones: string[] = [];
  const companies: string[] = [];

  for (const v of vals) {
    if (emptyish(v) || /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(v)) continue;
    if (isEmail(v)) {
      if (!email) email = v;
      continue;
    }
    if (isPhone(v)) {
      phones.push(v);
      continue;
    }
    if (INDUSTRY_HINT.test(v) || (/[&/]/.test(v) && v.split(/\s+/).length <= 5 && !COMPANY_HINT.test(v))) {
      if (!industry) industry = v;
      continue;
    }
    if (ADDRESS_HINT.test(v) && /\d/.test(v)) {
      if (!address) address = v;
      continue;
    }
    if (looksLikeCompany(v)) companies.push(v);
  }

  let name: string | null = null;
  const emailIdx = email ? vals.findIndex(v => v === email) : -1;
  if (emailIdx >= 2) {
    const a = vals[emailIdx - 2];
    const b = vals[emailIdx - 1];
    if (isPersonToken(a) && isPersonToken(b)) name = `${a} ${b}`;
  }
  if (!name) {
    const tokens: string[] = [];
    for (const v of vals) {
      if (emptyish(v) || isEmail(v) || isPhone(v) || looksLikeCompany(v) || INDUSTRY_HINT.test(v) || ADDRESS_HINT.test(v)) {
        continue;
      }
      if (isPersonToken(v)) tokens.push(v);
    }
    if (tokens.length >= 2) name = `${tokens[0]} ${tokens[1]}`;
    else if (tokens.length === 1) name = tokens[0];
  }

  const company = companies.find(c => !name || c.toLowerCase() !== name.toLowerCase()) ?? null;

  return {
    name,
    email,
    phone: phones[0] ?? null,
    company,
    industry,
    address,
  };
}

export function pickFilled(ai: string | null | undefined, heur: string | null | undefined): string | null {
  const a = ai && !emptyish(String(ai)) ? String(ai).trim() : null;
  const h = heur && !emptyish(String(heur)) ? String(heur).trim() : null;
  if (h && COMPANY_HINT.test(h) && a && (INDUSTRY_HINT.test(a) || !COMPANY_HINT.test(a))) return h;
  return a || h;
}

export function mergeSheetLead<T extends Record<string, unknown>>(
  ai: T,
  cells: unknown[],
): T {
  const h = extractSheetLead(cells);
  const name = pickFilled(ai.name as string | null, h.name);
  const company = pickFilled(ai.company as string | null, h.company);
  return {
    ...ai,
    name: name ?? ai.name ?? null,
    email: pickFilled(ai.email as string | null, h.email) ?? ai.email ?? null,
    phone: pickFilled(ai.phone as string | null, h.phone) ?? ai.phone ?? null,
    company: company ?? ai.company ?? null,
    industry: pickFilled(ai.industry as string | null, h.industry) ?? ai.industry ?? null,
    address: pickFilled(ai.address as string | null, h.address) ?? ai.address ?? null,
  };
}

const HEADER_LABELS = new Set([
  'name', 'fullname', 'full name', 'firstname', 'first name', 'first', 'lastname', 'last name', 'last',
  'email', 'e-mail', 'email address', 'phone', 'telephone', 'mobile', 'cell',
  'company', 'business', 'business name', 'company name', 'organization',
  'contact', 'owner', 'address', 'industry', 'city', 'state', 'zip',
  'createdat', 'created at', 'created',
]);

export function looksLikeHeaderCell(value: unknown): boolean {
  const s = String(value ?? '').toLowerCase().trim();
  if (!s || s.includes('@') || /\d/.test(s)) return false;
  if (COMPANY_HINT.test(s) && !HEADER_LABELS.has(s)) return false;
  if (s.split(/\s+/).length > 3) return false;
  const compact = s.replace(/[^a-z0-9]/g, '');
  if (HEADER_LABELS.has(s) || HEADER_LABELS.has(compact)) return true;
  return [...HEADER_LABELS].some(k => compact === k.replace(/[^a-z0-9]/g, ''));
}

/** True only when the row is actually column titles — not a lead whose industry is "Professional & Business". */
export function looksLikeHeaderRow(row: unknown[]): boolean {
  const matches = row.filter(looksLikeHeaderCell);
  return matches.length >= 2;
}
