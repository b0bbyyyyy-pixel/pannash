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

/** Map last three calendar months of true-deposit revenue (oldest → month1 … newest → month3). */
export function mapAnalyzerMetricsToUnderwritingFields(metrics: Record<string, unknown>): {
  month1Revenue: number;
  month2Revenue: number;
  month3Revenue: number;
  avgDailyBalance: number;
  endingBalance: number;
  nsfCount: number;
  depositsCount: number;
} {
  const mr = Array.isArray(metrics.monthly_revenue) ? [...(metrics.monthly_revenue as MonthlyRevRow[])] : [];
  mr.sort((a, b) => String(a.month ?? '').localeCompare(String(b.month ?? '')));
  const last3 = mr.slice(-3);
  const m1 = Number(last3[0]?.amount) || 0;
  const m2 = Number(last3[1]?.amount) || 0;
  const m3 = Number(last3[2]?.amount) || 0;

  return {
    month1Revenue: m1,
    month2Revenue: m2,
    month3Revenue: m3,
    avgDailyBalance: Number(metrics.avg_daily_balance) || 0,
    endingBalance: Number(metrics.ending_balance) || 0,
    nsfCount: Number(metrics.nsf_count) || 0,
    depositsCount: resolveAvgMonthlyDepositCount(metrics),
  };
}
