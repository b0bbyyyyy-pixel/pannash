'use client';
import React from 'react';
import { parseMcaPositions, averagesFromMonths, formatMcaFundedDate, mergeStatementMonths, statementMonthsFromUd, coerceNumber, type StatementMonth } from '@/lib/bankAnalyzer';

export type BankSnap = {
  analyzedAt?: string;
  displayMetrics?: Record<string, unknown>;
  per_file?: Array<{ filename: string; metrics: Record<string, unknown> }>;
};

type MonthRow = {
  month: string;
  acct: string;
  revenue: number;
  deposits: number;
  endBal: number;
  depCount: number;
  neg: number;
  nsf: number;
};

export type FinancialsReportProps = {
  snap: BankSnap | undefined;
  ud: Record<string, unknown>;
  leadName: string;
  leadCompany?: string | null;
  derivedTIB: number | null;
  onSaveField: (k: string, v: string) => void;
  variant?: 'modal' | 'inline';
};

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '--';
  const formatted = Math.round(Math.abs(n)).toLocaleString();
  return (n < 0 ? '-$' : '$') + formatted;
}

function fmtNum(n: number): string {
  if (n <= 0) return '--';
  return n.toFixed(1);
}

function acctLabel(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(-4);
  return digits ? `…${digits}` : '--';
}

function monthFromSummary(row: Record<string, unknown>, acctFallback = ''): StatementMonth {
  const totalDeposits = coerceNumber(row.true_deposits ?? row.total_deposits ?? row.revenue);
  const ending = coerceNumber(row.ending_balance ?? row.endBal);
  const rawAcct = String(row.account ?? row.accountNumber ?? acctFallback).replace(/\D/g, '');
  const acct = rawAcct.length >= 4 ? rawAcct.slice(-4) : '';
  return {
    month: String(row.month ?? ''),
    ...(acct ? { accountNumber: acct } : {}),
    ...(totalDeposits != null ? { totalDeposits } : {}),
    ...(ending != null ? { endingBalance: ending } : {}),
    ...(coerceNumber(row.deposit_count ?? row.depCount) != null ? { depositCount: coerceNumber(row.deposit_count ?? row.depCount)! } : {}),
    ...(coerceNumber(row.negative_days ?? row.neg) != null ? { negativeDays: coerceNumber(row.negative_days ?? row.neg)! } : {}),
    ...(coerceNumber(row.nsf_count ?? row.nsf) != null ? { nsfCount: coerceNumber(row.nsf_count ?? row.nsf)! } : {}),
    ...(coerceNumber(row.avg_daily_balance) != null ? { avgDailyBalance: coerceNumber(row.avg_daily_balance)! } : {}),
  };
}

function monthsFromMetrics(
  metrics: Record<string, unknown> | undefined,
  acctFallback = '',
): StatementMonth[] {
  if (!metrics) return [];
  const ms = (metrics.monthly_summary as Array<Record<string, unknown>>) ?? [];
  const mr = (metrics.monthly_revenue as Array<{ month?: string; amount?: number }>) ?? [];
  return ms.map(row => {
    const month = String(row.month ?? '');
    const rev = mr.find(r => r.month === month);
    return monthFromSummary({
      ...row,
      true_deposits: rev?.amount ?? row.true_deposits ?? row.total_deposits,
      account: row.account ?? row.accountNumber ?? acctFallback,
    }, acctFallback);
  });
}

function buildMonthRows(snap: BankSnap | undefined, ud: Record<string, unknown>): MonthRow[] {
  const extra: StatementMonth[] = [];
  const perFile = snap?.per_file ?? [];
  let perFileMonths = 0;
  for (const pf of perFile) {
    const rows = monthsFromMetrics(pf.metrics);
    perFileMonths += rows.length;
    extra.push(...rows);
  }
  // Combined displayMetrics is the same months again — only use it when files did not already supply rows.
  if (!perFileMonths) extra.push(...monthsFromMetrics(snap?.displayMetrics));

  const merged = mergeStatementMonths(statementMonthsFromUd(ud), extra);
  return merged.map(row => ({
    month: row.month,
    acct: acctLabel(row.accountNumber),
    revenue: row.totalDeposits ?? 0,
    deposits: row.totalDeposits ?? 0,
    endBal: row.endingBalance ?? 0,
    depCount: row.depositCount ?? 0,
    neg: row.negativeDays ?? 0,
    nsf: row.nsfCount ?? 0,
  }));
}

