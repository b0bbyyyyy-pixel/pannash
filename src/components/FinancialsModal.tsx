'use client';
import React from 'react';
import { parseMcaPositions, parseStatementMonths, averagesFromMonths } from '@/lib/bankAnalyzer';

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

type Props = {
  snap: BankSnap | undefined;
  ud: Record<string, unknown>;
  leadName: string;
  leadCompany?: string | null;
  derivedTIB: number | null;
  onSaveField: (k: string, v: string) => void;
  onClose: () => void;
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

function buildMonthRows(snap: BankSnap | undefined, ud: Record<string, unknown>): MonthRow[] {
  const fromUd = parseStatementMonths(ud.statementMonths);
  if (fromUd.length) {
    return fromUd.map(m => ({
      month: m.month,
      acct: acctLabel(m.accountNumber),
      revenue: m.totalDeposits ?? 0,
      deposits: m.totalDeposits ?? 0,
      endBal: m.endingBalance ?? 0,
      depCount: m.depositCount ?? 0,
      neg: m.negativeDays ?? 0,
      nsf: m.nsfCount ?? 0,
    }));
  }

  const rows: MonthRow[] = [];
  if (!snap) return rows;

  const perFile = snap.per_file ?? [];
  const m = snap.displayMetrics;
  const summary = (m?.monthly_summary as Array<Record<string, unknown>> | undefined) ?? [];

  // Parsed snapshot already has one row per submitted month — prefer that over analyzer per_file.
  if (summary.length > 0 && !perFile.length) {
    const mr = (m?.monthly_revenue as Array<{ month?: string; amount?: number }>) ?? [];
    for (const row of summary) {
      const month = String(row.month ?? '');
      const revEntry = mr.find((r) => r.month === month);
      rows.push({
        month,
        acct: acctLabel(row.account ?? row.accountNumber),
        revenue: Number(revEntry?.amount ?? row.true_deposits ?? row.total_deposits ?? 0),
        deposits: Number(row.total_deposits ?? row.true_deposits ?? 0),
        endBal: Number(row.ending_balance ?? 0),
        depCount: Number(row.deposit_count ?? 0),
        neg: Number(row.negative_days ?? 0),
        nsf: Number(row.nsf_count ?? 0),
      });
    }
    return rows;
  }

  if (perFile.length > 0) {
    for (const pf of perFile) {
      const base = pf.filename.replace(/\.[^.]+$/, '');
      const label = base.length >= 4 ? '...' + base.slice(-4) : base;
      const pm = pf.metrics;
      const ms = (pm.monthly_summary as Array<Record<string, unknown>>) ?? [];
      const mr = (pm.monthly_revenue as Array<{ month?: string; amount?: number }>) ?? [];
      for (const row of ms) {
        const month = String(row.month ?? '');
        const revEntry = mr.find((r) => r.month === month);
        rows.push({
          month,
          acct: acctLabel(row.account) !== '--' ? acctLabel(row.account) : label,
          revenue: Number(revEntry?.amount ?? 0),
          deposits: Number(row.total_deposits ?? row.true_deposits ?? 0),
          endBal: Number(row.ending_balance ?? 0),
          depCount: Number(row.deposit_count ?? 0),
          neg: Number(row.negative_days ?? 0),
          nsf: Number(row.nsf_count ?? 0),
        });
      }
    }
    return rows;
  }

  if (m) {
    const ms = (m.monthly_summary as Array<Record<string, unknown>>) ?? [];
    const mr = (m.monthly_revenue as Array<{ month?: string; amount?: number }>) ?? [];
    for (const row of ms) {
      const month = String(row.month ?? '');
      const revEntry = mr.find((r) => r.month === month);
      rows.push({
        month,
        acct: acctLabel(row.account ?? row.accountNumber),
        revenue: Number(revEntry?.amount ?? 0),
        deposits: Number(row.total_deposits ?? row.true_deposits ?? 0),
        endBal: Number(row.ending_balance ?? 0),
        depCount: Number(row.deposit_count ?? 0),
        neg: Number(row.negative_days ?? 0),
        nsf: Number(row.nsf_count ?? 0),
      });
    }
  }
  return rows;
}

const CHECKBOXES: [string, string][] = [
  ['isSoleProp', 'Sole prop'],
  ['isNonProfit', 'Non-profit'],
  ['priorMcaDefault', 'Prior MCA default'],
  ['isMercuryBank', 'Mercury / online bank'],
  ['isReverseConsolidation', 'Reverse consolidation'],
];

export default function FinancialsModal({ snap, ud, leadName, leadCompany, derivedTIB, onSaveField, onClose }: Props) {
  const m = snap?.displayMetrics;
  const rows = buildMonthRows(snap, ud);
  const monthAvgs = averagesFromMonths(parseStatementMonths(ud.statementMonths));

  const avgRevenue    = Number(ud.monthlyRevenue ?? monthAvgs.monthlyRevenue ?? m?.avg_monthly_true_deposits ?? m?.avg_monthly_deposits ?? 0);
  const avgDailyBal   = Number(ud.avgDailyBalance ?? monthAvgs.avgDailyBalance ?? m?.avg_monthly_daily_balance ?? 0);
  const depositsPerMo = Number(ud.depositsCount ?? monthAvgs.depositsCount ?? m?.avg_monthly_deposit_count ?? 0);
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
  const displayName   = leadCompany || leadName;
  const analyzedStr   = snap?.analyzedAt
    ? new Date(snap.analyzedAt).toLocaleDateString('en-US')
    : '';
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

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#1a1a1a]">{displayName}</h2>
            <p className="text-xs text-[#9b9b9b]">
              {analyzedStr ? 'Financial Analysis · ' + analyzedStr : 'Financial Analysis'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f5f5f5] text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Monthly Table */}
          {rows.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">Monthly Breakdown</h3>
              <div className="border border-[#e5e5e5] rounded-xl overflow-hidden">
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
                        <td className="px-3 py-2 text-[#1a1a1a]">{fmtMoney(row.revenue)}</td>
                        <td className="px-3 py-2 text-[#1a1a1a]">{fmtMoney(row.deposits)}</td>
                        <td className="px-3 py-2 text-[#1a1a1a]">{fmtMoney(row.endBal)}</td>
                        <td className="px-3 py-2 text-[#1a1a1a]">{row.depCount || '--'}</td>
                        <td className={row.neg > 0 ? 'px-3 py-2 text-red-600 font-semibold' : 'px-3 py-2 text-[#9b9b9b]'}>{row.neg}</td>
                        <td className={row.nsf > 0 ? 'px-3 py-2 text-red-600 font-semibold' : 'px-3 py-2 text-[#9b9b9b]'}>{row.nsf}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-[#e5e5e5] bg-[#fafafa]">
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">Average</td>
                      <td className="px-3 py-2 text-[#9b9b9b]">—</td>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{fmtMoney(avgRevenue)}</td>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{fmtMoney(avgRevenue)}</td>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{fmtMoney(Number(ud.endingBalance ?? rows[rows.length - 1]?.endBal ?? 0))}</td>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{depositsPerMo > 0 ? fmtNum(depositsPerMo) : '--'}</td>
                      <td className="px-3 py-2 text-[#6b6b6b]">{fmtNum(negDaysPerMo)}</td>
                      <td className="px-3 py-2 text-[#6b6b6b]">{fmtNum(nsfsPerMo)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">Summary</h3>
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
          </div>

          {/* MCA Positions */}
          {mcaPositions.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">MCA Positions</h3>
              <div className="border border-[#e5e5e5] rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#f5f5f5] text-[#6b6b6b] font-semibold uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2 text-left">Funder</th>
                      <th className="px-3 py-2 text-left">Payment</th>
                      <th className="px-3 py-2 text-left">Frequency</th>
                      <th className="px-3 py-2 text-left">Monthly</th>
                      <th className="px-3 py-2 text-left">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mcaPositions.map((p, i) => (
                      <tr key={`${p.lender}-${i}`} className="border-t border-[#f0f0f0]">
                        <td className="px-3 py-2 font-medium text-[#1a1a1a]">{p.lender}</td>
                        <td className="px-3 py-2 text-[#1a1a1a]">
                          ${p.payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-[#6b6b6b] capitalize">{p.frequency}</td>
                        <td className="px-3 py-2 text-[#1a1a1a]">{fmtMoney(p.monthlyPayment)}</td>
                        <td className="px-3 py-2 text-[#6b6b6b]">{p.outstanding ? fmtMoney(p.outstanding) : '--'}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-[#e5e5e5] bg-[#fafafa]">
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]" colSpan={3}>Total</td>
                      <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{fmtMoney(mcaMonthly)}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Flags */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9b9b9b] mb-3">Flags</h3>
            <div className="grid grid-cols-2 gap-2 border border-[#e5e5e5] rounded-xl p-4">
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

          {/* Empty state when no analysis run yet */}
          {!snap && !hasParsedFin && (
            <p className="text-xs text-[#9b9b9b] text-center py-4 border border-dashed border-[#e5e5e5] rounded-xl">
              No bank statement analysis yet. Upload statements in Documents and apply the parsed fields.
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
