/**
 * Parse freeform pasted text (email signature, vCard, copied rows, key:value lines)
 * into CRM lead fields + underwriting data for quick pipeline lead adds.
 */

export type ParsedLeadPaste = {
  // Core lead fields
  name: string;
  email: string;
  phone: string;
  company: string;
  // Person / underwriting fields
  ssn?: string;
  dob?: string;
  homeAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  // Business fields
  ein?: string;
  industry?: string;
  businessStartDate?: string;
  businessPhone?: string;
  // Financial
  monthlyRevenue?: string;
  creditScore?: string;
  requestedAmount?: string;
  /** Text we could not map */
  remainder: string;
};

const KEY_MAP: Record<string, keyof Pick<ParsedLeadPaste, 'name' | 'email' | 'phone' | 'company'>> = {
  name: 'name',
  'full name': 'name',
  contact: 'name',
  'contact name': 'name',
  first: 'name',
  last: 'name',
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  'email address': 'email',
  'e-mail address': 'email',
  phone: 'phone',
  mobile: 'phone',
  'mobile number': 'phone',
  'cell number': 'phone',
  'phone number': 'phone',
  'home phone': 'phone',
  'work phone': 'phone',
  cell: 'phone',
  tel: 'phone',
  telephone: 'phone',
  company: 'company',
  business: 'company',
  organization: 'company',
  org: 'company',
  'company name': 'company',
  'business name': 'company',
};

/** Section headers — not real company names (avoid winning the "first company-like line" heuristic). */
const COMPANY_SECTION_NOISE =
  /^(business information|contact information|personal information|company information|general information|additional information)$/i;

/**
 * Forms often paste with missing line breaks: "Kimberly WallaceMobile Number:\n252..."
 * Insert breaks before known labels when glued to a letter/digit.
 */
function normalizeGluedLabels(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n');
  // Longer labels first so "Email Address" wins over "Email"
  const labels = [
    'Mobile Number:',
    'Cell Number:',
    'Phone Number:',
    'Email Address:',
    'Business Name:',
    'Company Name:',
    'Full Name:',
    'Email:',
    'Phone:',
  ];
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`([a-zA-Z0-9])${esc}`, 'gi'), `$1\n${label}`);
  }
  return t;
}

function findEmails(text: string): string[] {
  return text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
}

function hasEmail(s: string): boolean {
  return /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(s);
}

/** Strip common formatting from phone for storage */
function normalizePhone(raw: string): string {
  const d = raw.replace(/[^\d+]/g, '');
  if (d.length >= 10) return raw.trim();
  return raw.trim();
}

const PHONE_CANDIDATE =
  /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})|(?:\d{3}[-.\s]\d{3}[-.\s]\d{4})/g;

const COMPANY_HINTS = /\b(inc|llc|l\.l\.c|corp|ltd|co\.|company|group|solutions|services|llp|associates|enterprises|ventures|holdings|partners|consulting|industries|construction|contracting|management|properties|realty|agency|studio|studios|supply|equipment|transport|logistics|medical|dental|legal|law|auto|home|national|international)\b/i;

/** Detect timestamp tokens like "2026-09-15 10:46:03" or "2026-09-15" */
function looksLikeTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(s.trim());
}

/** Detect pure numeric / ID tokens: SSN, EIN, DOB, zip, amounts — but NOT phone numbers */
function looksLikeIdOrNumber(s: string): boolean {
  const t = s.trim();
  // SSN-like: 046-82-4092
  if (/^\d{3}-\d{2}-\d{4}$/.test(t)) return true;
  // EIN-like: 99-4647015
  if (/^\d{2}-\d{7}$/.test(t)) return true;
  // Zip (5 or 9 digits)
  if (/^\d{5}(-\d{4})?$/.test(t)) return true;
  // Pure decimal amount (e.g. 44350.00) — but NOT 10-digit phone
  if (/^\d+\.\d+$/.test(t)) return true;
  // Pure digit string that is NOT 10 or 11 digits (which would be a phone)
  if (/^\d+$/.test(t)) {
    const len = t.length;
    if (len === 10 || len === 11) return false; // likely a phone number
    return true;
  }
  return false;
}

