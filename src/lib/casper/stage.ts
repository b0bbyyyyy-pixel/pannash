export type DealStage =
  | 'NEW'
  | 'DRIP'
  | 'ACTIVE'
  | 'PENDING_SUBMISSION'
  | 'SUBMITTED'
  | 'OFFER_RECEIVED'
  | 'FUNDED'
  | 'DEAD';

export type LenderSubRow = { status?: string | null; created_at?: string | null };

export const OFFER_STATUSES = [
  'Offers/Follow up',
  'Approved',
  'Conditionally Approved',
  'Pre-Qualified',
];
export const DOCS_STATUSES = ['Docs In', 'Docs Received'];
export const PROSPECT_STATUSES = [
  'New Lead',
  'Prospect',
  'Contacted',
  'Callback Scheduled',
  'Revisit',
  'App Out',
  'Application Acknowledgement',
  'Documents Acknowledgment',
  'Docs Requested',
  'Missing Docs/info',
  'Needs More Docs',
];
export const SUBMITTED_STATUSES = [
  'Submitted',
  'Submitted To Non-MCA',
  'Submitted to Underwriting',
  'In Underwriting',
];
export const APPROVAL_STATUSES = [
  'Offers/Follow up',
  'Pre-Qualified',
  'Approved',
  'Conditionally Approved',
  'Contract Sent',
  'Contract In',
  'Contract Signed',
  'Contract Out',
];
export const DECLINED_STATUSES = [
  'Declined',
  'All Declined/Final',
  'Merchant Declined Offer',
];

const FUNDED = setOf(['Funded']);
const OFFER = setOf(APPROVAL_STATUSES);
const SUBMITTED = setOf(SUBMITTED_STATUSES);
const PENDING = setOf(DOCS_STATUSES);
const ACTIVE = setOf([
  'Prospect',
  'Contacted',
  'Callback Scheduled',
  'Revisit',
  'App Out',
  'Application Acknowledgement',
  'Documents Acknowledgment',
  'Docs Requested',
  'Missing Docs/info',
  'Needs More Docs',
  'Proposal Sent',
  'Renewal Eligible',
  'Renewal In Progress',
  'Renewal',
  'LOC',
]);
const DEAD = setOf([
  'Dead',
  'DNC',
  'Not Interested',
  'Declined',
  'All Declined/Final',
  'Merchant Declined Offer',
  'In Default',
]);

function setOf(names: string[]) {
  return new Set(names.map(norm));
}

export function norm(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

function subStatus(s: string | null | undefined) {
  return norm(s);
}

function hasApproved(subs: LenderSubRow[]) {
  return subs.some(s => subStatus(s.status) === 'approved');
}

function openSubs(subs: LenderSubRow[]) {
  return subs.filter(s => {
    const st = subStatus(s.status);
    return st === 'sent' || st === 'awaiting response' || st === 'awaiting_response';
  });
}

export const DEFAULT_STATUS_NAMES = [
  'New Lead', 'Prospect', 'Contacted', 'Callback Scheduled', 'Revisit', 'App Out',
  'Application Acknowledgement', 'Documents Acknowledgment', 'Docs Requested',
  'Missing Docs/info', 'Needs More Docs', 'Docs In', 'Docs Received', 'Submitted',
  'Submitted To Non-MCA', 'Submitted to Underwriting', 'In Underwriting',
  'Pre-Qualified', 'Conditionally Approved', 'Approved', 'Contract Sent',
  'Contract In', 'Contract Signed', 'Contract Out', 'Funded', 'Renewal Eligible',
  'Renewal In Progress', 'Renewal', 'LOC', 'Declined', 'All Declined/Final',
  'Merchant Declined Offer', 'Not Interested', 'Dead', 'DNC', 'In Default',
  'Wood', 'SPANISH SPEAKING ONLY',
];

export function dealStageFromLead(
  lead: {
    lead_status?: string | null;
    in_pipeline?: boolean | null;
    list_id?: string | null;
    sms_opt_out?: boolean | null;
  },
  subs: LenderSubRow[] = [],
): { stage: DealStage; submittedAt: string | null; why: string } {
  const status = String(lead.lead_status ?? '').trim();
  const key = norm(status);

  const round = [...openSubs(subs), ...subs.filter(s => subStatus(s.status) === 'approved')];
  const submittedAt = earliest(round.map(s => s.created_at).filter(Boolean) as string[])
    ?? earliest(openSubs(subs).map(s => s.created_at).filter(Boolean) as string[]);

  if (lead.sms_opt_out || DEAD.has(key)) {
    return { stage: 'DEAD', submittedAt, why: lead.sms_opt_out ? 'sms_opt_out' : `status:${status || 'empty'}` };
  }
  if (FUNDED.has(key)) return { stage: 'FUNDED', submittedAt, why: `status:${status}` };
  if (OFFER.has(key) || hasApproved(subs)) {
    return {
      stage: 'OFFER_RECEIVED',
      submittedAt,
      why: OFFER.has(key) ? `status:${status}` : 'lender_submissions:Approved',
    };
  }
  if (SUBMITTED.has(key) || (openSubs(subs).length > 0 && !hasApproved(subs))) {
    return {
      stage: 'SUBMITTED',
      submittedAt,
      why: SUBMITTED.has(key) ? `status:${status}` : 'lender_submissions:Sent/Awaiting Response',
    };
  }
  if (PENDING.has(key)) return { stage: 'PENDING_SUBMISSION', submittedAt, why: `status:${status}` };
  if (ACTIVE.has(key) || (lead.in_pipeline && key && key !== 'new lead')) {
    return { stage: 'ACTIVE', submittedAt, why: key ? `status:${status}` : 'in_pipeline' };
  }
  if (!lead.in_pipeline && lead.list_id && (!key || key === 'new lead')) {
    return { stage: 'DRIP', submittedAt, why: 'list_not_in_pipeline' };
  }
  return { stage: 'NEW', submittedAt, why: status ? `status:${status}` : 'empty' };
}

function earliest(isos: string[]) {
  if (!isos.length) return null;
  const sorted = [...isos].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return sorted[0] ?? null;
}

export function submittedLockoutResult(args: {
  stage: DealStage;
  submittedAt: string | null;
  newestInboundAfterSubmit: boolean;
}): { ok: true } | { ok: false; result: string } {
  if (args.stage !== 'SUBMITTED') return { ok: true };
  if (args.newestInboundAfterSubmit) return { ok: true };
  const when = args.submittedAt
    ? new Date(args.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'submission';
  return {
    ok: false,
    result: `blocked: submitted_lockout (waiting on lenders; merchant hasn't texted since ${when})`,
  };
}
