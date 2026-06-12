'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BankStatementAnalysisSnapshot,
  compactMetricsForStorage,
  mapAnalyzerMetricsToUnderwritingFields,
} from '@/lib/bankAnalyzer';
import CashFlowSankeyChart, { type TxnRow } from '@/components/CashFlowSankeyChart';

type UnderwritingPatch = {
  month1Revenue: number;
  month2Revenue: number;
  month3Revenue: number;
  month4Revenue: number;
  avgDailyBalance: number;
  endingBalance: number;
  nsfCount: number;
  depositsCount: number;
  bankStatementAnalysis: BankStatementAnalysisSnapshot;
};

type AnalyzeMetrics = Record<string, unknown>;

type PerFileRow = { filename: string; metrics: AnalyzeMetrics };

type AnalyzeSuccessJson = {
  success?: boolean;
  metrics: AnalyzeMetrics;
  ai_assisted?: boolean;
  ai_assisted_message?: string | null;
  pdf_base64?: string;
  filename?: string;
  per_file?: PerFileRow[];
  file_errors?: Array<{ filename?: string; error?: string }>;
  transactions?: TxnRow[];
};

function fmtCurrency(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return '—';
  const neg = n < 0;
  const abs = Math.abs(n);
  return (neg ? '-' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function detailMessage(errBody: unknown): string {
  if (errBody && typeof errBody === 'object' && 'detail' in errBody) {
    const d = (errBody as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return JSON.stringify(d);
    return String(d);
  }
  if (errBody && typeof errBody === 'object' && 'error' in errBody) {
    return String((errBody as { error: unknown }).error);
  }
  return 'Analysis failed.';
}

type MonthlySummaryRow = {
  month: string;
  total_deposits?: number;
  true_deposits?: number;
  deposit_count?: number;
  avg_daily_balance?: number;
  ending_balance?: number;
  nsf_count?: number;
  nsf_total?: number;
  loan_payments?: number;
};

function monthlySummaryFoot(rows: MonthlySummaryRow[]) {
  if (!rows.length) return null;
  const n = rows.length;
  let totalDeposits = 0;
  let trueDeposits = 0;
  let depositCount = 0;
  let nsfCount = 0;
  let nsfTotal = 0;
  let loanPayments = 0;
  const adbs: number[] = [];
  const endings: number[] = [];
  for (const r of rows) {
    totalDeposits += Number(r.total_deposits) || 0;
    trueDeposits += Number(r.true_deposits) || 0;
    depositCount += Number(r.deposit_count) || 0;
    nsfCount += Number(r.nsf_count) || 0;
    nsfTotal += Number(r.nsf_total) || 0;
    loanPayments += Number(r.loan_payments) || 0;
    adbs.push(Number(r.avg_daily_balance) || 0);
    endings.push(Number(r.ending_balance) || 0);
  }
  return {
    totalDeposits,
    trueDeposits,
    depositCount,
    avgDailyBalance: adbs.reduce((a, b) => a + b, 0) / n,
    endingBalance: endings.length ? endings[endings.length - 1]! : 0,
    nsfCount,
    nsfTotal,
    loanPayments,
  };
}

export default function BankStatementAnalyzerPanel({
  leadId,
  bankStatementAnalysis,
  onApplyBankFields,
}: {
  leadId: string;
  bankStatementAnalysis?: BankStatementAnalysisSnapshot;
  onApplyBankFields: (patch: UnderwritingPatch) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [softWarning, setSoftWarning] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('analysis.pdf');
  const [livePayload, setLivePayload] = useState<AnalyzeSuccessJson | null>(null);
  const [openPf, setOpenPf] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setFiles([]);
    setPdfBase64(null);
    setLivePayload(null);
    setError(null);
    setSoftWarning(null);
    setOpenPf({});
  }, [leadId]);

  const displayMetrics = (livePayload?.metrics ?? bankStatementAnalysis?.displayMetrics ?? null) as AnalyzeMetrics | null;
  const sankeyTxns: TxnRow[] =
    (livePayload?.transactions ?? bankStatementAnalysis?.transactions ?? []) as TxnRow[];
  const hasResults = displayMetrics != null && Object.keys(displayMetrics).length > 0;
  const aiFlag = !!(livePayload?.ai_assisted ?? displayMetrics?.ai_assisted);
  const aiFiles = (displayMetrics?.ai_assisted_files as string[] | undefined) ?? [];
  const aiMsg =
    (livePayload?.ai_assisted_message ?? (displayMetrics?.ai_assisted_message as string | null | undefined) ?? '').trim();

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter((f) => /\.(pdf|csv)$/i.test(f.name));
    const skipped = incoming.length - valid.length;
    if (skipped > 0) {
      setError(`Skipped ${skipped} unsupported file(s). Only PDF and CSV are accepted.`);
    } else {
      setError(null);
    }
    setFiles((prev) => {
      const next = [...prev];
      for (const f of valid) {
        if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
      }
      return next;
    });
    setLivePayload(null);
    setSoftWarning(null);
  }, []);

  const removeAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setLivePayload(null);
  };

  const onAnalyze = async () => {
    if (!files.length) return;
    setLoading(true);
    setProgress(12);
    setError(null);
    setSoftWarning(null);
    setPdfBase64(null);

    const fd = new FormData();
    if (files.length === 1) {
      fd.append('file', files[0], files[0].name);
    } else {
      files.forEach((f) => fd.append('files', f, f.name));
    }

    try {
      const resp = await fetch('/api/bank-analyze', { method: 'POST', body: fd });
      setProgress(72);
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(detailMessage(json));
      }
      const data = json as AnalyzeSuccessJson;
      if (!data.metrics || typeof data.metrics !== 'object') {
        throw new Error('Analyzer returned no metrics.');
      }

      setProgress(90);
      setPdfBase64(data.pdf_base64 ?? null);
      setPdfFilename(data.filename || 'statement_analysis.pdf');
      setLivePayload(data);

      const fe = data.file_errors;
      if (fe?.length) {
        setSoftWarning(
          `${fe.length} file(s) could not be parsed:\n${fe.map((e) => `${e.filename ?? '?'}: ${e.error ?? 'error'}`).join('\n')}`
        );
      }

      const bankPatch = mapAnalyzerMetricsToUnderwritingFields(data.metrics as Record<string, unknown>);
      const snapshot: BankStatementAnalysisSnapshot = {
        analyzedAt: new Date().toISOString(),
        ai_assisted: !!(data.ai_assisted ?? data.metrics.ai_assisted),
        ai_assisted_message: data.ai_assisted_message ?? (data.metrics.ai_assisted_message as string | null) ?? null,
        displayMetrics: compactMetricsForStorage(data.metrics as Record<string, unknown>),
        per_file: data.per_file,
        transactions: data.transactions ?? [],
      };
      onApplyBankFields({ ...bankPatch, bankStatementAnalysis: snapshot });
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error.');
      setLivePayload(null);
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 400);
    }
  };

  const downloadPdf = () => {
    if (!pdfBase64) return;
    const bytes = atob(pdfBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const m = displayMetrics;
  const months = Number(m?.num_months) || 1;
  const monthlySummary = (m?.monthly_summary as MonthlySummaryRow[] | undefined) ?? [];
  const monthlySummaryTotals = monthlySummaryFoot(monthlySummary);
  const perFile = (livePayload?.per_file ?? bankStatementAnalysis?.per_file) ?? [];

  const negDays = Number(m?.negative_days) || 0;
  const nsfN = Number(m?.nsf_count) || 0;
  const loansArr = (m?.loans as unknown[]) ?? [];

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-sm">
      {/* ── Sankey chart — shown whenever transactions are available (fresh or persisted) ── */}
      {sankeyTxns.length > 0 && (
        <CashFlowSankeyChart transactions={sankeyTxns} />
      )}

      <div className={`border-b border-gray-200 pb-3 ${sankeyTxns.length > 0 ? 'mt-2 mb-4' : 'mb-4'}`}>
        <h3 className="text-lg font-bold text-gray-900">Bank Statement Analyzer</h3>
        <p className="text-xs text-gray-600">
          Same flow as the standalone tool — uploads stay in memory unless you save the deal.
        </p>
      </div>

      {hasResults && m && (
        <div className="mb-6 space-y-6">
          {aiFlag && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div>
                <strong className="text-amber-900">AI-assisted — please verify numbers</strong>
                <p className="mt-1 text-sm leading-relaxed text-amber-900/90">
                  {aiMsg ||
                    'Built-in parsers did not fully recognize this format; transactions were extracted with AI. Spot-check totals and balances against your originals.'}
                  {aiFiles.length > 0 ? ` Affected file(s): ${aiFiles.join(', ')}.` : ''}
                </p>
              </div>
            </div>
          )}

          <div className="inline-block rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-600">
            Period: <strong className="text-gray-900">{String(m.period_label ?? '—')}</strong>
          </div>

          <div>
            <h4 className="mb-3 border-l-4 border-[#5a7fc7] pl-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
              Combined Summary
            </h4>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg Monthly Deposits</div>
                <div className="text-xl font-extrabold text-emerald-600">{fmtCurrency(m.avg_monthly_deposits)}</div>
                <div className="text-[11px] text-gray-500">
                  over {months} month{months === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg Monthly True Deposits</div>
                <div className="text-xl font-extrabold text-teal-600">{fmtCurrency(m.avg_monthly_true_deposits)}</div>
                <div className="text-[11px] text-gray-500">
                  over {months} month{months === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg Monthly Daily Balance</div>
                <div className="text-xl font-extrabold text-[#5a7fc7]">{fmtCurrency(m.avg_monthly_daily_balance)}</div>
                <div className="text-[11px] text-gray-500">avg of monthly averages</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg Monthly Ending Balance</div>
                <div className="text-xl font-extrabold text-gray-900">{fmtCurrency(m.avg_monthly_ending_balance)}</div>
                <div className="text-[11px] text-gray-500">avg month-end balance</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg # Monthly Deposits</div>
                <div className="text-xl font-extrabold text-gray-900">
                  {m.avg_monthly_deposit_count != null ? Number(m.avg_monthly_deposit_count).toFixed(1) : '—'}
                </div>
                <div className="text-[11px] text-gray-500">deposits per month</div>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Negative Days</div>
                <div className={`text-xl font-extrabold ${negDays > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {m.negative_days == null || m.negative_days === '' ? '—' : Number(m.negative_days)}
                </div>
                <div className="text-[11px] text-gray-500">days below $0</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">NSF / OD Fees</div>
                <div className={`text-xl font-extrabold ${nsfN > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {m.nsf_count == null || m.nsf_count === '' ? '—' : Number(m.nsf_count)}
                </div>
                <div className="text-[11px] text-gray-500">{fmtCurrency(m.nsf_total)} total fees</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Loans Found</div>
                <div className="text-xl font-extrabold text-violet-700">{loansArr.length}</div>
                <div className="text-[11px] text-gray-500">loan type(s)</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Avg Monthly Loan Payments</div>
                <div className="text-xl font-extrabold text-violet-700">{fmtCurrency(m.monthly_loan_payments)}</div>
                <div className="text-[11px] text-gray-500">{fmtCurrency(m.total_loan_payments)} total</div>
              </div>
            </div>
          </div>

          {pdfBase64 && (
            <button
              type="button"
              onClick={downloadPdf}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-900 bg-gray-900 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" />
              </svg>
              Download Combined PDF Report
            </button>
          )}

          {perFile.length > 1 && (
            <div>
              <h4 className="mb-3 border-l-4 border-[#5a7fc7] pl-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Per-File Breakdown
              </h4>
              <div className="space-y-2">
                {perFile.map((pf, idx) => {
                  const pm = pf.metrics;
                  const open = openPf[idx] ?? false;
                  return (
                    <div key={`${pf.filename}-${idx}`} className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-100"
                        onClick={() => setOpenPf((s) => ({ ...s, [idx]: !open }))}
                      >
                        <span className="flex-1 truncate text-sm font-semibold text-gray-900">
                          {pf.filename}
                          {pm.ai_assisted ? (
                            <span className="ml-2 align-middle rounded border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-extrabold text-amber-900">
                              AI
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-gray-500">{String(pm.period_label ?? '')}</span>
                        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
                      </button>
                      {open && (
                        <div className="border-t border-gray-200 bg-white px-4 py-3">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                              <div className="text-[10px] font-bold uppercase text-gray-500">Ending Balance</div>
                              <div className="text-base font-bold text-emerald-600">{fmtCurrency(pm.ending_balance)}</div>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                              <div className="text-[10px] font-bold uppercase text-gray-500">Avg Daily Bal</div>
                              <div className="text-base font-bold text-[#5a7fc7]">{fmtCurrency(pm.avg_daily_balance)}</div>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                              <div className="text-[10px] font-bold uppercase text-gray-500">True Deposits</div>
                              <div className="text-base font-bold text-teal-600">{fmtCurrency(pm.true_deposits)}</div>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                              <div className="text-[10px] font-bold uppercase text-gray-500">NSF Count</div>
                              <div
                                className={`text-base font-bold ${(Number(pm.nsf_count) || 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}
                              >
                                {pm.nsf_count == null || pm.nsf_count === '' ? 0 : Number(pm.nsf_count)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                              <div className="text-[10px] font-bold uppercase text-gray-500">Neg Days</div>
                              <div
                                className={`text-base font-bold ${(Number(pm.negative_days) || 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}
                              >
                                {pm.negative_days == null || pm.negative_days === '' ? 0 : Number(pm.negative_days)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                              <div className="text-[10px] font-bold uppercase text-gray-500">Withdrawals</div>
                              <div className="text-base font-bold text-gray-900">{fmtCurrency(pm.total_withdrawals)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {monthlySummary.length > 0 && monthlySummaryTotals && (
            <div>
              <h4 className="mb-3 border-l-4 border-[#5a7fc7] pl-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Month-by-month breakdown
              </h4>
              <p className="mb-2 text-xs text-gray-600">Same columns as the downloadable PDF report.</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-[860px] w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-700">
                      <th className="px-2 py-2 text-left">Month</th>
                      <th className="px-2 py-2 text-right">Total deposits</th>
                      <th className="px-2 py-2 text-right">True deposits</th>
                      <th className="px-2 py-2 text-right"># Dep</th>
                      <th className="px-2 py-2 text-right">Avg daily bal</th>
                      <th className="px-2 py-2 text-right">Ending bal</th>
                      <th className="px-2 py-2 text-right">NSF #</th>
                      <th className="px-2 py-2 text-right">NSF fees</th>
                      <th className="px-2 py-2 text-right">Loan pmts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((r, idx) => {
                      const nsf = Number(r.nsf_count) || 0;
                      return (
                        <tr
                          key={`${r.month}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 text-gray-900">{r.month}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                            {fmtCurrency(r.total_deposits)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium text-emerald-700">
                            {fmtCurrency(r.true_deposits)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                            {r.deposit_count ?? '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[#5a7fc7]">
                            {fmtCurrency(r.avg_daily_balance)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                            {fmtCurrency(r.ending_balance)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums ${nsf > 0 ? 'bg-red-50 font-semibold text-red-700' : 'text-gray-700'}`}
                          >
                            {nsf}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums ${nsf > 0 ? 'bg-red-50 text-red-700' : 'text-gray-700'}`}
                          >
                            {fmtCurrency(r.nsf_total)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-violet-700">
                            {fmtCurrency(r.loan_payments)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-300 bg-blue-50/80 font-bold">
                      <td className="px-2 py-2 text-gray-900">TOTAL / AVG</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                        {fmtCurrency(monthlySummaryTotals.totalDeposits)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-800">
                        {fmtCurrency(monthlySummaryTotals.trueDeposits)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                        {monthlySummaryTotals.depositCount}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#5a7fc7]">
                        {fmtCurrency(monthlySummaryTotals.avgDailyBalance)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                        {fmtCurrency(monthlySummaryTotals.endingBalance)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                        {monthlySummaryTotals.nsfCount}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                        {fmtCurrency(monthlySummaryTotals.nsfTotal)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-violet-800">
                        {fmtCurrency(monthlySummaryTotals.loanPayments)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loansArr.length > 0 && (
            <div>
              <h4 className="mb-3 border-l-4 border-[#5a7fc7] pl-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Loan / financing activity
              </h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-left text-[10px] font-bold uppercase tracking-wide text-gray-700">
                      <th className="px-3 py-2">Lender / type</th>
                      <th className="px-3 py-2 text-right">Transactions</th>
                      <th className="px-3 py-2 text-right">Total paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.loans as Array<{ loan_type?: string; count?: number; total?: number }>).map((loan, idx) => (
                      <tr
                        key={`${loan.loan_type}-${idx}`}
                        className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-violet-50/40' : 'bg-white'}`}
                      >
                        <td className="px-3 py-2 text-gray-900">{String(loan.loan_type ?? 'Loan')}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{loan.count ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-violet-700">
                          {fmtCurrency(loan.total != null ? Math.abs(Number(loan.total)) : null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-gray-500">
            Bank analyzer — files processed in memory only unless you save underwriting.
          </p>
        </div>
      )}

      {/* ── Drop zone — always at the bottom ── */}
      <div
        className={`relative cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? 'border-[#5a7fc7] bg-blue-50/80'
            : files.length
              ? 'border-emerald-500/70 bg-emerald-50/40'
              : 'border-gray-300 bg-gray-50'
        } ${hasResults ? 'mt-6' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles([...e.dataTransfer.files]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.csv"
          multiple
          className="absolute inset-0 cursor-pointer opacity-0 w-full h-full"
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) addFiles([...list]);
            e.target.value = '';
          }}
        />
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400" aria-hidden>
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div className="font-semibold text-gray-900">Drag & drop bank statements here</div>
        <div className="mt-1 text-sm text-gray-600">PDF or CSV — multiple files combine into one report</div>
        <div className="mt-2 text-xs text-gray-500">Click to browse</div>
      </div>

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs text-gray-800"
            >
              <span className="max-w-[160px] truncate" title={f.name}>
                {f.name}
              </span>
              <span className="text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                className="pl-1 text-gray-500 hover:text-red-600"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-[#5a7fc7]" />
            <span className="text-sm text-gray-600">Parsing statements and building metrics…</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-gray-200">
            <div className="h-full rounded bg-[#5a7fc7] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {softWarning && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {softWarning}
        </div>
      )}

      <button
        type="button"
        disabled={!files.length || loading}
        onClick={onAnalyze}
        className="mt-4 w-full rounded-md bg-[#5a7fc7] py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4a6fb7] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {files.length > 1 ? `Analyze ${files.length} Statements` : 'Analyze Statement'}
      </button>
    </div>
  );
}
