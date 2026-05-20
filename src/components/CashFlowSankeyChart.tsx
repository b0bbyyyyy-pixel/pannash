'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyNode as D3SNode, SankeyLink as D3SLink } from 'd3-sankey';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TxnRow = {
  date: string;
  description: string;
  amount: number;
  balance?: number | null;
  row_class?: string;
};

type NodeDatum = { id: string; label: string; color: string; layer: 0 | 1 | 2 };
type LinkDatum = { source: string; target: string; value: number };
type SNode = D3SNode<NodeDatum, LinkDatum>;
type SLink = D3SLink<NodeDatum, LinkDatum>;

type TooltipState = { x: number; y: number; content: React.ReactNode } | null;

// ─── Color palettes ───────────────────────────────────────────────────────────

const INFLOW_PALETTE: Record<string, string> = {
  'Square / POS':      '#10b981',
  'Zelle Received':    '#06b6d4',
  'Cash Deposits':     '#3b82f6',
  'Wire / ACH In':     '#818cf8',
  'Loan Proceeds':     '#a78bfa',
  'Returns & Refunds': '#64748b',
};

const OUTFLOW_PALETTE: Record<string, string> = {
  'Labor & Payroll':   '#f59e0b',
  'Transfers Out':     '#94a3b8',
  'Food & Dining':     '#f97316',
  'Fuel & Auto':       '#ef4444',
  'Utilities & Bills': '#ec4899',
  'Marketing':         '#a855f7',
  'Shopping & Retail': '#14b8a6',
  'Business Services': '#f43f5e',
  'Bank Fees':         '#dc2626',
  'Other':             '#475569',
  'Net Remaining':     '#22c55e',
};

const CENTER_COLOR = '#6366f1';

// ─── Categorisation ───────────────────────────────────────────────────────────

