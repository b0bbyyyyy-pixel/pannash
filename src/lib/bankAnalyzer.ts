/**
 * Normalize Bank Statement Analyzer API metrics into underwriting form fields
 * and compact copies for JSON persistence (omit large series).
 */

export type BankStatementAnalysisSnapshot = {
  analyzedAt: string;
  ai_assisted?: boolean;
  ai_assisted_message?: string | null;
  displayMetrics: Record<string, unknown>;
  per_file?: Array<{ filename: string; metrics: Record<string, unknown> }>;
  transactions?: Array<{ date: string; description: string; amount: number; balance?: number | null; row_class?: string }>;
};

const LARGE_METRIC_KEYS = new Set(['daily_balances_chart']);

export function compactMetricsForStorage(metrics: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...metrics };
  for (const k of LARGE_METRIC_KEYS) delete out[k];
  return out;
}

type MonthlyRevRow = { month?: string; amount?: number };

/** Average # of deposit transactions per month (matches analyzer avg_monthly_deposit_count). */
function resolveAvgMonthlyDepositCount(metrics: Record<string, unknown>): number {
  const fromApi = Number(metrics.avg_monthly_deposit_count);
  if (Number.isFinite(fromApi) && fromApi >= 0) {
    return Math.round(fromApi * 10) / 10;
  }
  const summary = metrics.monthly_summary;
  if (Array.isArray(summary) && summary.length > 0) {
    let sum = 0;
    for (const row of summary) {
      sum += Number((row as { deposit_count?: number }).deposit_count) || 0;
    }
    return Math.round((sum / summary.length) * 10) / 10;
  }
  const total = Number(metrics.deposit_count) || 0;
  const n = Number(metrics.num_months);
  if (n > 0 && total > 0) {
    return Math.round((total / n) * 10) / 10;
  }
  return 0;
}

/** Map last four calendar months of true-deposit revenue (oldest → month1 … newest → month4). */
export function mapAnalyzerMetricsToUnderwritingFields(metrics: Record<string, unknown>): {
  month1Revenue: number;
  month2Revenue: number;
  month3Revenue: number;
  month4Revenue: number;
  /** Single average — use this as the canonical revenue figure going forward */
  monthlyRevenue: number;
  avgDailyBalance: number;
  endingBalance: number;
  nsfCount: number;
  depositsCount: number;
} {
  const mr = Array.isArray(metrics.monthly_revenue) ? [...(metrics.monthly_revenue as MonthlyRevRow[])] : [];
  mr.sort((a, b) => String(a.month ?? '').localeCompare(String(b.month ?? '')));
  const last4 = mr.slice(-4);
  const m1 = Number(last4[0]?.amount) || 0;
  const m2 = Number(last4[1]?.amount) || 0;
  const m3 = Number(last4[2]?.amount) || 0;
  const m4 = Number(last4[3]?.amount) || 0;

  // Compute single average (only from months that have data)
  const nonZero = [m1, m2, m3, m4].filter(v => v > 0);
  const monthlyRevenue = nonZero.length > 0
    ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
    : 0;

  return {
    month1Revenue: m1,
    month2Revenue: m2,
    month3Revenue: m3,
    month4Revenue: m4,
    monthlyRevenue,
    avgDailyBalance: Number(metrics.avg_daily_balance) || 0,
    endingBalance: Number(metrics.ending_balance) || 0,
    nsfCount: Number(metrics.nsf_count) || 0,
    depositsCount: resolveAvgMonthlyDepositCount(metrics),
  };
}

export type McaPosition = {
  lender: string;
  payment: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  monthlyPayment: number;
  outstanding?: number;
};

export function coerceNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function monthlyMcaPayment(p: { payment?: unknown; frequency?: unknown; monthlyPayment?: unknown }): number {
  const stated = coerceNumber(p.monthlyPayment);
  if (stated != null && stated > 0) return stated;
  const pay = coerceNumber(p.payment) ?? 0;
  const f = String(p.frequency ?? 'monthly').toLowerCase();
  if (f.startsWith('day')) return Math.round(pay * 21);
  if (f.startsWith('week')) return Math.round(pay * 4.33);
  return Math.round(pay);
}

export type StatementMonth = {
  month: string;
  accountNumber?: string;
  bankName?: string;
  openingBalance?: number;
  endingBalance?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  avgDailyBalance?: number;
  depositCount?: number;
  nsfCount?: number;
  negativeDays?: number;
  largestDeposit?: number;
};

