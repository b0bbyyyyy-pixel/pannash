/** Canonical application / underwriting keys used by the Application tab. */

const LABEL_TO_KEY: { key: string; needles: string[]; owner2?: boolean }[] = [
  { key: 'ein', needles: ['ein', 'fein', 'federaltaxid', 'federaltax', 'taxidnumber', 'taxid', 'employeridentification', 'employerid'] },
  { key: 'entityType', needles: ['entitytype', 'typeofentity', 'businessstructure', 'legalstructure', 'organizationtype', 'orgtype', 'businesstypeentity'] },
  { key: 'purposeOfFunds', needles: ['purposeoffunds', 'useoffunds', 'useofproceeds', 'loanpurpose', 'fundingpurpose', 'proceeds'] },
  { key: 'requestedAmount', needles: ['requestedamount', 'amountrequested', 'fundingamount', 'loanamount', 'requestamount', 'amountoffunding'] },
  { key: 'monthlyRevenue', needles: ['monthlyrevenue', 'avgmonthlyrevenue', 'averagemonthlyrevenue', 'monthlysales', 'grossmonthly', 'averagemonthlysales', 'avgmonthlysales'] },
  { key: 'ownershipPercent', needles: ['ownershippercent', 'ownershippct', 'percentowned', 'ownership', 'pctowned', 'percentownership'] },
  { key: 'ssn', needles: ['ssn', 'socialsecuritynumber', 'socialsecurity', 'ssnumber'] },
  { key: 'dob', needles: ['dob', 'dateofbirth', 'birthdate', 'birth'] },
  { key: 'homeAddress', needles: ['homeaddress', 'homestreet', 'residentialaddress', 'residenceaddress', 'owneraddress', 'ownerhomeaddress'] },
  { key: 'city', needles: ['homecity', 'ownercity', 'residentialcity'] },
  { key: 'state', needles: ['homestate', 'ownerstate', 'residentialstate'] },
  { key: 'zip', needles: ['homezip', 'homezipcode', 'ownerzip', 'residentialzip'] },
  { key: 'name', needles: ['ownername', 'ownersname', 'fullname', 'applicantname', 'principalname'] },
  { key: 'email', needles: ['emailaddress', 'owneremail', 'applicantemail'] },
  { key: 'phone', needles: ['mobilephone', 'cellphone', 'cell', 'ownerphone', 'mobile'] },
  { key: 'company', needles: ['legalname', 'legalbusinessname', 'businessname', 'companyname'] },
  { key: 'dba', needles: ['dba', 'tradename', 'doingbusinessas'] },
  { key: 'businessAddress', needles: ['businessaddress', 'companyaddress', 'physicaladdress', 'businessstreet'] },
  { key: 'businessCity', needles: ['businesscity', 'companycity'] },
  { key: 'businessState', needles: ['businessstate', 'companystate'] },
  { key: 'businessZip', needles: ['businesszip', 'companyzip'] },
  { key: 'industry', needles: ['industry', 'naics', 'businesstype'] },
  { key: 'businessStartDate', needles: ['businessstartdate', 'datestarted', 'startdate', 'inceptiondate', 'dateestablished'] },
  { key: 'businessPhone', needles: ['businessphone', 'companyphone', 'workphone'] },
  { key: 'creditScore', needles: ['creditscore', 'fico', 'ficoscore'] },
  { key: 'avgDailyBalance', needles: ['avgdailybalance', 'averagedailybalance', 'adb'] },
];

const OWNER2_LABEL_TO_KEY: { key: string; needles: string[] }[] = [
  { key: 'owner2FirstName', needles: ['firstname', 'first'] },
  { key: 'owner2LastName', needles: ['lastname', 'last'] },
  { key: 'owner2Dob', needles: ['dob', 'dateofbirth', 'birthdate'] },
  { key: 'owner2Ssn', needles: ['ssn', 'socialsecurity'] },
  { key: 'owner2OwnershipPercent', needles: ['ownership', 'percentowned', 'ownershippercent'] },
  { key: 'owner2Email', needles: ['email'] },
  { key: 'owner2HomeAddress', needles: ['address', 'homeaddress'] },
];

