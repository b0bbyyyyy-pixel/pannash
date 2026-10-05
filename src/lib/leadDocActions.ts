import { inferFromLegalName } from '@/lib/businessName';
import { monthsInBusinessFromStartDate, normalizeParsedFields } from '@/lib/normalizeParsedFields';
import {
  compactMetricsForStorage,
  mapAnalyzerMetricsToUnderwritingFields,
  mapParsedBankFieldsToUd,
  mergeStatementMonths,
  mergeMcaPositions,
  parseStatementMonths,
  requestedAmountFromMonthlyRevenue,
  seedBankAnalysisFromParsed,
  statementMonthFromFields,
  statementMonthsFromUd,
} from '@/lib/bankAnalyzer';

export type DocAttachment = {
  id: string;
  file_name: string;
  file_type?: string;
};

type LeadDocContext = {
  id: string;
  company?: string | null;
  underwriting_data?: Record<string, unknown> | null;
};

async function fetchLeadDocContext(leadId: string): Promise<LeadDocContext> {
  const res = await fetch(`/api/leads/${leadId}`, { credentials: 'include' });
  if (!res.ok) return { id: leadId, underwriting_data: {} };
  const json = await res.json();
  const lead = (json.lead || {}) as LeadDocContext;
  return {
    id: leadId,
    company: lead.company ?? null,
    underwriting_data: (lead.underwriting_data || {}) as Record<string, unknown>,
  };
}

export async function applyParsedFieldsToLead(
  leadId: string,
  fields: Record<string, string>,
  selected: Set<string>,
  fallbackCompany?: string | null,
) {
  const lead = await fetchLeadDocContext(leadId);
  const normalized = normalizeParsedFields(fields);
  const selectedNorm = new Set(selected);
  for (const k of selected) {
    for (const nk of Object.keys(normalizeParsedFields({ [k]: fields[k] || '' }))) selectedNorm.add(nk);
  }
  const DIRECT = new Set(['company', 'name', 'email', 'phone', 'notes', 'stage', 'value']);
  const directUpdates: Record<string, string> = {};
  const udUpdates: Record<string, string> = {};

  for (const [k, v] of Object.entries(normalized)) {
    if (!selectedNorm.has(k) || !v) continue;
    if (DIRECT.has(k)) directUpdates[k] = v;
    else udUpdates[k] = v;
  }

  for (const [field, value] of Object.entries(directUpdates)) {
    await fetch('/api/leads/update-crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, field, value }),
      credentials: 'include',
    });
  }

  const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
  const legalName = (directUpdates.company || String(lead.company || fallbackCompany || '')).trim();
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
  const BANK_KEYS = new Set([
    'totalDeposits', 'totalWithdrawals', 'openingBalance', 'depositCount', 'depositsCount',
    'mcaPositions', 'hasOtherMCALoans', 'nsfCount', 'negativeDays', 'avgDailyBalance',
    'endingBalance', 'monthlyRevenue', 'largestDeposit', 'statementMonth', 'bankName',
    'accountNumber', 'month1Revenue', 'month2Revenue', 'month3Revenue', 'month4Revenue',
    'statementMonths',
  ]);
  const leftover: Record<string, string> = {};
  for (const [k, v] of Object.entries(udUpdates)) {
    if (k in mappedBank || BANK_KEYS.has(k)) continue;
    leftover[k] = v;
  }
  const tib = monthsInBusinessFromStartDate(leftover.businessStartDate || currentUd.businessStartDate);
  if (tib != null) leftover.timeInBusiness = String(tib);

  if (Object.keys(mappedBank).length || Object.keys(leftover).length) {
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
    await fetch('/api/leads/underwriting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, underwritingData: mergedUd }),
      credentials: 'include',
    });
    if (requested != null) {
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, field: 'value', value: requested }),
        credentials: 'include',
      });
    }
  }
}

export async function saveBankAnalysisForLead(
  leadId: string,
  snapshot: Record<string, unknown>,
) {
  const lead = await fetchLeadDocContext(leadId);
  const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
  const metrics = (snapshot.displayMetrics ?? {}) as Record<string, unknown>;
  const mapped = mapAnalyzerMetricsToUnderwritingFields(metrics);
  const filled: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mapped)) {
    if (typeof v === 'number' && v !== 0) filled[k] = v;
  }
  const requested = requestedAmountFromMonthlyRevenue(mapped.monthlyRevenue);
  if (requested != null) filled.requestedAmount = requested;
  const updatedUd = { ...currentUd, ...filled, bankStatementAnalysis: snapshot };
  await fetch('/api/leads/underwriting', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, underwritingData: updatedUd }),
    credentials: 'include',
  });
  if (requested != null) {
    await fetch('/api/leads/update-crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, field: 'value', value: requested }),
      credentials: 'include',
    });
  }
}

export async function analyzeBankAttachmentForLead(
  leadId: string,
  attachment: DocAttachment,
) {
  try {
    const dlRes = await fetch(`/api/attachments/download?id=${attachment.id}`, { credentials: 'include' });
    if (!dlRes.ok) return;
    const { url } = await dlRes.json();
    const blob = await fetch(url).then(r => r.blob());
    const file = new File([blob], attachment.file_name, { type: attachment.file_type || 'application/pdf' });
    const fd = new FormData();
    fd.append('files', file);
    const resp = await fetch('/api/bank-analyze', { method: 'POST', body: fd, credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json() as Record<string, unknown>;
    await saveBankAnalysisForLead(leadId, {
      analyzedAt: new Date().toISOString(),
      displayMetrics: data.metrics,
      per_file: data.per_file,
    });
  } catch { /* silent — same as Lead Info analyze */ }
}

/** Add-lead Full pack analyzer: one request for every statement file. */
export async function analyzeBankFilesForLead(leadId: string, files: File[]) {
  if (!files.length) return;
  const fd = new FormData();
  if (files.length === 1) {
    fd.append('file', files[0], files[0].name);
  } else {
    files.forEach(f => fd.append('files', f, f.name));
  }
  const resp = await fetch('/api/bank-analyze', { method: 'POST', body: fd, credentials: 'include' });
  if (!resp.ok) return;
  const data = await resp.json() as {
    metrics?: Record<string, unknown>;
    per_file?: Array<{ filename: string; metrics: Record<string, unknown> }>;
    transactions?: unknown[];
    ai_assisted?: boolean;
    ai_assisted_message?: string | null;
  };
  if (!data.metrics || typeof data.metrics !== 'object') return;
  await saveBankAnalysisForLead(leadId, {
    analyzedAt: new Date().toISOString(),
    ai_assisted: !!data.ai_assisted,
    ai_assisted_message: data.ai_assisted_message ?? null,
    displayMetrics: compactMetricsForStorage(data.metrics),
    per_file: data.per_file,
    transactions: data.transactions ?? [],
  });
}

export function isStatementFileName(name: string) {
  return /stmt|statement|checking|savings|\bbank\b|frost/i.test(name);
}

/** Split a dropped pack: statement-named files are banks; otherwise the first file is the app. */
export function splitFullPackFiles<T extends { name: string }>(files: T[]): { apps: T[]; banks: T[] } {
  const banks = files.filter(f => isStatementFileName(f.name));
  const apps = files.filter(f => !isStatementFileName(f.name));
  if (banks.length === 0 && apps.length > 1) {
    return { apps: [apps[0]], banks: apps.slice(1) };
  }
  return { apps, banks };
}
