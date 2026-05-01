/**
 * Parse freeform pasted text (email signature, vCard, copied rows, key:value lines)
 * into name, email, phone, and company for quick CRM lead adds.
 * Heuristics align loosely with src/app/leads/UploadForm positional mapping.
 */

export type ParsedLeadPaste = {
  name: string;
  email: string;
  phone: string;
  company: string;
  /** Text we could not map (optional; e.g. for future notes) */
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

const COMPANY_HINTS = /\b(inc|llc|l\.l\.c|corp|ltd|co\.|company|group|solutions|services|llp)\b/i;

function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (hasEmail(t)) return false;
  if (/^https?:/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  return /^[a-zA-Z][a-zA-Z\s\-'.]+$/.test(t);
}

function looksLikeCompany(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (hasEmail(t)) return false;
  return COMPANY_HINTS.test(t) || t.split(/\s+/).length >= 2;
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
  if (lines.length === 1) {
    const row = lines[0].split(/[,\t|]/).map((c) => c.trim()).filter(Boolean);
    if (row.length > 1) {
      for (const cell of row) {
        if (!result.email) {
          const em = findEmails(cell);
          if (em[0]) result.email = em[0];
        }
        if (!result.phone && !hasEmail(cell) && /[\d().+\-\s]{10,14}/.test(cell)) {
          const p = cell.match(PHONE_CANDIDATE) || [cell];
          if (p[0]) result.phone = normalizePhone(p[0]);
        }
      }
      for (const cell of row) {
        if (hasEmail(cell)) continue;
        if (!result.name && looksLikeName(cell) && !/[()]/.test(cell)) {
          result.name = cell;
          break;
        }
      }
      for (const cell of row) {
        if (cell === result.name || (result.email && cell.includes(result.email))) continue;
        if (hasEmail(cell)) continue;
        if (isCompanyNoiseSection(cell)) continue;
        if (!result.company && cell.length > 1 && cell !== result.phone) {
          if (looksLikeCompany(cell) || (row.length <= 4 && !result.name)) {
            result.company = result.company || cell;
          }
        }
      }
    }
  }

  // Multi-line: name = first plausible person line; company = first company-like line
  if (lines.length > 1) {
    for (const line of lines) {
      if (hasEmail(line)) continue;
      if (isLabelOnlyLine(line)) continue;
      if (/^[\d+().\-\s]{7,20}$/.test(line.replace(/\s/g, '')) && !/[a-z@]/i.test(line)) continue;
      if (/^(name|email|phone|company|first|last|tel|mobile|full|business|contact)\b.*[:：=]/i.test(line)) {
        continue;
      }
      if (!result.name && looksLikeName(line) && !COMPANY_HINTS.test(line)) {
        result.name = line;
        break;
      }
    }
    for (const line of lines) {
      if (line === result.name) continue;
      if (hasEmail(line)) continue;
      if (isLabelOnlyLine(line)) continue;
      if (isCompanyNoiseSection(line)) continue;
      if (/^(mobile|cell|phone|email|fax)(\s+number)?\s*[:：]?\s*$/i.test(line.trim())) continue;
      if (/^mobile number$/i.test(line.trim())) continue;
      if (line.replace(/\D/g, '').length >= 7 && !/[a-z@]{2,}/i.test(line)) continue;
      if (!result.company && line !== result.name) {
        if (looksLikeCompany(line) || (line.length > 12 && /[a-zA-Z]/.test(line))) {
          result.company = line;
          break;
        }
      }
    }
  }

  // Remainder: lines we didn't use (for visibility)
  const used = new Set(
    [result.name, result.email, result.phone, result.company].filter(Boolean)
  );
  const remainder: string[] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    let u = false;
    for (const s of used) {
      if (line.includes(s) || s.includes(line)) u = true;
    }
    if (!u && !line.match(/^(name|email|phone|company)\s*[:=]/i)) {
      if (isLabelOnlyLine(line) || isCompanyNoiseSection(line)) continue;
      if (![result.name, result.email, result.company].some((x) => x && line === x)) {
        remainder.push(line);
      }
    }
  }
  if (remainder.length) {
    result.remainder = remainder.slice(0, 5).join(' | ');
  }

  return result;
}
