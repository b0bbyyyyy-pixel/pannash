import { inferFromLegalName } from '@/lib/businessName';
import { monthsInBusinessFromStartDate, normalizeParsedFields } from '@/lib/normalizeParsedFields';
import {
  compactMetricsForStorage,
  mapAnalyzerMetricsToUnderwritingFields,
  mapParsedBankFieldsToUd,
  mergeMcaPositions,
  mergeStatementMonths,
  parseStatementMonths,
  requestedAmountFromMonthlyRevenue,
  seedBankAnalysisFromParsed,
  statementMonthFromFields,
  statementMonthsFromUd,
} from '@/lib/bankAnalyzer';
import { preserveFileActivity } from '@/lib/leads/fileActivity';

const DIRECT = new Set(['company', 'name', 'email', 'phone', 'notes', 'stage', 'value']);
const BANK_KEYS = new Set([
  'totalDeposits', 'totalWithdrawals', 'openingBalance', 'depositCount', 'depositsCount',
  'mcaPositions', 'hasOtherMCALoans', 'nsfCount', 'negativeDays', 'avgDailyBalance',
  'endingBalance', 'monthlyRevenue', 'largestDeposit', 'statementMonth', 'bankName',
  'accountNumber', 'month1Revenue', 'month2Revenue', 'month3Revenue', 'month4Revenue',
  'statementMonths',
]);

export function mergeParsedFieldsIntoLead(args: {
  fields: Record<string, string>;
  selected?: Set<string>;
  currentUd: Record<string, unknown>;
  currentCompany?: string | null;
  fallbackCompany?: string | null;
}): {
  directUpdates: Record<string, string>;
  mergedUd: Record<string, unknown> | null;
  requestedAmount: number | null;
} {
  const normalized = normalizeParsedFields(args.fields);
  const selected = args.selected ?? new Set(Object.keys(args.fields));
  const selectedNorm = new Set(selected);
  for (const k of selected) {
    for (const nk of Object.keys(normalizeParsedFields({ [k]: args.fields[k] || '' }))) selectedNorm.add(nk);
  }

  const directUpdates: Record<string, string> = {};
  const udUpdates: Record<string, string> = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (!selectedNorm.has(k) || !v) continue;
    if (DIRECT.has(k)) directUpdates[k] = v;
    else udUpdates[k] = v;
  }

  const currentUd = args.currentUd || {};
  const legalName = (directUpdates.company || String(args.currentCompany || args.fallbackCompany || '')).trim();
  if (legalName) {
    const inferred = inferFromLegalName(legalName);
    if (!String(udUpdates.dba || currentUd.dba || '').trim() && inferred.dba) {
      udUpdates.dba = inferred.dba;
    }
    if (!String(udUpdates.entityType || currentUd.entityType || '').trim() && inferred.entityType) {
      udUpdates.entityType = inferred.entityType;
    }
  }

  const incomingMonths = parseStatementMonths(udUpdates.statementMonths);
  const single = incomingMonths.length ? [] : (() => {
    const one = statementMonthFromFields(udUpdates);
    return one ? [one] : [];
  })();
  const combinedMonths = mergeStatementMonths(
    statementMonthsFromUd(currentUd),
    incomingMonths.length ? incomingMonths : single,
  );
  if (combinedMonths.length) udUpdates.statementMonths = JSON.stringify(combinedMonths);

  const mappedBank = mapParsedBankFieldsToUd(udUpdates);
  const leftover: Record<string, string> = {};
  for (const [k, v] of Object.entries(udUpdates)) {
    if (k in mappedBank || BANK_KEYS.has(k)) continue;
    leftover[k] = v;
  }
  const tib = monthsInBusinessFromStartDate(leftover.businessStartDate || currentUd.businessStartDate);
  if (tib != null) leftover.timeInBusiness = String(tib);

  if (!Object.keys(mappedBank).length && !Object.keys(leftover).length) {
    return { directUpdates, mergedUd: null, requestedAmount: null };
  }

  if (mappedBank.mcaPositions && currentUd.mcaPositions) {
    const combined = mergeMcaPositions(currentUd.mcaPositions, mappedBank.mcaPositions);
    mappedBank.mcaPositions = combined;
    mappedBank.mcaPositionCount = combined.length;
    mappedBank.hasOtherMCALoans = combined.length > 0;
    mappedBank.otherMCALenders = combined.map(p => p.lender).filter(Boolean).join(', ');
    mappedBank.otherMCAMonthlyPayment = combined.reduce((s, p) => s + (p.monthlyPayment || 0), 0);
  }
  const hasBank = Object.keys(mappedBank).length > 0;
  const requested = requestedAmountFromMonthlyRevenue(mappedBank.monthlyRevenue);
  if (requested != null) mappedBank.requestedAmount = requested;
  const mergedUd: Record<string, unknown> = { ...currentUd, ...leftover, ...mappedBank };
  if (hasBank) {
    mergedUd.bankStatementAnalysis = seedBankAnalysisFromParsed(
      udUpdates,
      (currentUd.bankStatementAnalysis as Record<string, unknown> | undefined) ?? null,
    );
  }
  return { directUpdates, mergedUd, requestedAmount: requested };
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
}