function monthSortKey(s: string): string {
  const trimmed = String(s ?? '').trim();
  const named = Date.parse(trimmed.replace(/^([A-Za-z]+)\s+(\d{4})$/, '$1 1, $2'));
  if (!Number.isNaN(named)) {
    const d = new Date(named);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const mmyyyy = trimmed.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2, '0')}`;
  const yyyymm = trimmed.match(/^(\d{4})[/\-](\d{1,2})$/);
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2].padStart(2, '0')}`;
  return trimmed;
}

function avgNums(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((n): n is number => n != null && Number.isFinite(n));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

export function parseStatementMonths(raw: unknown): StatementMonth[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) list = p; } catch { return []; }
  }
  const out: StatementMonth[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const month = String(r.month ?? r.statementMonth ?? '').trim();
    const totalDeposits = coerceNumber(r.totalDeposits ?? r.revenue ?? r.monthlyRevenue);
    const endingBalance = coerceNumber(r.endingBalance ?? r.endBal);
    if (!month && totalDeposits == null && endingBalance == null) continue;
    const opening = coerceNumber(r.openingBalance);
    const ending = endingBalance;
    const adb = coerceNumber(r.avgDailyBalance)
      ?? (opening != null && ending != null ? Math.round(((opening + ending) / 2) * 100) / 100 : null);
    const acct = String(r.accountNumber ?? r.acct ?? '').replace(/\D/g, '').slice(-4);
    out.push({
      month: month || 'Unknown',
      ...(acct ? { accountNumber: acct } : {}),
      ...(r.bankName ? { bankName: String(r.bankName) } : {}),
      ...(opening != null ? { openingBalance: opening } : {}),
      ...(ending != null ? { endingBalance: ending } : {}),
      ...(totalDeposits != null ? { totalDeposits } : {}),
      ...(coerceNumber(r.totalWithdrawals) != null ? { totalWithdrawals: coerceNumber(r.totalWithdrawals)! } : {}),
      ...(adb != null ? { avgDailyBalance: adb } : {}),
      ...(coerceNumber(r.depositCount ?? r.depositsCount) != null ? { depositCount: coerceNumber(r.depositCount ?? r.depositsCount)! } : {}),
      ...(coerceNumber(r.nsfCount) != null ? { nsfCount: coerceNumber(r.nsfCount)! } : {}),
      ...(coerceNumber(r.negativeDays) != null ? { negativeDays: coerceNumber(r.negativeDays)! } : {}),
      ...(coerceNumber(r.largestDeposit) != null ? { largestDeposit: coerceNumber(r.largestDeposit)! } : {}),
    });
  }
  return out;
}

export function statementMonthFromFields(fields: Record<string, unknown>): StatementMonth | null {
  return parseStatementMonths([{
    month: fields.statementMonth,
    accountNumber: fields.accountNumber,
    bankName: fields.bankName,
    openingBalance: fields.openingBalance,
    endingBalance: fields.endingBalance,
    totalDeposits: fields.totalDeposits ?? fields.monthlyRevenue,
    totalWithdrawals: fields.totalWithdrawals,
    avgDailyBalance: fields.avgDailyBalance,
    depositCount: fields.depositCount ?? fields.depositsCount,
    nsfCount: fields.nsfCount,
    negativeDays: fields.negativeDays,
    largestDeposit: fields.largestDeposit,
  }])[0] ?? null;
}

export function mergeStatementMonths(existing: StatementMonth[], incoming: StatementMonth[]): StatementMonth[] {
  const map = new Map<string, StatementMonth>();
  for (const m of [...existing, ...incoming]) {
    const key = `${monthSortKey(m.month)}|${(m.accountNumber || '').slice(-4)}`;
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => monthSortKey(a.month).localeCompare(monthSortKey(b.month)));
}

