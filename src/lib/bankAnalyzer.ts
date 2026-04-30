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
    depositsCount: Number(metrics.deposit_count) || 0,
  };
}
