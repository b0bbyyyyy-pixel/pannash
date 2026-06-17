'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LENDERS, TIER_LABELS, LenderCriteria, LenderTier } from '@/data/lenders';
import LenderSettingsModal, { LenderRecord } from '@/components/LenderSettingsModal';

interface LenderMatchPanelProps {
  timeInBusiness: number;
  creditScore: number;
  avgMonthlyRevenue: number;
  currentPositions: number;
  businessState: string;
  industry: string;
  nsfCount: number;
  depositsCount: number;
  isSoleProp: boolean;
}

type MatchStatus = 'qualified' | 'not_qualified';
type FilterTab = 'all' | 'qualified' | 'not_qualified';

interface MatchReason { label: string; pass: boolean; }
interface LenderMatch { lender: LenderCriteria & { id?: string }; status: MatchStatus; reasons: MatchReason[]; }

function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}
function fmtTIB(months: number) {
  if (months === 0) return 'None';
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}yr`;
  return `${y}yr ${m}mo`;
}

function dbToLenderCriteria(r: LenderRecord): LenderCriteria & { id: string } {
  return {
    id: r.id,
    name: r.name,
    tier: r.tier as LenderTier,
    minMonthlyRevenue: r.min_monthly_revenue,
    minTIBMonths: r.min_tib_months,
    minFico: r.min_fico,
    tibFicoTiers: r.tib_fico_tiers ?? undefined,
    noCreditPull: r.no_credit_pull,
    minPosition: r.min_position,
    maxPosition: r.max_position,
    negDaysMax: r.neg_days_max ?? undefined,
    minDeposits: r.min_deposits ?? undefined,
    hardPullSoleProps: r.hard_pull_sole_props,
    restrictsSoleProps: r.restricts_sole_props ?? false,
    restrictedStates: r.restricted_states ?? [],
    restrictedIndustryKeywords: r.restricted_industry_keywords ?? [],
    notes: r.notes ?? '',
  };
}

function computeMatch(lender: LenderCriteria, props: LenderMatchPanelProps): LenderMatch {
  const newPosition = props.currentPositions + 1;
  const reasons: MatchReason[] = [];

  reasons.push({
    label: `Revenue: ${fmtRevenue(Math.round(props.avgMonthlyRevenue))}/mo (min ${fmtRevenue(lender.minMonthlyRevenue)})`,
    pass: props.avgMonthlyRevenue >= lender.minMonthlyRevenue,
  });

  if (lender.tibFicoTiers && lender.tibFicoTiers.length > 0) {
    const tibPass = lender.tibFicoTiers.some(
      (t) => props.timeInBusiness >= t.minTIBMonths && props.creditScore >= t.minFico
    );
    const tierStr = lender.tibFicoTiers.map((t) => `${fmtTIB(t.minTIBMonths)}@${t.minFico}`).join(' or ');
    reasons.push({
      label: tibPass
        ? `TIB & FICO: ${fmtTIB(props.timeInBusiness)} @ ${props.creditScore} ✓`
        : `TIB & FICO: needs ${tierStr} (have ${fmtTIB(props.timeInBusiness)} @ ${props.creditScore})`,
      pass: tibPass,
    });
  } else {
    reasons.push({
      label: `TIB: ${fmtTIB(props.timeInBusiness)} (min ${fmtTIB(lender.minTIBMonths)})`,
      pass: props.timeInBusiness >= lender.minTIBMonths,
    });
    if (lender.noCreditPull) {
      reasons.push({ label: 'No credit pull required', pass: true });
    } else if (lender.minFico > 0) {
      reasons.push({
        label: `FICO: ${props.creditScore} (min ${lender.minFico})`,
        pass: props.creditScore >= lender.minFico,
      });
    }
  }

  const posOrd = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  reasons.push({
    label: lender.minPosition > 1
      ? `Position: ${posOrd(newPosition)} pos (needs ${lender.minPosition}–${lender.maxPosition})`
      : `Position: ${posOrd(newPosition)} pos (max ${lender.maxPosition})`,
    pass: newPosition >= lender.minPosition && newPosition <= lender.maxPosition,
  });

  if (props.businessState && lender.restrictedStates.length > 0) {
    const blocked = lender.restrictedStates.includes(props.businessState.toUpperCase());
    if (blocked) reasons.push({ label: `State: ${props.businessState.toUpperCase()} is restricted`, pass: false });
  }

  if (props.industry && lender.restrictedIndustryKeywords.length > 0) {
    const lower = props.industry.toLowerCase();
    const hit = lender.restrictedIndustryKeywords.find((kw) => lower.includes(kw));
    if (hit) reasons.push({ label: `Industry: "${props.industry}" is restricted`, pass: false });
  }

  // Sole prop check
  if (props.isSoleProp && lender.restrictsSoleProps) {
    reasons.push({ label: 'Sole Proprietors restricted by this lender', pass: false });
  }

  if (lender.negDaysMax !== undefined) {
    reasons.push({
      label: `NSF/Neg Days: ${props.nsfCount} (max ${lender.negDaysMax})`,
      pass: props.nsfCount <= lender.negDaysMax,
    });
  }

  if (lender.minDeposits !== undefined) {
    reasons.push({
      label: `Deposits: ${props.depositsCount}/mo (min ${lender.minDeposits})`,
      pass: props.depositsCount >= lender.minDeposits,
    });
  }

  return {
    lender,
    status: reasons.every((r) => r.pass) ? 'qualified' : 'not_qualified',
    reasons,
  };
}

const TIER_ORDER: LenderTier[] = [1, 2, 3, 4, 5, 6];
const TIER_COLORS: Record<LenderTier, string> = {
  1: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  2: 'text-blue-700 bg-blue-50 border-blue-200',
  3: 'text-teal-700 bg-teal-50 border-teal-200',
  4: 'text-amber-700 bg-amber-50 border-amber-200',
  5: 'text-orange-700 bg-orange-50 border-orange-200',
  6: 'text-red-700 bg-red-50 border-red-200',
};

export default function LenderMatchPanel(props: LenderMatchPanelProps) {
  const [open, setOpen] = useState(false); // collapsed by default
  const [filter, setFilter] = useState<FilterTab>('all');
  const [expandedTiers, setExpandedTiers] = useState<Set<LenderTier>>(new Set([1, 2, 3]));
  const [showSettings, setShowSettings] = useState(false);
  const [lenders, setLenders] = useState<LenderCriteria[]>(LENDERS); // fallback to hardcoded
  const [loadedFromApi, setLoadedFromApi] = useState(false);

  const fetchLenders = useCallback(async () => {
    try {
      const res = await fetch('/api/lenders');
      if (!res.ok) return;
      const json = await res.json();
      if (json.lenders && json.lenders.length > 0) {
        const active = (json.lenders as LenderRecord[])
          .filter((l) => l.is_active)
          .map(dbToLenderCriteria);
        setLenders(active);
        setLoadedFromApi(true);
      }
    } catch { /* use hardcoded fallback */ }
  }, []);

  useEffect(() => { fetchLenders(); }, [fetchLenders]);

  const matches = useMemo(
    () => lenders.map((l) => computeMatch(l, props)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lenders, props.timeInBusiness, props.creditScore, props.avgMonthlyRevenue, props.currentPositions, props.businessState, props.industry, props.nsfCount, props.depositsCount, props.isSoleProp]
  );

  const qualifiedCount = matches.filter((m) => m.status === 'qualified').length;
  const notQualifiedCount = matches.filter((m) => m.status === 'not_qualified').length;
  const visibleMatches = filter === 'all' ? matches : matches.filter((m) => m.status === filter);

  const toggleTier = (tier: LenderTier) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
  };

  return (
    <>
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        {/* Header */}
        <div className="flex items-center bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex-1 flex items-center gap-2 px-4 py-3"
          >
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-semibold">Lender Match</span>
            {!loadedFromApi && <span className="text-[10px] text-slate-400">(defaults)</span>}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">{qualifiedCount} Qualify</span>
              <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-medium">{notQualifiedCount} No</span>
              <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {/* Settings gear */}
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-3 text-slate-400 hover:text-white transition-colors border-l border-slate-600"
            title="Manage lenders"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {open && (
          <div className="bg-white">
            {/* File summary */}
            <div className="px-4 py-2 bg-slate-50 border-b border-gray-200 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
              <span><b>Rev:</b> {fmtRevenue(Math.round(props.avgMonthlyRevenue))}/mo</span>
              <span><b>TIB:</b> {fmtTIB(props.timeInBusiness)}</span>
              <span><b>FICO:</b> {props.creditScore || '—'}</span>
              <span><b>Position:</b> {props.currentPositions + 1}{props.currentPositions + 1 === 1 ? 'st' : props.currentPositions + 1 === 2 ? 'nd' : props.currentPositions + 1 === 3 ? 'rd' : 'th'}</span>
              {props.businessState && <span><b>State:</b> {props.businessState.toUpperCase()}</span>}
            </div>

            {/* Filter tabs */}
            <div className="flex border-b border-gray-200">
              {(['all', 'qualified', 'not_qualified'] as FilterTab[]).map((tab) => {
                const count = tab === 'all' ? matches.length : tab === 'qualified' ? qualifiedCount : notQualifiedCount;
                const label = tab === 'all' ? 'All' : tab === 'qualified' ? '✓ Qualify' : '✗ No';
                const active = filter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      active
                        ? tab === 'qualified' ? 'text-green-700 border-b-2 border-green-600 bg-green-50'
                        : tab === 'not_qualified' ? 'text-red-700 border-b-2 border-red-600 bg-red-50'
                        : 'text-slate-800 border-b-2 border-slate-700 bg-slate-50'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Tier sections */}
            <div className="max-h-[420px] overflow-y-auto">
              {TIER_ORDER.map((tier) => {
                const tierMatches = visibleMatches.filter((m) => m.lender.tier === tier);
                if (tierMatches.length === 0) return null;
                const allTierMatches = matches.filter((m) => m.lender.tier === tier);
                const tierQualified = allTierMatches.filter((m) => m.status === 'qualified').length;
                const isExpanded = expandedTiers.has(tier);
                return (
                  <div key={tier} className="border-b border-gray-100 last:border-0">
                    <button
                      onClick={() => toggleTier(tier)}
                      className={`w-full flex items-center justify-between px-4 py-2 border-b text-xs font-semibold ${TIER_COLORS[tier]}`}
                    >
                      <span>{TIER_LABELS[tier]}</span>
                      <div className="flex items-center gap-2">
                        <span>{tierQualified}/{allTierMatches.length} qualify</span>
                        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isExpanded && tierMatches.map((match) => (
                      <LenderRow key={match.lender.name} match={match} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <LenderSettingsModal
          onClose={() => setShowSettings(false)}
          onRefresh={fetchLenders}
        />
      )}
    </>
  );
}

function LenderRow({ match }: { match: LenderMatch }) {
  const [expanded, setExpanded] = useState(false);
  const { lender, status, reasons } = match;
  const qualified = status === 'qualified';
  const failReasons = reasons.filter((r) => !r.pass);

  return (
    <div className={`border-b border-gray-100 last:border-0 ${qualified ? 'bg-white' : 'bg-red-50/30'}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${qualified ? 'bg-green-500' : 'bg-red-400'}`} />
        <span className={`text-xs font-semibold flex-1 ${qualified ? 'text-gray-800' : 'text-gray-500'}`}>
          {lender.name}
        </span>
        {!qualified && failReasons.length > 0 && (
          <span className="text-[10px] text-red-600 truncate max-w-[120px]">
            {failReasons[0].label.split(':')[0]}
          </span>
        )}
        <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          <div className="space-y-1 mb-2">
            {reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <span className={`mt-0.5 flex-shrink-0 ${r.pass ? 'text-green-500' : 'text-red-500'}`}>{r.pass ? '✓' : '✗'}</span>
                <span className={r.pass ? 'text-gray-600' : 'text-red-700 font-medium'}>{r.label}</span>
              </div>
            ))}
          </div>
          {lender.notes && (
            <p className="text-[10px] text-gray-400 leading-snug border-t border-gray-100 pt-1.5 mt-1.5">{lender.notes}</p>
          )}
          {lender.hardPullSoleProps && <p className="text-[10px] text-amber-600 mt-1">⚠ Hard credit pull on sole proprietors.</p>}
          {lender.noCreditPull && <p className="text-[10px] text-green-600 mt-1">✓ No credit pull required.</p>}
        </div>
      )}
    </div>
  );
}