/** Recover per-month rows already saved on a lead (statementMonths, else analysis snapshot). */
export function statementMonthsFromUd(ud: Record<string, unknown>): StatementMonth[] {
  const stored = parseStatementMonths(ud.statementMonths);
  if (stored.length) return stored;
  const snap = ud.bankStatementAnalysis as { displayMetrics?: Record<string, unknown> } | undefined;
  const summary = snap?.displayMetrics?.monthly_summary;
  if (Array.isArray(summary) && summary.length) {
    return parseStatementMonths(summary.map((row: Record<string, unknown>) => ({
      month: row.month,
      accountNumber: row.account ?? row.accountNumber,
      endingBalance: row.ending_balance,
      totalDeposits: row.true_deposits ?? row.total_deposits,
      depositCount: row.deposit_count,
      nsfCount: row.nsf_count,
      negativeDays: row.negative_days,
      avgDailyBalance: row.avg_daily_balance,
    })));
  }
  return [];
}

export function averagesFromMonths(months: StatementMonth[]): Record<string, number> {
  const sorted = mergeStatementMonths([], months);
  const last3 = sorted.slice(-3);
  const last4 = sorted.slice(-4);
  const last = sorted[sorted.length - 1];
  const out: Record<string, number> = {};
  const rev = avgNums(sorted.map(m => m.totalDeposits));
  if (rev != null) out.monthlyRevenue = rev;
  const adb = avgNums(sorted.map(m => m.avgDailyBalance));
  if (adb != null) out.avgDailyBalance = adb;
  const dep = avgNums(sorted.map(m => m.depositCount));
  if (dep != null) out.depositsCount = dep;
  out.nsfCount = last3.reduce((s, m) => s + (m.nsfCount ?? 0), 0);
  out.negativeDays = last3.reduce((s, m) => s + (m.negativeDays ?? 0), 0);
  if (last?.endingBalance != null) out.endingBalance = last.endingBalance;
  last4.forEach((m, i) => {
    if (m.totalDeposits != null) out[`month${i + 1}Revenue`] = m.totalDeposits;
  });
  return out;
}

export function parseMcaPositions(raw: unknown): McaPosition[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) list = p; } catch { return []; }
  }
  const out: McaPosition[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const lender = String(r.lender ?? r.name ?? '').trim();
    const payment = coerceNumber(r.payment) ?? 0;
    const freqRaw = String(r.frequency ?? 'daily').toLowerCase();
    const frequency: McaPosition['frequency'] =
      freqRaw.startsWith('week') ? 'weekly' : freqRaw.startsWith('month') ? 'monthly' : 'daily';
    const monthlyPayment = monthlyMcaPayment({ ...r, payment, frequency });
    if (!lender && payment <= 0) continue;
    const outstanding = coerceNumber(r.outstanding);
    out.push({
      lender: lender || 'Unknown funder',
      payment,
      frequency,
      monthlyPayment,
      ...(outstanding != null ? { outstanding } : {}),
    });
  }
  return out;
}

/** Map parsed bank-statement fields onto underwriting JSON. */
export function mapParsedBankFieldsToUd(fields: Record<string, unknown>): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  let months = parseStatementMonths(fields.statementMonths);
  if (!months.length) {
    const one = statementMonthFromFields(fields);
    if (one) months = [one];
  }
  if (months.length) {
    Object.assign(ud, averagesFromMonths(months));
    ud.statementMonths = months;
  } else {
    const ending = coerceNumber(fields.endingBalance);
    const opening = coerceNumber(fields.openingBalance);
    const deposits = coerceNumber(fields.totalDeposits ?? fields.monthlyRevenue);
    const adb = coerceNumber(fields.avgDailyBalance)
      ?? (opening != null && ending != null ? Math.round(((opening + ending) / 2) * 100) / 100 : null);
    const nsf = coerceNumber(fields.nsfCount);
    const depCount = coerceNumber(fields.depositCount ?? fields.depositsCount);
    const neg = coerceNumber(fields.negativeDays);

    if (deposits != null) ud.monthlyRevenue = deposits;
    if (adb != null) ud.avgDailyBalance = adb;
    if (ending != null) ud.endingBalance = ending;
    if (nsf != null) ud.nsfCount = nsf;
    if (depCount != null) ud.depositsCount = depCount;
    if (neg != null) ud.negativeDays = neg;

    for (const k of ['month1Revenue', 'month2Revenue', 'month3Revenue', 'month4Revenue'] as const) {
      const n = coerceNumber(fields[k]);
      if (n != null) ud[k] = n;
    }
  }

  const positions = parseMcaPositions(fields.mcaPositions);
  const flagged = String(fields.hasOtherMCALoans ?? '').toLowerCase() === 'true' || positions.length > 0;
  if (positions.length > 0) {
    ud.mcaPositions = positions;
    ud.hasOtherMCALoans = true;
    ud.mcaPositionCount = positions.length;
    ud.otherMCALenders = positions.map(p => p.lender).filter(Boolean).join(', ');
    ud.otherMCAMonthlyPayment = positions.reduce((s, p) => s + (p.monthlyPayment || 0), 0);
    const bal = positions.reduce((s, p) => s + (p.outstanding || 0), 0);
    if (bal > 0) ud.otherMCAOutstandingBalance = bal;
  } else if (flagged) {
    ud.hasOtherMCALoans = true;
    if (ud.mcaPositionCount == null) ud.mcaPositionCount = 1;
  } else if (fields.hasOtherMCALoans != null) {
    ud.hasOtherMCALoans = false;
    ud.mcaPositionCount = 0;
  }

  if (fields.bankName) ud.bankName = String(fields.bankName);
  if (fields.accountNumber) ud.accountNumber = String(fields.accountNumber);
  if (fields.statementMonth) ud.statementMonth = String(fields.statementMonth);
  if (fields.largestDeposit) {
    const n = coerceNumber(fields.largestDeposit);
    if (n != null) ud.largestDeposit = n;
  }

  return ud;
}