const CRM_DIRECT = new Set(['company', 'name', 'email', 'phone', 'notes', 'stage', 'value']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function persistParsedFieldsToLead(
  supabase: { from: (table: string) => any },
  args: {
    userId: string;
    leadId: string;
    fields: Record<string, string>;
    selected?: Set<string>;
    fallbackCompany?: string | null;
  },
): Promise<{ ok: boolean }> {
  const { data: lead } = await supabase
    .from('leads')
    .select('company, underwriting_data')
    .eq('id', args.leadId)
    .eq('user_id', args.userId)
    .maybeSingle();
  if (!lead) return { ok: false };

  const merged = mergeParsedFieldsIntoLead({
    fields: args.fields,
    selected: args.selected,
    currentUd: asRecord(lead.underwriting_data),
    currentCompany: lead.company,
    fallbackCompany: args.fallbackCompany,
  });

  for (const [field, value] of Object.entries(merged.directUpdates)) {
    if (!CRM_DIRECT.has(field)) continue;
    await supabase.from('leads').update({ [field]: value }).eq('id', args.leadId).eq('user_id', args.userId);
  }
  if (merged.mergedUd) {
    const ud = preserveFileActivity(merged.mergedUd, lead.underwriting_data);
    await supabase.from('leads').update({ underwriting_data: ud }).eq('id', args.leadId).eq('user_id', args.userId);
  }
  if (merged.requestedAmount != null) {
    await supabase.from('leads').update({ value: merged.requestedAmount }).eq('id', args.leadId).eq('user_id', args.userId);
  }
  return { ok: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function persistAnalyzerSnapshotToLead(
  supabase: { from: (table: string) => any },
  args: {
    userId: string;
    leadId: string;
    snapshot: Record<string, unknown>;
  },
): Promise<{ ok: boolean }> {
  const { data: lead } = await supabase
    .from('leads')
    .select('underwriting_data')
    .eq('id', args.leadId)
    .eq('user_id', args.userId)
    .maybeSingle();
  if (!lead) return { ok: false };

  const currentUd = asRecord(lead.underwriting_data);
  const metrics = asRecord(args.snapshot.displayMetrics);
  const mapped = mapAnalyzerMetricsToUnderwritingFields(metrics);
  const filled: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mapped)) {
    if (typeof v === 'number' && v !== 0) filled[k] = v;
  }
  const requested = requestedAmountFromMonthlyRevenue(mapped.monthlyRevenue);
  if (requested != null) filled.requestedAmount = requested;
  const updatedUd = preserveFileActivity(
    { ...currentUd, ...filled, bankStatementAnalysis: args.snapshot },
    currentUd,
  );
  await supabase.from('leads').update({ underwriting_data: updatedUd }).eq('id', args.leadId).eq('user_id', args.userId);
  if (requested != null) {
    await supabase.from('leads').update({ value: requested }).eq('id', args.leadId).eq('user_id', args.userId);
  }
  return { ok: true };
}

export function compactAnalyzerBody(body: Record<string, unknown>): Record<string, unknown> {
  const metrics = body.metrics && typeof body.metrics === 'object'
    ? compactMetricsForStorage(body.metrics as Record<string, unknown>)
    : {};
  return {
    analyzedAt: new Date().toISOString(),
    ai_assisted: !!body.ai_assisted,
    ai_assisted_message: body.ai_assisted_message ?? null,
    displayMetrics: metrics,
    per_file: body.per_file,
    transactions: body.transactions ?? [],
  };
}