function categorize(desc: string, amount: number): { cat: string; isInflow: boolean } {
  const d = desc.toLowerCase();
  if (amount > 0) {
    if (/sqc\*|square|visa money transfer/i.test(d)) return { cat: 'Square / POS', isInflow: true };
    if (/zelle.*from/i.test(d))                       return { cat: 'Zelle Received', isInflow: true };
    if (/\bdeposit\b/i.test(d))                       return { cat: 'Cash Deposits', isInflow: true };
    if (/wire|ach|direct dep/i.test(d))               return { cat: 'Wire / ACH In', isInflow: true };
    if (/loan|advance|funding/i.test(d))              return { cat: 'Loan Proceeds', isInflow: true };
    if (/return|refund|credit/i.test(d))              return { cat: 'Returns & Refunds', isInflow: true };
    return { cat: 'Cash Deposits', isInflow: true };
  }
  if (/zelle.*to |payroll|marlena|elizabeth|greg |brianna|john capps|labor/i.test(d))
    return { cat: 'Labor & Payroll', isInflow: false };
  if (/transfer.*to|mobile to|wire|ach settlement|extransfer/i.test(d))
    return { cat: 'Transfers Out', isInflow: false };
  if (/starbucks|dunkin|coffee|cafe|pizza|restaurant|bar |grill|dining|kekes|panera|chili|bonefish|bjs|salad|diner|saddlebred|craft street|harps|irish 31|x-golf/i.test(d))
    return { cat: 'Food & Dining', isInflow: false };
  if (/7-eleven|wawa|shell|speedway|citgo|rebel#|gas|fuel|thornton|bp#|circle k|raceway/i.test(d))
    return { cat: 'Fuel & Auto', isInflow: false };
  if (/att\*|duke.energy|spi\*duke|utility|electric|internet payment|repay cci|concora/i.test(d))
    return { cat: 'Utilities & Bills', isInflow: false };
  if (/marketing|advertising|elite market|albatross/i.test(d))
    return { cat: 'Marketing', isInflow: false };
  if (/target|walmart|publix|costco|petsmart|boot barn|autozone|lola.*pet|ukulele/i.test(d))
    return { cat: 'Shopping & Retail', isInflow: false };
  if (/ups store|intuit|quickbooks|paypal|southwest|stubhub|benchmark|walgreen|thrivewell|lakes chiropract|vagaro|hand and stone|adventure/i.test(d))
    return { cat: 'Business Services', isInflow: false };
  if (/service charge|nsf|overdraft|atm.*fee|non-truist atm|immediate avail.*fee/i.test(d))
    return { cat: 'Bank Fees', isInflow: false };
  return { cat: 'Other', isInflow: false };
}

// ─── Flow builder ─────────────────────────────────────────────────────────────

type KPIs = {
  totalIn: number; totalOut: number; net: number;
  biggestLeak: { cat: string; amount: number };
  burnRate: number; months: number; isAvg: boolean;
};
type FlowData = { nodes: NodeDatum[]; links: LinkDatum[]; kpis: KPIs; months: string[] };

function buildFlow(txns: TxnRow[], monthFilter: string | null): FlowData {
  // Always aggregate ALL months first to get the month list
  const allMonths = new Set<string>();
  for (const t of txns) allMonths.add(t.date.slice(0, 7));
  const months = [...allMonths].sort();
  const numMonths = Math.max(1, months.length);

  // Then filter if a specific month is selected
  const filtered = monthFilter ? txns.filter((t) => t.date.slice(0, 7) === monthFilter) : txns;
  const isAvg = !monthFilter && numMonths > 1;

  const inflows: Record<string, number> = {};
  const outflows: Record<string, number> = {};

  for (const t of filtered) {
    const { cat, isInflow } = categorize(t.description, t.amount);
    if (isInflow) inflows[cat] = (inflows[cat] ?? 0) + Math.abs(t.amount);
    else          outflows[cat] = (outflows[cat] ?? 0) + Math.abs(t.amount);
  }

  // When showing "All", divide every amount by number of months → monthly average
  const divisor = isAvg ? numMonths : 1;
  for (const k of Object.keys(inflows))  inflows[k]  /= divisor;
  for (const k of Object.keys(outflows)) outflows[k] /= divisor;

  const totalIn  = Object.values(inflows).reduce((a, b) => a + b, 0);
  const totalOut = Object.values(outflows).reduce((a, b) => a + b, 0);
  const net      = totalIn - totalOut;

  if (net > 0.5) outflows['Net Remaining'] = net;

  const nodes: NodeDatum[] = [];
  const links: LinkDatum[] = [];

  for (const [cat, amt] of Object.entries(inflows)) {
    if (amt < 0.01) continue;
    nodes.push({ id: cat, label: cat, color: INFLOW_PALETTE[cat] ?? '#3b82f6', layer: 0 });
    links.push({ source: cat, target: '__TOTAL_IN__', value: amt });
  }
  nodes.push({ id: '__TOTAL_IN__', label: 'Total Cash In', color: CENTER_COLOR, layer: 1 });
  for (const [cat, amt] of Object.entries(outflows)) {
    if (amt < 0.01) continue;
    nodes.push({ id: cat, label: cat, color: OUTFLOW_PALETTE[cat] ?? '#475569', layer: 2 });
    links.push({ source: '__TOTAL_IN__', target: cat, value: amt });
  }

  const leaks = Object.entries(outflows).filter(([k]) => k !== 'Transfers Out' && k !== 'Net Remaining');
  const biggestLeak = leaks.sort((a, b) => b[1] - a[1])[0] ?? ['—', 0];

  return {
    nodes, links, months,
    kpis: { totalIn, totalOut, net, biggestLeak: { cat: biggestLeak[0], amount: biggestLeak[1] as number }, burnRate: totalOut, months: numMonths, isAvg },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt     = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtFull = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct     = (part: number, total: number) => (!total ? '0%' : ((Math.abs(part) / Math.abs(total)) * 100).toFixed(1) + '%');

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-white/5 px-3 py-2.5 min-w-[120px] flex-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}

// ─── Sankey SVG ───────────────────────────────────────────────────────────────

function SankeyDiagram({
  nodes, links, kpis, svgWidth, chartH, showPct, wrapRef,
}: {
  nodes: NodeDatum[]; links: LinkDatum[]; kpis: KPIs;
  svgWidth: number; chartH: number; showPct: boolean;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  // Reserve 145px on each side for labels
  const PAD = { top: 16, bottom: 16, left: 150, right: 150 };
  const NODE_W = 20;

  const graph = useMemo(() => {
    if (!nodes.length || !links.length || svgWidth < 300) return null;
    try {
      const gen = d3Sankey<NodeDatum, LinkDatum>()
        .nodeId((d) => d.id)
        .nodeWidth(NODE_W)
        .nodePadding(14)
        .extent([[PAD.left, PAD.top], [svgWidth - PAD.right, chartH - PAD.bottom]]);
      return gen({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) });
    } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, svgWidth, chartH]);

  const linkPath = sankeyLinkHorizontal();

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: chartH }}>
      <svg width="100%" height={chartH} viewBox={`0 0 ${svgWidth} ${chartH}`} className="overflow-visible">
        <defs>
          {graph?.links.map((link, i) => {
            const src = link.source as SNode & NodeDatum;
            const tgt = link.target as SNode & NodeDatum;
            return (
              <linearGradient key={`g${i}`} id={`sg-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={src.color} stopOpacity="0.7" />
                <stop offset="100%" stopColor={tgt.color} stopOpacity="0.7" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Links */}
        {graph?.links.map((link, i) => {
          const src = link.source as SNode & NodeDatum;
          const tgt = link.target as SNode & NodeDatum;
          const val = link.value ?? 0;
          return (
            <path
              key={`lk${i}`}
              d={linkPath(link as Parameters<typeof linkPath>[0]) ?? ''}
              fill="none"
              stroke={`url(#sg-${i})`}
              strokeWidth={Math.max(1, link.width ?? 1)}
              opacity={0.55}
              className="cursor-pointer transition-opacity hover:opacity-90"
              onMouseMove={(e) => {
                const rect = wrapRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({
                  x: e.clientX - rect.left + 14,
                  y: e.clientY - rect.top - 10,
                  content: (
                    <div>
                      <div className="font-bold text-white mb-1">{src.label} → {tgt.label}</div>
                      <div className="text-emerald-300 text-sm">{fmtFull(val)}</div>
                      <div className="text-white/50 text-[11px]">{pct(val, kpis.totalIn)} of total inflows</div>
                    </div>
                  ),
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Nodes + Labels */}
        {graph?.nodes.map((node) => {
          const n = node as SNode & NodeDatum;
          const x0 = n.x0 ?? 0, x1 = n.x1 ?? 0, y0 = n.y0 ?? 0, y1 = n.y1 ?? 0;
          const val = n.value ?? 0;
          const mid = (y0 + y1) / 2;
          const isCenter = n.id === '__TOTAL_IN__';
          const isInflow = n.layer === 0;
          // Labels: inflows go LEFT of node, outflows go RIGHT
          const labelX    = isInflow ? x0 - 10 : x1 + 10;
          const labelAnchor: 'end' | 'start' = isInflow ? 'end' : 'start';
          const nodeH = Math.max(2, y1 - y0);
          const showLabel = nodeH > 10;

          return (
            <g key={n.id} className="cursor-pointer"
              onMouseMove={(e) => {
                const rect = wrapRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({
                  x: e.clientX - rect.left + 14,
                  y: e.clientY - rect.top - 10,
                  content: (
                    <div>
                      <div className="font-bold text-white mb-1">{n.label}</div>
                      <div className="text-emerald-300 text-sm">{fmtFull(val)}</div>
                      {!isCenter && <div className="text-white/50 text-[11px]">{pct(val, kpis.totalIn)} of total</div>}
                    </div>
                  ),
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <rect x={x0} y={y0} width={x1 - x0} height={nodeH} rx={3} fill={n.color} opacity={0.9} />
              {showLabel && (
                <text x={labelX} y={mid} dy="0.35em" textAnchor={labelAnchor}
                  fontSize={isCenter ? 12 : 11} fontWeight={isCenter ? 700 : 500}
                  fill="rgba(255,255,255,0.9)"
                >
                  {isCenter ? 'Total Cash In' : n.label}
                </text>
              )}
              {/* Amount / % on second line for tall nodes */}
              {showLabel && nodeH > 26 && (
                <text x={labelX} y={mid + 14} dy="0.35em" textAnchor={labelAnchor}
                  fontSize={10} fill="rgba(255,255,255,0.5)"
                >
                  {showPct ? pct(val, kpis.totalIn) : fmt(val)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-white/20 bg-[#1e293b]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur"
          style={{ left: Math.min(tooltip.x, svgWidth - 180), top: tooltip.y, maxWidth: 220 }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CashFlowSankeyChart({ transactions }: { transactions: TxnRow[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const modalWrapRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [svgWidth, setSvgWidth] = useState(700);
  const [modalWidth, setModalWidth] = useState(1000);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [showPct, setShowPct] = useState(false);

  // Measure inline container width
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 100) setSvgWidth(w);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Measure modal container width when open
  useLayoutEffect(() => {
    if (!expanded || !modalWrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 100) setModalWidth(w);
    });
    ro.observe(modalWrapRef.current);
    return () => ro.disconnect();
  }, [expanded]);

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = expanded ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [expanded]);

  const allMonths = useMemo(() => {
    const s = new Set<string>();
    for (const t of transactions) s.add(t.date.slice(0, 7));
    return [...s].sort();
  }, [transactions]);

  const { nodes, links, kpis } = useMemo(
    () => buildFlow(transactions, monthFilter),
    [transactions, monthFilter],
  );

  if (!transactions.length) return null;

  // ── Shared controls (used in both inline and modal) ───────────────────────
  const Controls = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowPct((p) => !p)}
        className={`rounded px-2 py-0.5 text-[11px] font-bold transition-colors ${showPct ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
      >
        {showPct ? '%' : '$'}
      </button>
    </div>
  );

  const MonthPills = () => (
    allMonths.length > 1 ? (
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-white/10 scrollbar-none">
        <button
          onClick={() => setMonthFilter(null)}
          className={`flex-shrink-0 rounded-full px-3 py-0.5 text-[11px] font-bold transition-colors ${!monthFilter ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
        >Avg</button>
        {allMonths.map((m) => (
          <button key={m} onClick={() => setMonthFilter(monthFilter === m ? null : m)}
            className={`flex-shrink-0 rounded-full px-3 py-0.5 text-[11px] font-bold transition-colors ${monthFilter === m ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
          >
            {new Date(m + '-15').toLocaleString('en-US', { month: 'short', year: '2-digit' })}
          </button>
        ))}
      </div>
    ) : null
  );

  const perMonthLabel = kpis.isAvg ? 'avg/month' : undefined;
  const KPIBar = () => (
    <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-white/10">
      <KPICard
        label={kpis.isAvg ? 'Avg Monthly Cash In' : 'Total Cash In'}
        value={fmt(kpis.totalIn)}
        sub={kpis.isAvg ? `over ${kpis.months} months` : undefined}
        color="text-emerald-400"
      />
      <KPICard
        label={kpis.isAvg ? 'Avg Monthly Outflows' : 'Total Outflows'}
        value={fmt(kpis.totalOut)}
        sub={`${pct(kpis.totalOut, kpis.totalIn)} of inflows`}
        color="text-red-400"
      />
      <KPICard
        label={kpis.isAvg ? 'Avg Net Cash Flow' : 'Net Cash Flow'}
        value={fmtFull(kpis.net)}
        sub={kpis.net >= 0 ? 'surplus' : 'deficit'}
        color={kpis.net >= 0 ? 'text-emerald-300' : 'text-red-400'}
      />
      <KPICard label="Monthly Burn"   value={fmt(kpis.burnRate)} sub={perMonthLabel ?? 'this month'} color="text-amber-400" />
      <KPICard label="Biggest Leak"   value={fmt(kpis.biggestLeak.amount)} sub={kpis.biggestLeak.cat} color="text-orange-400" />
    </div>
  );

  // ── Inline (collapsed) view ───────────────────────────────────────────────
  return (
    <>
      <div className="mb-4 rounded-xl border border-white/10 bg-[#0f172a] text-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/20">
              <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-wide">Cash Flow</span>
            <span className="text-xs text-white/40">
              {monthFilter
                ? new Date(monthFilter + '-15').toLocaleString('en-US', { month: 'long', year: 'numeric' })
                : `avg of ${kpis.months} month${kpis.months !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Controls />
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1.5 rounded-md bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/40 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              Full Screen
            </button>
          </div>
        </div>

        <KPIBar />
        <MonthPills />

        {/* Inline chart — compact */}
        <div className="px-2 py-3">
          <SankeyDiagram
            nodes={nodes} links={links} kpis={kpis}
            svgWidth={svgWidth} chartH={300}
            showPct={showPct} wrapRef={wrapRef}
          />
        </div>
      </div>

      {/* ── Full-screen modal ─────────────────────────────────────────────── */}
      {expanded && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}
        >
          <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[#0f172a] text-white shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/20">
                  <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
                  </svg>
                </div>
                <span className="text-sm font-bold">Cash Flow Breakdown</span>
                <span className="text-xs text-white/40">
                  {monthFilter
                    ? new Date(monthFilter + '-15').toLocaleString('en-US', { month: 'long', year: 'numeric' })
                    : `avg of ${kpis.months} months`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Controls />
                <button
                  onClick={() => setExpanded(false)}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M15 15v4.5M15 15h4.5M9 15H4.5M9 15v4.5" />
                  </svg>
                  Close
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="flex-shrink-0">
              <KPIBar />
              <MonthPills />
            </div>

            {/* Modal chart — full size */}
            <div className="flex-1 overflow-auto px-2 py-3 min-h-0">
              <SankeyDiagram
                nodes={nodes} links={links} kpis={kpis}
                svgWidth={modalWidth} chartH={Math.max(500, (nodes.length - 1) * 48)}
                showPct={showPct} wrapRef={modalWrapRef}
              />
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 flex flex-wrap gap-x-5 gap-y-1.5 px-5 py-3 border-t border-white/10">
              {[...Object.entries(INFLOW_PALETTE), ...Object.entries(OUTFLOW_PALETTE)]
                .filter(([k]) => nodes.some((n) => n.id === k))
                .map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-white/60">{label}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