const KEY_ALIASES: Record<string, string> = {
  federalTaxId: 'ein',
  fein: 'ein',
  taxId: 'ein',
  taxID: 'ein',
  EIN: 'ein',
  entity: 'entityType',
  businessStructure: 'entityType',
  typeOfEntity: 'entityType',
  useOfFunds: 'purposeOfFunds',
  useOfProceeds: 'purposeOfFunds',
  purpose: 'purposeOfFunds',
  amountRequested: 'requestedAmount',
  fundingAmount: 'requestedAmount',
  loanAmount: 'requestedAmount',
  avgMonthlyRevenue: 'monthlyRevenue',
  averageMonthlyRevenue: 'monthlyRevenue',
  monthlySales: 'monthlyRevenue',
  ownership: 'ownershipPercent',
  percentOwned: 'ownershipPercent',
  ownershipPct: 'ownershipPercent',
  dateOfBirth: 'dob',
  birthDate: 'dob',
  socialSecurity: 'ssn',
  socialSecurityNumber: 'ssn',
  homeStreet: 'homeAddress',
  residentialAddress: 'homeAddress',
  ownerAddress: 'homeAddress',
  legalName: 'company',
  businessName: 'company',
  fullName: 'name',
  ownerName: 'name',
  emailAddress: 'email',
  mobile: 'phone',
  cell: 'phone',
  dateStarted: 'businessStartDate',
  startDate: 'businessStartDate',
  owner2DOB: 'owner2Dob',
  owner2SSN: 'owner2Ssn',
  owner2Ownership: 'owner2OwnershipPercent',
  firstName: 'firstName',
  lastName: 'lastName',
};

/** Labels that get glued onto the previous PDF field when the text layer has no space. Longest first. */
const EMBEDDED_LABELS: { key: string; phrases: string[] }[] = [
  { key: 'purposeOfFunds', phrases: ['use of funds', 'use of proceeds', 'purpose of funds', 'purpose of loan'] },
  { key: 'requestedAmount', phrases: ['amount requested', 'requested amount', 'funding amount'] },
  { key: 'monthlyRevenue', phrases: ['avg monthly revenue', 'average monthly revenue', 'monthly revenue'] },
  { key: 'ownershipPercent', phrases: ['ownership percent', 'ownership %', 'percent owned', 'ownership'] },
  { key: 'entityType', phrases: ['entity type', 'type of entity', 'business structure'] },
  { key: 'homeAddress', phrases: ['home address', 'residential address'] },
  { key: 'businessStartDate', phrases: ['start date', 'date started', 'date established'] },
  { key: 'ein', phrases: ['federal tax id', 'fein', 'ein'] },
  { key: 'ssn', phrases: ['social security number', 'social security', 'ssn'] },
  { key: 'dob', phrases: ['date of birth', 'birth date', 'dob'] },
  { key: 'industry', phrases: ['industry'] },
];

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksOwner2(label: string): boolean {
  const n = compact(label);
  return /owner2|ownertwo|secondowner|guarantor|coowner|ownerii/.test(n);
}

function canonicalFromLabel(label: string): string | null {
  const n = compact(label);
  if (!n) return null;
  if (looksOwner2(label)) {
    for (const row of OWNER2_LABEL_TO_KEY) {
      if (row.needles.some(needle => n.includes(needle))) return row.key;
    }
    return null;
  }
  let best: { key: string; len: number } | null = null;
  for (const row of LABEL_TO_KEY) {
    for (const needle of row.needles) {
      if (n === needle || n.endsWith(needle) || n.includes(needle)) {
        if (!best || needle.length > best.len) best = { key: row.key, len: needle.length };
      }
    }
  }
  return best?.key ?? null;
}

function cleanValue(raw: unknown): string {
  if (raw == null) return '';
  const s = Array.isArray(raw) ? raw.filter(Boolean).join(' ').trim() : String(raw).trim();
  if (!s || /^(off|null|undefined|n\/?a|none|--)$/i.test(s)) return '';
  return s;
}

function setIfEmpty(out: Record<string, string>, key: string, value: string) {
  if (!key || !value) return;
  if (out[key]?.trim()) return;
  out[key] = value;
}

function isolateDate(raw: string): string {
  const s = raw.trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdY = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b/);
  if (mdY) {
    const y = mdY[3].length === 2 ? `20${mdY[3]}` : mdY[3];
    return `${y}-${mdY[1].padStart(2, '0')}-${mdY[2].padStart(2, '0')}`;
  }
  return s;
}

export function monthsInBusinessFromStartDate(raw: unknown, now = new Date()): number | null {
  const isolated = isolateDate(String(raw ?? '').trim());
  if (!isolated) return null;
  const start = new Date(isolated);
  if (Number.isNaN(start.getTime())) return null;
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, months);
}