export function getFinancialsMeta(snap: BankSnap | undefined, ud: Record<string, unknown>) {
  const rows = buildMonthRows(snap, ud);
  const analyzedAt = snap?.analyzedAt
    ? new Date(snap.analyzedAt).toLocaleDateString('en-US')
    : '';
  return {
    monthCount: rows.length,
    analyzedAt,
    hasParsed: rows.length > 0 || Boolean(snap),
  };
}

const CHECKBOXES: [string, string][] = [
  ['isSoleProp', 'Sole prop'],
  ['isNonProfit', 'Non-profit'],
  ['priorMcaDefault', 'Prior MCA default'],
  ['isMercuryBank', 'Mercury / online bank'],
  ['isReverseConsolidation', 'Reverse consolidation'],
];

export default function FinancialsReport({
  snap,
  ud,
  derivedTIB,
  onSaveField,
  variant = 'modal',
}: FinancialsReportProps) {
  const m = snap?.displayMetrics;
  const rows = buildMonthRows(snap, ud);
  const monthAvgs = averagesFromMonths(rows.map(r => ({
    month: r.month,
    totalDeposits: r.revenue,
    endingBalance: r.endBal,
    depositCount: r.depCount,
    negativeDays: r.neg,
    nsfCount: r.nsf,
  })));
  const inline = variant === 'inline';

  const avgRevenue    = Number(monthAvgs.monthlyRevenue ?? ud.monthlyRevenue ?? m?.avg_monthly_true_deposits ?? m?.avg_monthly_deposits ?? 0);
  const avgDailyBal   = Number(monthAvgs.avgDailyBalance ?? ud.avgDailyBalance ?? m?.avg_monthly_daily_balance ?? 0);
  const depositsPerMo = Number(monthAvgs.depositsCount ?? ud.depositsCount ?? m?.avg_monthly_deposit_count ?? 0);
  const last3         = rows.slice(-3);
  const negDays3mo    = last3.length
    ? last3.reduce((s, r) => s + r.neg, 0)
    : Number(ud.negativeDays ?? monthAvgs.negativeDays ?? m?.negative_days ?? 0);
  const nsfs3mo       = last3.length
    ? last3.reduce((s, r) => s + r.nsf, 0)
    : Number(ud.nsfCount ?? monthAvgs.nsfCount ?? m?.nsf_count ?? 0);
  const lowestRev     = rows.filter((r) => r.revenue > 0).length > 0
    ? Math.min(...rows.filter((r) => r.revenue > 0).map((r) => r.revenue)) : 0;
  const lowestDep     = rows.filter((r) => r.depCount > 0).length > 0
    ? Math.min(...rows.filter((r) => r.depCount > 0).map((r) => r.depCount)) : 0;
  const last3Count    = last3.length || 1;
  const negDaysPerMo  = negDays3mo / last3Count;
  const nsfsPerMo     = nsfs3mo / last3Count;
  const fico          = Number(ud.creditScore ?? 0);
  const tib           = derivedTIB ?? Number(ud.timeInBusiness ?? 0);
  const mcaPositions  = parseMcaPositions(ud.mcaPositions);
  const mcaMonthly    = Number(ud.otherMCAMonthlyPayment ?? 0) || mcaPositions.reduce((s, p) => s + (p.monthlyPayment || 0), 0);
  const hasParsedFin  = Boolean(ud.monthlyRevenue || ud.avgDailyBalance || ud.nsfCount || mcaPositions.length);

  const statPairs: [string, string][] = [
    ['Avg revenue',   fmtMoney(avgRevenue)],
    ['Lowest rev',    fmtMoney(lowestRev)],
    ['Avg daily bal', fmtMoney(avgDailyBal)],
    ['Deposits/mo',   fmtNum(depositsPerMo)],
    ['Lowest dep',    lowestDep > 0 ? String(lowestDep) : '--'],
    ['Neg days/mo',   fmtNum(negDaysPerMo)],
    ['Neg days 3mo',  String(negDays3mo)],
    ['NSFs/mo',       fmtNum(nsfsPerMo)],
    ['NSFs 3mo',      String(nsfs3mo)],
    ['Industry',      String(ud.industry ?? '--')],
    ['FICO',          fico ? String(fico) : '--'],
    ['State',         String(ud.businessState ?? '--')],
    ['Time in biz',   tib > 0 ? tib + ' mo' : '--'],
    ['MCA positions', mcaPositions.length ? String(mcaPositions.length) : ((ud.hasOtherMCALoans === true || ud.hasOtherMCALoans === 'true') ? String(ud.mcaPositionCount ?? 1) : '0')],
    ['MCA / mo',      mcaMonthly > 0 ? fmtMoney(mcaMonthly) : '--'],
  ];

  const tableHeaders = ['Month', 'Acct', 'Revenue', 'Deposits', 'End Bal', '# Dep', 'Neg', 'NSF'];
  const numCell = inline ? 'tabular-nums' : '';

  return (
    <div className={`${inline ? 'space-y-4 min-w-0' : 'space-y-6'}`}>
      {rows.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">Monthly Breakdown</h3>
          <div className="border border-[#e5e5e5] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f5f5f5] text-[#6b6b6b] font-semibold uppercase tracking-wide text-[10px]">
                  {tableHeaders.map((h) => (
                    <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-[#f0f0f0] hover:bg-[#fafafa]">
                    <td className="px-3 py-2 font-medium text-[#1a1a1a]">{row.month}</td>
                    <td className="px-3 py-2 text-[#6b6b6b] font-mono">{row.acct}</td>
                    <td className={`px-3 py-2 text-[#1a1a1a] ${numCell}`}>{fmtMoney(row.revenue)}</td>
                    <td className={`px-3 py-2 text-[#1a1a1a] ${numCell}`}>{fmtMoney(row.deposits)}</td>
                    <td className={`px-3 py-2 text-[#1a1a1a] ${numCell}`}>{fmtMoney(row.endBal)}</td>
                    <td className={`px-3 py-2 text-[#1a1a1a] ${numCell}`}>{row.depCount || '--'}</td>
                    <td className={`${row.neg > 0 ? 'px-3 py-2 text-red-600 font-semibold' : 'px-3 py-2 text-[#9b9b9b]'} ${numCell}`}>{row.neg}</td>
                    <td className={`${row.nsf > 0 ? 'px-3 py-2 text-red-600 font-semibold' : 'px-3 py-2 text-[#9b9b9b]'} ${numCell}`}>{row.nsf}</td>
                  </tr>
                ))}
                <tr className="border-t border-[#e5e5e5] bg-[#fafafa]">
                  <td className="px-3 py-2 font-semibold text-[#1a1a1a]">Average</td>
                  <td className="px-3 py-2 text-[#9b9b9b]">—</td>
                  <td className={`px-3 py-2 font-semibold text-[#1a1a1a] ${numCell}`}>{fmtMoney(avgRevenue)}</td>
                  <td className={`px-3 py-2 font-semibold text-[#1a1a1a] ${numCell}`}>{fmtMoney(avgRevenue)}</td>
                  <td className={`px-3 py-2 font-semibold text-[#1a1a1a] ${numCell}`}>{fmtMoney(Number(ud.endingBalance ?? rows[rows.length - 1]?.endBal ?? 0))}</td>
                  <td className={`px-3 py-2 font-semibold text-[#1a1a1a] ${numCell}`}>{depositsPerMo > 0 ? fmtNum(depositsPerMo) : '--'}</td>
                  <td className={`px-3 py-2 text-[#6b6b6b] ${numCell}`}>{fmtNum(negDaysPerMo)}</td>
                  <td className={`px-3 py-2 text-[#6b6b6b] ${numCell}`}>{fmtNum(nsfsPerMo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">Summary</h3>
        {inline ? (
          <div className="bg-[#fafafa] border border-[#ececec] rounded-xl px-3 py-2">
            {statPairs.map(([lbl, val]) => (
              <div key={lbl} className="flex items-start justify-between gap-3 py-1.5 border-b border-[#f5f5f5] last:border-b-0">
                <span className="text-xs text-[#9b9b9b] min-w-0">{lbl}</span>
                <span className="text-sm text-[#1a1a1a] tabular-nums text-right flex-shrink-0">{val}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#1a1a1a] rounded-xl p-5">
            <div className="grid grid-cols-2 gap-x-10 gap-y-2.5">
              {statPairs.map(([lbl, val]) => (
                <div key={lbl} className="flex justify-between gap-4">
                  <span className="text-[#6b6b6b] text-xs">{lbl}</span>
                  <span className="text-white font-semibold text-xs">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {mcaPositions.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">MCA Positions</h3>
          <div className="border border-[#e5e5e5] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f5f5f5] text-[#6b6b6b] font-semibold uppercase tracking-wide text-[10px]">
                  <th className="px-3 py-2 text-left">Funder</th>
                  <th className="px-3 py-2 text-left">Funded</th>
                  <th className="px-3 py-2 text-left">Payment</th>
                  <th className="px-3 py-2 text-left">Frequency</th>
                  <th className="px-3 py-2 text-left">Monthly</th>
                  <th className="px-3 py-2 text-left">Balance</th>
                </tr>
              </thead>
              <tbody>
                {mcaPositions.map((p, i) => {
                  const fundedAmt = p.fundedAmount && p.fundedAmount > 0 ? fmtMoney(p.fundedAmount) : '';
                  const fundedDate = formatMcaFundedDate(p.fundedDate);
                  return (
                  <tr key={`${p.lender}-${i}`} className="border-t border-[#f0f0f0]">
                    <td className="px-3 py-2 font-medium text-[#1a1a1a]">{p.lender}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${numCell}`}>
                      {fundedAmt ? <div className="text-[#1a1a1a]">{fundedAmt}</div> : null}
                      {fundedDate ? <div className="text-[10px] text-[#9b9b9b]">{fundedDate}</div> : null}
                      {!fundedAmt && !fundedDate ? <span className="text-[#6b6b6b]">—</span> : null}
                    </td>
                    <td className={`px-3 py-2 text-[#1a1a1a] ${numCell}`}>
                      ${p.payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-[#6b6b6b] capitalize">{p.frequency}</td>
                    <td className={`px-3 py-2 text-[#1a1a1a] ${numCell}`}>{fmtMoney(p.monthlyPayment)}</td>
                    <td className={`px-3 py-2 text-[#6b6b6b] ${numCell}`}>{p.outstanding ? fmtMoney(p.outstanding) : '--'}</td>
                  </tr>
                  );
                })}
                <tr className="border-t border-[#e5e5e5] bg-[#fafafa]">
                  <td className="px-3 py-2 font-semibold text-[#1a1a1a]">Total</td>
                  <td className={`px-3 py-2 font-semibold text-[#1a1a1a] ${numCell}`}>{fmtMoney(mcaPositions.reduce((s, p) => s + (p.fundedAmount || 0), 0))}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className={`px-3 py-2 font-semibold text-[#1a1a1a] ${numCell}`}>{fmtMoney(mcaMonthly)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">Flags</h3>
        <div className={`grid gap-2 border border-[#e5e5e5] rounded-xl ${inline ? 'grid-cols-1 p-3' : 'grid-cols-2 p-4'}`}>
          {CHECKBOXES.map(([field, label]) => (
            <label key={field} className="flex items-center gap-2.5 text-sm text-[#1a1a1a] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(ud[field])}
                onChange={(e) => { onSaveField(field, e.target.checked ? 'true' : ''); }}
                className="w-4 h-4 rounded border-[#e5e5e5] accent-[#1a1a1a]"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {!inline && !snap && !hasParsedFin && (
        <p className="text-xs text-[#9b9b9b] text-center py-4 border border-dashed border-[#e5e5e5] rounded-xl">
          No bank statement analysis yet. Upload statements in Documents and apply the parsed fields.
        </p>
      )}
    </div>
  );
}
