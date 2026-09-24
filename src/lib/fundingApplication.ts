import { requestedAmountFromMonthlyRevenue } from '@/lib/bankAnalyzer';

export const APPLICATION_BROKER = {
  name: 'Robert Gulinello',
  email: 'bob@businessfundusa.com',
} as const;

export type ApplicationLeadInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  value?: number | string | null;
  underwriting_data?: Record<string, unknown> | null;
};

export type Owner2Application = {
  name: string;
  title: string;
  homeAddress: string;
  email: string;
  ssn: string;
  dob: string;
  ownershipPercent: string;
  creditScore: string;
};

export type FundingApplicationData = {
  legalName: string;
  dba: string;
  businessAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessPhone: string;
  businessEmail: string;
  ein: string;
  dateStarted: string;
  entityType: string;
  industry: string;
  useOfProceeds: string;
  annualRevenue: string;
  requestedAmount: string;
  owner1Name: string;
  owner1Title: string;
  owner1HomeAddress: string;
  owner1Email: string;
  owner1Ssn: string;
  owner1Dob: string;
  owner1Ownership: string;
  owner1Credit: string;
  owner2: Owner2Application | null;
};

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function isFilled(v: unknown): boolean {
  return str(v).length > 0 && str(v) !== '—' && str(v) !== '--';
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function withPercent(v: string): string {
  if (!v) return '';
  return v.includes('%') ? v : `${v}%`;
}

function composeAddress(street: string, city: string, state: string, zip: string): string {
  const tail = [city, state, zip].filter(Boolean).join(' ');
  if (street && tail) {
    const already = street.toLowerCase().includes(city.toLowerCase());
    return already ? street : `${street} ${tail}`;
  }
  return street || tail;
}

function formatFormDate(raw: string): string {
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export const APPLICATION_REQUIRED: { key: keyof FundingApplicationData; label: string; leadField: string }[] = [
  { key: 'legalName', label: 'Legal Name', leadField: 'Company → Legal Name' },
  { key: 'businessAddress', label: 'Physical Address', leadField: 'Company → Address' },
  { key: 'businessCity', label: 'City', leadField: 'Company → City' },
  { key: 'businessState', label: 'State', leadField: 'Company → State' },
  { key: 'businessZip', label: 'ZIP', leadField: 'Company → ZIP' },
  { key: 'businessPhone', label: 'Business Phone', leadField: 'Company → Business Phone (or Mobile)' },
  { key: 'businessEmail', label: 'Business Email', leadField: 'Person → Email' },
  { key: 'ein', label: 'Federal Tax ID (EIN)', leadField: 'Company → EIN' },
  { key: 'dateStarted', label: 'Date Started', leadField: 'Company → Start Date' },
  { key: 'entityType', label: 'Entity Type', leadField: 'Company → Entity Type' },
  { key: 'industry', label: 'Industry', leadField: 'Company → Industry' },
  { key: 'useOfProceeds', label: 'Use of Proceeds', leadField: 'Deal → Use of Funds' },
  { key: 'annualRevenue', label: 'Annual Revenue', leadField: 'Deal → Avg Monthly Rev' },
  { key: 'requestedAmount', label: 'Requested Amount', leadField: 'Deal → Amount Requested' },
  { key: 'owner1Name', label: 'Owner Name', leadField: 'Person → Full Name' },
  { key: 'owner1HomeAddress', label: 'Home Address', leadField: 'Details → Home Address' },
  { key: 'owner1Email', label: 'Owner Email', leadField: 'Person → Email' },
  { key: 'owner1Ssn', label: 'SSN', leadField: 'Details → SSN' },
  { key: 'owner1Dob', label: 'Date of Birth', leadField: 'Details → DOB' },
  { key: 'owner1Ownership', label: 'Ownership %', leadField: 'Company → Ownership %' },
];

export function buildFundingApplication(lead: ApplicationLeadInput): {
  data: FundingApplicationData;
  missing: string[];
  populatedRequested: number | null;
} {
  const ud = (lead.underwriting_data || {}) as Record<string, unknown>;

  const monthly = num(ud.monthlyRevenue);
  const existingRequested = num(lead.value) ?? num(ud.requestedAmount);
  const populatedRequested = existingRequested == null ? requestedAmountFromMonthlyRevenue(monthly) : null;
  const requested = existingRequested ?? populatedRequested;
  const entityType = isFilled(ud.entityType)
    ? str(ud.entityType)
    : (ud.isSoleProp === true || ud.isSoleProp === 'true' ? 'Sole Proprietor' : '');

  const owner2Name = [str(ud.owner2FirstName), str(ud.owner2LastName)].filter(Boolean).join(' ');
  const hasOwner2 = isFilled(owner2Name) || isFilled(ud.owner2Ssn) || isFilled(ud.owner2Dob);
  const owner2: Owner2Application | null = hasOwner2
    ? {
        name: owner2Name,
        title: str(ud.owner2Title) || 'Owner',
        homeAddress: composeAddress(
          str(ud.owner2HomeAddress || ud.owner2Address),
          str(ud.owner2City),
          str(ud.owner2State),
          str(ud.owner2Zip),
        ),
        email: str(ud.owner2Email),
        ssn: str(ud.owner2Ssn),
        dob: formatFormDate(str(ud.owner2Dob)),
        ownershipPercent: withPercent(str(ud.owner2OwnershipPercent ?? ud.owner2Ownership)),
        creditScore: isFilled(ud.owner2CreditScore) ? str(ud.owner2CreditScore) : 'N/A',
      }
    : null;

  const data: FundingApplicationData = {
    legalName: str(lead.company),
    dba: str(ud.dba),
    businessAddress: str(ud.businessAddress),
    businessCity: str(ud.businessCity),
    businessState: str(ud.businessState),
    businessZip: str(ud.businessZip),
    businessPhone: str(ud.businessPhone) || str(lead.phone),
    businessEmail: str(ud.businessEmail) || str(lead.email),
    ein: str(ud.ein),
    dateStarted: formatFormDate(str(ud.businessStartDate)),
    entityType,
    industry: str(ud.industry),
    useOfProceeds: str(ud.purposeOfFunds),
    annualRevenue: monthly != null && monthly > 0 ? money(monthly * 12) : '',
    requestedAmount: requested != null && requested > 0 ? money(requested) : '',
    owner1Name: str(lead.name),
    owner1Title: str(ud.ownerTitle) || 'Owner',
    owner1HomeAddress: composeAddress(str(ud.homeAddress), str(ud.city), str(ud.state), str(ud.zip)),
    owner1Email: str(lead.email),
    owner1Ssn: str(ud.ssn),
    owner1Dob: formatFormDate(str(ud.dob)),
    owner1Ownership: withPercent(str(ud.ownershipPercent)),
    owner1Credit: isFilled(ud.creditScore) ? str(ud.creditScore) : 'N/A',
    owner2,
  };

  const missing: string[] = [];
  for (const field of APPLICATION_REQUIRED) {
    const val = data[field.key];
    if (typeof val === 'string' && !isFilled(val) && !missing.includes(field.leadField)) {
      missing.push(field.leadField);
    }
  }

  if (owner2) {
    if (!isFilled(owner2.name)) missing.push('Owner 2 → Name');
    if (!isFilled(owner2.homeAddress)) missing.push('Owner 2 → Address');
    if (!isFilled(owner2.ssn)) missing.push('Owner 2 → SSN');
    if (!isFilled(owner2.dob)) missing.push('Owner 2 → DOB');
    if (!isFilled(owner2.ownershipPercent)) missing.push('Owner 2 → Ownership %');
  }

  return { data, missing, populatedRequested };
}

export function applicationFileName(legalName: string, now = new Date()): string {
  const safe = (legalName || 'Application').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `ABF_Application_${safe}_${y}-${m}-${d}.pdf`;
}

export function formatStampDate(now = new Date()): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[now.getMonth()]}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
}

export function formatStampDateTime(now = new Date()): string {
  const date = formatStampDate(now);
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${date} ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}