/** Pull a later "Label: value" that PDF text glued onto this field. */
function peelEmbeddedFields(value: string): { cleaned: string; extras: Record<string, string> } {
  const extras: Record<string, string> = {};
  let remaining = value.trim();
  let guard = 0;
  while (remaining && guard++ < 8) {
    const lower = remaining.toLowerCase();
    let hit: { index: number; key: string; phraseLen: number } | null = null;
    for (const row of EMBEDDED_LABELS) {
      for (const phrase of row.phrases) {
        let from = 0;
        while (from < lower.length) {
          const idx = lower.indexOf(phrase, from);
          if (idx < 0) break;
          const beforeChar = idx > 0 ? remaining[idx - 1] : '';
          const after = remaining.slice(idx + phrase.length);
          const short = phrase.replace(/\s/g, '').length <= 4;
          const prevOk = !beforeChar || /[^A-Za-z]/.test(beforeChar);
          const colonOk = /^\s*:/.test(after);
          const ok = idx > 0 && (!short || (prevOk && colonOk));
          if (ok && (!hit || idx < hit.index || (idx === hit.index && phrase.length > hit.phraseLen))) {
            hit = { index: idx, key: row.key, phraseLen: phrase.length };
            break;
          }
          from = idx + 1;
        }
      }
    }
    if (!hit) break;
    const afterLabel = remaining.slice(hit.index + hit.phraseLen).replace(/^\s*[:=]\s*/, ' ').trim();
    const before = remaining.slice(0, hit.index).trim();
    if (!afterLabel) break;
    if (!extras[hit.key]) extras[hit.key] = afterLabel;
    remaining = before;
  }
  return { cleaned: remaining, extras };
}

function applyDateKeys(out: Record<string, string>) {
  if (out.businessStartDate) out.businessStartDate = isolateDate(out.businessStartDate);
  if (out.dob) out.dob = isolateDate(out.dob);
  if (out.owner2Dob) out.owner2Dob = isolateDate(out.owner2Dob);
}

function applyTib(out: Record<string, string>) {
  const tib = monthsInBusinessFromStartDate(out.businessStartDate);
  if (tib != null) out.timeInBusiness = String(tib);
}

/** Map "Label: value" lines (AcroForm dumps, OCR) onto canonical keys. */
export function fieldsFromLabeledText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text.trim()) return out;
  for (const line of text.split(/\n+/)) {
    const m = line.match(/^(.{1,80}?)\s*[:#]\s*(.+)$/);
    if (!m) continue;
    const value = cleanValue(m[2]);
    if (!value) continue;
    const key = canonicalFromLabel(m[1]);
    if (key) setIfEmpty(out, key, value);
  }
  return out;
}

/** Rename AI / form aliases onto Application-tab keys. Does not overwrite filled canonical keys. */
export function normalizeParsedFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const value = cleanValue(v);
    if (!value) continue;
    const mapped = KEY_ALIASES[k] || k;
    const peeled = peelEmbeddedFields(value);
    const primary = peeled.cleaned || (extras[mapped] ? '' : value);
    if (primary) setIfEmpty(out, mapped, primary);
    for (const [ek, ev] of Object.entries(peeled.extras)) {
      const nested = peelEmbeddedFields(ev);
      setIfEmpty(extras, ek, nested.cleaned || ev);
      for (const [nk, nv] of Object.entries(nested.extras)) setIfEmpty(extras, nk, nv);
    }
  }
  for (const [k, v] of Object.entries(extras)) setIfEmpty(out, k, v);

  const first = cleanValue(out.firstName);
  const last = cleanValue(out.lastName);
  if (!out.name && (first || last)) out.name = [first, last].filter(Boolean).join(' ');

  if (out.owner2Ownership && !out.owner2OwnershipPercent) {
    out.owner2OwnershipPercent = out.owner2Ownership;
  }
  if (out.owner2DOB && !out.owner2Dob) out.owner2Dob = out.owner2DOB;
  if (out.owner2SSN && !out.owner2Ssn) out.owner2Ssn = out.owner2SSN;

  applyDateKeys(out);
  applyTib(out);
  return out;
}

export function mergeParsedFieldMaps(
  ...parts: Array<Record<string, string> | null | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (!part) continue;
    const normalized = normalizeParsedFields(part);
    for (const [k, v] of Object.entries(normalized)) setIfEmpty(out, k, v);
  }
  applyDateKeys(out);
  applyTib(out);
  return out;
}

/** Fix already-saved underwriting strings that had the next PDF label glued on. */
export function sanitizeUnderwritingStrings(ud: Record<string, unknown>): Record<string, unknown> {
  const strings: Record<string, string> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ud)) {
    if (typeof v === 'string') strings[k] = v;
    else rest[k] = v;
  }
  const cleaned = normalizeParsedFields(strings);
  const out: Record<string, unknown> = { ...ud, ...rest, ...cleaned };
  const tib = monthsInBusinessFromStartDate(out.businessStartDate);
  if (tib != null && !Number(out.timeInBusiness)) {
    out.timeInBusiness = tib;
  }
  return out;
}
