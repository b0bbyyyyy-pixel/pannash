export const MERCHANT_STAGES = [
  'Received',
  'Reviewing',
  'Docs needed',
  'Submitted to partners',
  'Offers ready',
  'Finalizing',
  'Funded',
  'Closed',
] as const;

export type MerchantStage = (typeof MERCHANT_STAGES)[number];

const RECEIVED = [
  'New Lead', 'Prospect', 'Contacted', 'Callback Scheduled', 'Revisit',
  'App Out', 'Application Acknowledgement',
];
const REVIEWING = [
  'Docs In', 'Docs Received', 'In Underwriting', 'Pre-Qualified', 'Conditionally Approved',
];
const DOCS_NEEDED = [
  'Docs Requested', 'Missing Docs/info', 'Needs More Docs', 'Documents Acknowledgment',
];
const SUBMITTED = [
  'Submitted', 'Submitted To Non-MCA', 'Submitted to Underwriting',
];
const OFFERS = ['Approved'];
const FINALIZING = [
  'Contract Out', 'Contracts Out', 'Contract Sent', 'Contract In', 'Contract Signed',
];
const FUNDED = ['Funded'];
const CLOSED = [
  'Declined', 'Dead', 'Not Interested', 'All Declined/Final', 'Merchant Declined Offer', 'DNC',
];

function bucket(names: string[], stage: MerchantStage) {
  return Object.fromEntries(names.map(name => [name.toLowerCase(), stage]));
}

export const DEFAULT_STAGE_MAP: Record<string, MerchantStage> = {
  ...bucket(RECEIVED, 'Received'),
  ...bucket(REVIEWING, 'Reviewing'),
  ...bucket(DOCS_NEEDED, 'Docs needed'),
  ...bucket(SUBMITTED, 'Submitted to partners'),
  ...bucket(OFFERS, 'Offers ready'),
  ...bucket(FINALIZING, 'Finalizing'),
  ...bucket(FUNDED, 'Funded'),
  ...bucket(CLOSED, 'Closed'),
};

export function parseStageMap(raw: unknown): Record<string, MerchantStage> {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STAGE_MAP };
  const next = { ...DEFAULT_STAGE_MAP };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (MERCHANT_STAGES.includes(value as MerchantStage)) {
      next[key.trim().toLowerCase()] = value as MerchantStage;
    }
  }
  return next;
}

export function mapLeadStatus(status: string | null | undefined, stageMap?: Record<string, MerchantStage>): MerchantStage {
  const map = stageMap && Object.keys(stageMap).length ? stageMap : DEFAULT_STAGE_MAP;
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'Reviewing';
  return map[key] || 'Reviewing';
}

export function resolveMerchantStage(opts: {
  leadStatus?: string | null;
  stageMap?: Record<string, MerchantStage>;
  hasActiveOffer?: boolean;
  hasPartnerSubmission?: boolean;
}): MerchantStage {
  const mapped = mapLeadStatus(opts.leadStatus, opts.stageMap);
  if (mapped === 'Funded' || mapped === 'Closed') return mapped;
  if (opts.hasActiveOffer || mapped === 'Offers ready') return 'Offers ready';
  if (opts.hasPartnerSubmission || mapped === 'Submitted to partners') return 'Submitted to partners';
  return mapped;
}

export function closedCopy() {
  return "We weren't able to find a match right now. Contact us to talk about options.";
}

export function stageUpdatedAt(ud: Record<string, unknown> | null | undefined): string | null {
  const history = Array.isArray(ud?.statusHistory) ? ud.statusHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (row && typeof row === 'object' && typeof (row as { at?: string }).at === 'string') {
      return (row as { at: string }).at;
    }
  }
  return null;
}
