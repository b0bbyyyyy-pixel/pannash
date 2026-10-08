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

/** Nearest $1,000 from average monthly revenue (14922.55 → 15000, 45222.15 → 45000). */
export function requestedAmountFromMonthlyRevenue(monthlyRevenue: unknown): number | null {
  const n = typeof monthlyRevenue === 'number'
    ? monthlyRevenue
    : Number(String(monthlyRevenue ?? '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n / 1000) * 1000;
  return rounded > 0 ? rounded : null;
}

/** Map last four calendar months of true-deposit revenue (oldest → month1 … newest → month4). */
export function mapAnalyzerMetricsToUnderwritingFields(metrics: Record<string, unknown>): {
  month1Revenue: number;
  month2Revenue: number;
  month3Revenue: number;
  month4Revenue: number;
  /** Single average — use this as the canonical revenue figure going forward */
  monthlyRevenue: number;
  requestedAmount: number;
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
  const requestedAmount = requestedAmountFromMonthlyRevenue(monthlyRevenue) ?? 0;

  return {
    month1Revenue: m1,
    month2Revenue: m2,
    month3Revenue: m3,
    month4Revenue: m4,
    monthlyRevenue,
    requestedAmount,
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
  /** Funding / advance date from a bank-statement credit, YYYY-MM-DD when known */
  fundedDate?: string;
  /** Original wire / advance amount credited by the funder */
  fundedAmount?: number;
};

export function normalizeMcaFundedDate(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdY = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (mdY) {
    const y = mdY[3].length === 2 ? `20${mdY[3]}` : mdY[3];
    return `${y}-${mdY[1].padStart(2, '0')}-${mdY[2].padStart(2, '0')}`;
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return s;
}

export function formatMcaFundedDate(raw?: string): string {
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  return raw;
}

export function formatMcaFundedAmount(n?: number): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '';
  return '$' + Math.round(n).toLocaleString();
}

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

const MONTH_NAME: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06',
  jul: '07', july: '07', aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
};

function monthSortKey(s: string): string {
  const trimmed = String(s ?? '').trim();
  const yyyymm = trimmed.match(/^(\d{4})[/\-.](\d{1,2})(?:[/\-.](\d{1,2}))?$/);
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2].padStart(2, '0')}`;
  const mmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2, '0')}`;
  const named = trimmed.match(/^([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (named) {
    const mm = MONTH_NAME[named[1].toLowerCase()];
    if (mm) return `${named[2]}-${mm}`;
  }
  const parsed = Date.parse(trimmed.replace(/^([A-Za-z]+)\s+(\d{4})$/, '$1 1, $2'));
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return trimmed;
}

function accountKey(m: Pick<StatementMonth, 'accountNumber'>): string {
  return String(m.accountNumber ?? '').replace(/\D/g, '').slice(-4);
}

function preferNum(a?: number, b?: number): number | undefined {
  if (a != null && Number.isFinite(a) && a !== 0) return a;
  if (b != null && Number.isFinite(b) && b !== 0) return b;
  if (a != null && Number.isFinite(a)) return a;
  if (b != null && Number.isFinite(b)) return b;
  return undefined;
}

function preferCount(a?: number, b?: number): number | undefined {
  if (a != null && Number.isFinite(a)) return a;
  if (b != null && Number.isFinite(b)) return b;
  return undefined;
}

function combineMonthRow(a: StatementMonth, b: StatementMonth): StatementMonth {
  const month = monthSortKey(a.month) || monthSortKey(b.month) || a.month || b.month;
  const acct = accountKey(a) || accountKey(b);
  return {
    month,
    ...(acct ? { accountNumber: acct } : {}),
    ...(a.bankName || b.bankName ? { bankName: a.bankName || b.bankName } : {}),
    ...(preferNum(a.openingBalance, b.openingBalance) != null ? { openingBalance: preferNum(a.openingBalance, b.openingBalance) } : {}),
    ...(preferNum(a.endingBalance, b.endingBalance) != null ? { endingBalance: preferNum(a.endingBalance, b.endingBalance) } : {}),
    ...(preferNum(a.totalDeposits, b.totalDeposits) != null ? { totalDeposits: preferNum(a.totalDeposits, b.totalDeposits) } : {}),
    ...(preferNum(a.totalWithdrawals, b.totalWithdrawals) != null ? { totalWithdrawals: preferNum(a.totalWithdrawals, b.totalWithdrawals) } : {}),
    ...(preferNum(a.avgDailyBalance, b.avgDailyBalance) != null ? { avgDailyBalance: preferNum(a.avgDailyBalance, b.avgDailyBalance) } : {}),
    ...(preferCount(a.depositCount, b.depositCount) != null ? { depositCount: preferCount(a.depositCount, b.depositCount) } : {}),
    ...(preferCount(a.nsfCount, b.nsfCount) != null ? { nsfCount: preferCount(a.nsfCount, b.nsfCount) } : {}),
    ...(preferCount(a.negativeDays, b.negativeDays) != null ? { negativeDays: preferCount(a.negativeDays, b.negativeDays) } : {}),
    ...(preferNum(a.largestDeposit, b.largestDeposit) != null ? { largestDeposit: preferNum(a.largestDeposit, b.largestDeposit) } : {}),
  };
}

function sameMonthFigures(a: StatementMonth, b: StatementMonth): boolean {
  const depA = a.totalDeposits ?? 0;
  const depB = b.totalDeposits ?? 0;
  if (depA > 0 && depB > 0 && Math.abs(depA - depB) < 1) return true;
  const endA = a.endingBalance ?? 0;
  const endB = b.endingBalance ?? 0;
  return endA !== 0 && endB !== 0 && Math.abs(endA - endB) < 1;
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
    const normalized = monthSortKey(month) || month || 'Unknown';
    out.push({
      month: normalized,
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
  const byExact = new Map<string, StatementMonth>();
  for (const raw of [...existing, ...incoming]) {
    const month = monthSortKey(raw.month) || raw.month || 'Unknown';
    const acct = accountKey(raw);
    const row: StatementMonth = { ...raw, month, ...(acct ? { accountNumber: acct } : { accountNumber: undefined }) };
    const key = `${month}|${acct}`;
    const prev = byExact.get(key);
    byExact.set(key, prev ? combineMonthRow(prev, row) : row);
  }

  const byMonth = new Map<string, StatementMonth[]>();
  for (const row of byExact.values()) {
    const mk = monthSortKey(row.month);
    const list = byMonth.get(mk) ?? [];
    list.push(row);
    byMonth.set(mk, list);
  }

  const out: StatementMonth[] = [];
  for (const list of byMonth.values()) {
    const withAcct = list.filter(m => accountKey(m));
    const without = list.filter(m => !accountKey(m));
    if (withAcct.length === 1 && without.length) {
      out.push(without.reduce((acc, m) => combineMonthRow(acc, m), withAcct[0]));
      continue;
    }
    if (withAcct.length === 0 && without.length) {
      out.push(without.reduce((acc, m) => combineMonthRow(acc, m)));
      continue;
    }
    out.push(...withAcct);
    for (const blank of without) {
      if (!withAcct.some(w => sameMonthFigures(w, blank))) out.push(blank);
    }
  }
  return out.sort((a, b) => monthSortKey(a.month).localeCompare(monthSortKey(b.month)));
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
    const fundedDate = normalizeMcaFundedDate(r.fundedDate ?? r.fundingDate ?? r.fundedAt ?? r.dateFunded);
    const fundedAmount = coerceNumber(
      r.fundedAmount ?? r.fundingAmount ?? r.advanceAmount ?? r.originalAdvance ?? r.originalAmount ?? r.wireAmount ?? r.originalWire,
    );
    out.push({
      lender: lender || 'Unknown funder',
      payment,
      frequency,
      monthlyPayment,
      ...(outstanding != null ? { outstanding } : {}),
      ...(fundedDate ? { fundedDate } : {}),
      ...(fundedAmount != null && fundedAmount > 0 ? { fundedAmount } : {}),
    });
  }
  return out;
}

export function mergeMcaPositions(...lists: Array<McaPosition[] | unknown>): McaPosition[] {
  const byKey = new Map<string, McaPosition>();
  for (const list of lists) {
    for (const p of parseMcaPositions(list)) {
      const key = p.lender.toLowerCase();
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, p);
        continue;
      }
      byKey.set(key, {
        ...prev,
        fundedDate: prev.fundedDate || p.fundedDate,
        fundedAmount: prev.fundedAmount ?? p.fundedAmount,
        outstanding: prev.outstanding ?? p.outstanding,
      });
    }
  }
  return [...byKey.values()];
}

/** Map parsed bank-statement fields onto underwriting JSON. */
export function mapParsedBankFieldsToUd(fields: Record<string, unknown>): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  let months = mergeStatementMonths([], parseStatementMonths(fields.statementMonths));
  if (!months.length) {
    const one = statementMonthFromFields(fields);
    if (one) months = [one];
  }
  if (months.length) {
    Object.assign(ud, averagesFromMonths(months));
    ud.statementMonths = months;
    const requested = requestedAmountFromMonthlyRevenue(ud.monthlyRevenue);
    if (requested != null) ud.requestedAmount = requested;
  } else {
    const ending = coerceNumber(fields.endingBalance);
    const opening = coerceNumber(fields.openingBalance);
    const deposits = coerceNumber(fields.totalDeposits ?? fields.monthlyRevenue);
    const adb = coerceNumber(fields.avgDailyBalance)
      ?? (opening != null && ending != null ? Math.round(((opening + ending) / 2) * 100) / 100 : null);
    const nsf = coerceNumber(fields.nsfCount);
    const depCount = coerceNumber(fields.depositCount ?? fields.depositsCount);
    const neg = coerceNumber(fields.negativeDays);

    if (deposits != null) {
      ud.monthlyRevenue = deposits;
      const requested = requestedAmountFromMonthlyRevenue(deposits);
      if (requested != null) ud.requestedAmount = requested;
    }
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
  let months = mergeStatementMonths([], parseStatementMonths(fields.statementMonths));
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