type BankSnapLite = {
  analyzedAt?: string;
  displayMetrics?: Record<string, unknown>;
  per_file?: Array<{ filename: string; metrics: Record<string, unknown> }>;
};

/** Build a Financials-tab snapshot from parsed statement fields so Apply fills the tab without a separate Analyze. */
export function seedBankAnalysisFromParsed(
  fields: Record<string, unknown>,
  existing?: BankSnapLite | null,
): { analyzedAt: string; displayMetrics: Record<string, unknown>; per_file?: Array<{ filename: string; metrics: Record<string, unknown> }> } {
  let months = parseStatementMonths(fields.statementMonths);
  if (!months.length) {
    const one = statementMonthFromFields(fields);
    if (one) months = [one];
  }
  const avgs = months.length ? averagesFromMonths(months) : {};
  const deposits = avgs.monthlyRevenue ?? coerceNumber(fields.totalDeposits ?? fields.monthlyRevenue);
  const adb = avgs.avgDailyBalance ?? coerceNumber(fields.avgDailyBalance);
  const ending = avgs.endingBalance ?? coerceNumber(fields.endingBalance);
  const nsf = avgs.nsfCount ?? coerceNumber(fields.nsfCount);
  const depCount = avgs.depositsCount ?? coerceNumber(fields.depositCount ?? fields.depositsCount);
  const neg = avgs.negativeDays ?? coerceNumber(fields.negativeDays);

  const existingMetrics = existing?.displayMetrics ?? {};

  const monthly_summary: Record<string, unknown>[] = [];
  const monthly_revenue: Array<{ month?: string; amount?: number }> = [];

  if (months.length) {
    for (const m of months) {
      monthly_revenue.push({ month: m.month, amount: m.totalDeposits ?? 0 });
      monthly_summary.push({
        month: m.month,
        account: m.accountNumber || '',
        ending_balance: m.endingBalance ?? 0,
        total_deposits: m.totalDeposits ?? 0,
        true_deposits: m.totalDeposits ?? 0,
        deposit_count: m.depositCount ?? 0,
        nsf_count: m.nsfCount ?? 0,
        negative_days: m.negativeDays ?? 0,
        avg_daily_balance: m.avgDailyBalance ?? 0,
      });
    }
  }

  return {
    analyzedAt: new Date().toISOString(),
    displayMetrics: {
      ...existingMetrics,
      avg_monthly_true_deposits: deposits ?? existingMetrics.avg_monthly_true_deposits,
      avg_monthly_deposits: deposits ?? existingMetrics.avg_monthly_deposits,
      avg_monthly_daily_balance: adb ?? existingMetrics.avg_monthly_daily_balance,
      ending_balance: ending ?? existingMetrics.ending_balance,
      nsf_count: nsf ?? existingMetrics.nsf_count,
      avg_monthly_deposit_count: depCount ?? existingMetrics.avg_monthly_deposit_count,
      negative_days: neg ?? existingMetrics.negative_days,
      ...(monthly_summary.length ? { monthly_summary, monthly_revenue } : {}),
    },
    ...(existing?.per_file ? { per_file: existing.per_file } : {}),
  };
}