function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 60) return false;
  if (hasEmail(t)) return false;
  if (/^https?:/i.test(t)) return false;
  if (looksLikeTimestamp(t)) return false;
  if (looksLikeIdOrNumber(t)) return false;
  // Reject if it has a company suffix
  if (COMPANY_HINTS.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  // Each word should start with a capital or be a short connector
  const connectors = new Set(['de', 'la', 'van', 'von', 'del', 'da', 'di', 'the']);
  const allWordsLookName = words.every(w =>
    connectors.has(w.toLowerCase()) || /^[A-Z][a-zA-Z'\-]{0,}$/.test(w)
  );
  if (!allWordsLookName) return false;
  return /^[a-zA-Z][a-zA-Z\s\-'.]+$/.test(t);
}

function looksLikeCompany(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (hasEmail(t)) return false;
  if (looksLikeTimestamp(t)) return false;
  if (looksLikeIdOrNumber(t)) return false;
  // Must have a company hint OR be at least 2 words of non-numeric text
  if (COMPANY_HINTS.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 2 && /[a-zA-Z]{2,}/.test(t) && !/^\d/.test(t);
}

function parseVcard(text: string): Partial<ParsedLeadPaste> {
  const out: Partial<ParsedLeadPaste> = {};
  const fn = text.match(/FN[;:]([^\r\n]+)/i);
  if (fn) out.name = fn[1].trim();
  const emailM = text.match(/EMAIL[;:]([^\r\n]+)/i);
  if (emailM) {
    const em = findEmails(emailM[1]);
    if (em[0]) out.email = em[0];
  }
  const tel = text.match(/TEL[;:]([^\r\n]+)/i);
  if (tel) out.phone = normalizePhone(tel[1].trim());
  const org = text.match(/ORG[;:]([^\r\n]+)/i);
  if (org) out.company = org[1].trim();
  return out;
}

function normKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/^\*/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Line is only a field label (value on next line): "Full Name:", "Mobile Number:" */
function isLabelOnlyLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 2 && t.length < 90 && /[:：]\s*$/.test(t);
}

/** Not a real company — generic section heading */
function isCompanyNoiseSection(line: string): boolean {
  return COMPANY_SECTION_NOISE.test(line.trim());
}

/**
 * Main entry: parse pasted blob into lead fields.
 */
export function parseLeadPasteText(raw: string): ParsedLeadPaste {
  const result: ParsedLeadPaste = { name: '', email: '', phone: '', company: '', remainder: '' };
  if (!raw || !raw.trim()) return result;

  const text = normalizeGluedLabels(raw).replace(/\r\n/g, '\n').trim();

  if (/BEGIN:VCARD/i.test(text)) {
    const vc = parseVcard(text);
    if (vc.name) result.name = vc.name;
    if (vc.email) result.email = vc.email;
    if (vc.phone) result.phone = vc.phone;
    if (vc.company) result.company = vc.company;
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Labeled key:value (colon, equals, or tab after first "word")
  for (const line of lines) {
    const tabSplit = line.split('\t');
    if (tabSplit.length === 2 && !line.includes(':')) {
      const k = normKey(tabSplit[0]);
      const v = tabSplit[1].trim();
      if (v && KEY_MAP[k]) {
        (result[KEY_MAP[k] as 'name'] as unknown as string) = v;
      }
      continue;
    }

    // Multi-word labels: "Full Name:", "Business Name:", "Mobile Number:"
    const m = line.match(/^\*?(.+?)\s*[:：=]\s*(.*)$/);
    if (m) {
      const k = normKey(m[1].replace(/[:：*]+$/, '').trim());
      const v = m[2].trim();
      if (k === 'first name' || k === 'firstname') {
        if (v) result.name = result.name ? `${v} ${result.name}`.trim() : v;
        continue;
      }
      if (k === 'last name' || k === 'lastname') {
        if (v) result.name = result.name ? `${result.name} ${v}`.trim() : v;
        continue;
      }
      const field = KEY_MAP[k];
      if (field) {
        if (!v) continue;
        if (field === 'email') {
          const em = findEmails(v);
          if (em[0]) result.email = em[0];
        } else if (field === 'phone') {
          result.phone = normalizePhone(v);
        } else {
          (result[field] as string) = v;
        }
      }
    }
  }

  // All emails in text; prefer first if not set
  const allEmails = findEmails(text);
  if (allEmails.length && !result.email) {
    result.email = allEmails[0];
  }

  // Phones
  if (!result.phone) {
    const phones = text.match(PHONE_CANDIDATE);
    if (phones && phones.length) {
      result.phone = normalizePhone(phones[0]);
    }
  }

  // Single-line: comma or tab–separated (like a pasted spreadsheet row)
  // Also handles multi-line where each line is a single tab-separated chunk
  const flatRow = lines.length === 1
    ? lines[0].split(/[,\t|]/).map((c) => c.trim()).filter(Boolean)
    : lines.length <= 3 && lines.every(l => l.split(/\t/).length > 2)
      ? lines.flatMap(l => l.split(/\t/).map(c => c.trim())).filter(Boolean)
      : null;

  if (flatRow && flatRow.length > 1) {
    // Pass 1: email + phone
    for (const cell of flatRow) {
      if (!result.email) {
        const em = findEmails(cell);
        if (em[0]) result.email = em[0];
      }
      if (!result.phone && !hasEmail(cell) && !looksLikeTimestamp(cell)) {
        const digits = cell.replace(/\D/g, '');
        // Accept bare 10-digit (US) or 11-digit (1+US) numbers as phone
        const isBarePhone = /^\+?1?\d{10}$/.test(digits) && cell.replace(/[^\d]/g, '').length >= 10;
        const p = cell.match(PHONE_CANDIDATE);
        if (isBarePhone && !looksLikeIdOrNumber(cell)) {
          result.phone = normalizePhone(cell);
        } else if (p && p[0] && p[0].replace(/\D/g, '').length >= 10 && !looksLikeIdOrNumber(p[0])) {
          result.phone = normalizePhone(p[0]);
        } else if (isBarePhone && digits.length === 10) {
          // Bare 10-digit number — almost certainly a phone
          result.phone = normalizePhone(cell);
        }
      }
    }
    // Pass 2: company FIRST (strong signal: has LLC/Inc/Corp)
    for (const cell of flatRow) {
      if (hasEmail(cell) || looksLikeTimestamp(cell) || looksLikeIdOrNumber(cell)) continue;
      if (isCompanyNoiseSection(cell)) continue;
      if (!result.company && COMPANY_HINTS.test(cell)) {
        result.company = cell;
        break;
      }
    }
    // Pass 3: person name (after company is known)
    for (const cell of flatRow) {
      if (hasEmail(cell) || looksLikeTimestamp(cell) || looksLikeIdOrNumber(cell)) continue;
      if (cell === result.company || cell === result.phone) continue;
      if (!result.name && looksLikeName(cell)) {
        result.name = cell;
        break;
      }
    }
    // Pass 4: fallback company if none found yet (2+ words, not a name, not date)
    if (!result.company) {
      for (const cell of flatRow) {
        if (cell === result.name || cell === result.phone) continue;
        if (hasEmail(cell) || looksLikeTimestamp(cell) || looksLikeIdOrNumber(cell)) continue;
        if (isCompanyNoiseSection(cell)) continue;
        if (looksLikeCompany(cell) && !looksLikeName(cell)) {
          result.company = cell;
          break;
        }
      }
    }
  }

  // Multi-line: name = first plausible person line; company = first company-like line
  if (lines.length > 1 && !flatRow) {
    // Company first (stronger signal)
    for (const line of lines) {
      if (hasEmail(line) || isLabelOnlyLine(line) || isCompanyNoiseSection(line)) continue;
      if (looksLikeTimestamp(line) || looksLikeIdOrNumber(line)) continue;
      if (!result.company && COMPANY_HINTS.test(line)) { result.company = line; break; }
    }
    for (const line of lines) {
      if (hasEmail(line)) continue;
      if (isLabelOnlyLine(line)) continue;
      if (looksLikeTimestamp(line) || looksLikeIdOrNumber(line)) continue;
      if (/^[\d+().\-\s]{7,20}$/.test(line.replace(/\s/g, '')) && !/[a-z@]/i.test(line)) continue;
      if (/^(name|email|phone|company|first|last|tel|mobile|full|business|contact)\b.*[:：=]/i.test(line)) continue;
      if (!result.name && looksLikeName(line) && line !== result.company) {
        result.name = line;
        break;
      }
    }
    if (!result.company) {
      for (const line of lines) {
        if (line === result.name) continue;
        if (hasEmail(line) || isLabelOnlyLine(line) || isCompanyNoiseSection(line)) continue;
        if (looksLikeTimestamp(line) || looksLikeIdOrNumber(line)) continue;
        if (/^(mobile|cell|phone|email|fax)(\s+number)?\s*[:：]?\s*$/i.test(line.trim())) continue;
        if (line.replace(/\D/g, '').length >= 7 && !/[a-z@]{2,}/i.test(line)) continue;
        if (!result.company && line !== result.name) {
          if (looksLikeCompany(line)) { result.company = line; break; }
        }
      }
    }
  }

  // ── Extract underwriting fields from all tokens ───────────────────────────
  // Work from the flat row if available, otherwise all lines
  const allTokens: string[] = flatRow
    ? flatRow
    : lines.flatMap(l => l.split(/\s{2,}|\t/).map(s => s.trim())).filter(Boolean);

  for (const tok of allTokens) {
    const t = tok.trim();

    // SSN: 046-82-4092 (XXX-XX-XXXX)
    if (!result.ssn && /^\d{3}-\d{2}-\d{4}$/.test(t)) {
      result.ssn = t;
      continue;
    }
    // EIN: 99-4647015 (XX-XXXXXXX)
    if (!result.ein && /^\d{2}-\d{7}$/.test(t)) {
      result.ein = t;
      continue;
    }
    // DOB: 1988-01-09 (YYYY-MM-DD, year 1900-2010)
    if (!result.dob && /^\d{4}-\d{2}-\d{2}$/.test(t) && parseInt(t.slice(0, 4)) <= 2010 && parseInt(t.slice(0, 4)) >= 1900) {
      result.dob = t;
      continue;
    }
    // Business start date: YYYY-MM-DD after 1950, not DOB-range (often labeled separately)
    if (!result.businessStartDate && /^\d{4}-\d{2}-\d{2}$/.test(t) && parseInt(t.slice(0, 4)) >= 1950 && t !== result.dob) {
      result.businessStartDate = t;
      continue;
    }
    // ZIP: 5-digit number
    if (!result.zip && /^\d{5}$/.test(t)) {
      result.zip = t;
      continue;
    }
    // State: 2-letter US state abbreviation (uppercase)
    const US_STATE_ABBR = /^(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/;
    if (!result.state && US_STATE_ABBR.test(t)) {
      result.state = t;
      continue;
    }
    // Revenue / amount: decimal number like 44350.00 or 44350
    if (!result.monthlyRevenue && /^\d{4,}(\.\d{1,2})?$/.test(t) && parseFloat(t) >= 1000) {
      result.monthlyRevenue = String(Math.round(parseFloat(t)));
      continue;
    }
    // Industry: all-caps word(s), 3+ chars, not a status keyword
    const STATUS_WORDS = /^(DECLINED|APPROVED|PENDING|FUNDED|CLOSED|OPEN|ACTIVE|INACTIVE|RESTRICTED|YES|NO)$/i;
    if (!result.industry && /^[A-Z][A-Z\s]+$/.test(t) && t.length >= 3 && !STATUS_WORDS.test(t) && t !== result.state) {
      result.industry = t.trim();
      continue;
    }
    // City: capitalized word(s), not a name already captured, not company or state
    if (!result.city && /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(t) && t !== result.name && t !== result.company && !US_STATE_ABBR.test(t) && t.split(' ').length <= 3) {
      // Only set city if we already have state (increases confidence)
      if (result.state) {
        result.city = t;
        continue;
      }
    }
  }

  // ── Address: look for street-like tokens (number + street name) ──────────
  const streetRe = /^\d+\s+[A-Za-z].{3,}/;
  for (const tok of allTokens) {
    if (!result.homeAddress && streetRe.test(tok.trim()) && tok.trim().length > 6) {
      result.homeAddress = tok.trim();
      break;
    }
  }

  // ── Remainder: tokens we couldn't map ─────────────────────────────────────
  const mappedValues = new Set([
    result.name, result.email, result.phone, result.company,
    result.ssn, result.ein, result.dob, result.businessStartDate,
    result.zip, result.state, result.city, result.homeAddress,
    result.monthlyRevenue, result.industry,
  ].filter(Boolean));

  const remainderTokens: string[] = [];
  for (const tok of allTokens) {
    const t = tok.trim();
    if (t.length < 2) continue;
    if (looksLikeTimestamp(t)) continue;
    let mapped = false;
    for (const v of mappedValues) {
      if (v && (t === v || t.includes(v as string) || (v as string).includes(t))) { mapped = true; break; }
    }
    if (!mapped) remainderTokens.push(t);
  }
  if (remainderTokens.length) {
    result.remainder = remainderTokens.slice(0, 8).join(' · ');
  }

  return result;
}
