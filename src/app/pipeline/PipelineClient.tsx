'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

const AddPipelineLeadModal   = dynamic(() => import('@/components/AddPipelineLeadModal'),   { ssr: false });
const ManageStatusesModal    = dynamic(() => import('@/components/ManageStatusesModal'),     { ssr: false });

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  last_contact?: string | null;
  last_called_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  lead_status?: string | null;
  temperature?: string | null;
  assigned_to?: string | null;
  in_pipeline?: boolean;
  month_key?: string | null;
  stage?: string | null;
  value?: number | string | null;
  follow_up_at?: string | null;
  underwriting_data?: Record<string, unknown> | null;
}

interface PipelineClientProps {
  leads: Lead[];
  userId: string;
}

// ── Status helpers (dynamic, loaded from DB) ───────────────────────────────────
interface DBStatus { id: string; name: string; color: string; bg_color: string; sort_order: number; }

function getStatusStyleFrom(status: string | null | undefined, list: DBStatus[]) {
  if (!status) return { bg: '#f5f5f5', text: '#6b6b6b' };
  const found = list.find(s => s.name === status);
  return found ? { bg: found.bg_color, text: found.color } : { bg: '#f5f5f5', text: '#6b6b6b' };
}


// ── Relative time ─────────────────────────────────────────────────────────────
function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return '1d ago';
  if (days < 30)  return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function activityAt(lead: Lead): string | null {
  return lead.last_contact || lead.last_called_at || lead.updated_at || lead.created_at || null;
}

function absDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function formatAmount(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function lastOfferAmount(ud: Record<string, unknown> | null | undefined): number | null {
  if (!ud) return null;
  const adjusted = parseAmount(ud.adjustedAmount);
  if (adjusted) return adjusted;
  const offers = Array.isArray(ud.actualOffers) ? ud.actualOffers as Array<Record<string, unknown>> : [];
  const selected = offers.find(o => o?.id === ud.selectedOfferId);
  const selectedAmt = parseAmount(selected?.amount);
  if (selectedAmt) return selectedAmt;
  for (let i = offers.length - 1; i >= 0; i--) {
    const amt = parseAmount(offers[i]?.amount);
    if (amt) return amt;
  }
  return parseAmount(ud.approvedAmount);
}

function requestedAmount(lead: Lead): number | null {
  return parseAmount(lead.value) ?? parseAmount(lead.underwriting_data?.requestedAmount);
}

function amountForLead(lead: Lead): number | null {
  const status = (lead.lead_status || '').toLowerCase().replace(/\s+/g, '');
  const requested = requestedAmount(lead);
  const offer = lastOfferAmount(lead.underwriting_data);
  if (status === 'newlead' || status === 'new') return requested;
  if (status === 'submitted' || status === 'conditionallyapproved') return offer ?? requested;
  return offer ?? requested;
}

function parseLocalDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.slice(0, 10));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function followUpLabel(lead: Lead): string {
  const raw = lead.follow_up_at || (typeof lead.underwriting_data?.followUpDate === 'string'
    ? lead.underwriting_data.followUpDate
    : null);
  if (!raw) return '';
  const d = parseLocalDate(raw);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PIPELINE_COLS = 'grid-cols-[minmax(0,1fr)_160px_100px_100px_130px]';

// ── Filter state shape ────────────────────────────────────────────────────────
interface Filters {
  leadId:           string;
  /** Statuses to HIDE. Empty array = show all. */
  excludedStatuses: string[];
  assignedTo:       string;
  temperature:      string;  // 'Hot' | 'Warm' | 'Cold' | ''
  dateFrom:         string;  // ISO date string 'YYYY-MM-DD'
  dateTo:           string;
  phone:            string;
  email:            string;
  company:          string;
  industry:         string;
}

/** Truly empty — used by Clear All */
const EMPTY_FILTERS: Filters = {
  leadId: '', excludedStatuses: [], assignedTo: '', temperature: '',
  dateFrom: '', dateTo: '', phone: '', email: '', company: '', industry: '',
};

/** Smart default — last 30 days, all statuses except Prospect */
function buildDefaultFilters(): Filters {
  return {
    leadId: '', excludedStatuses: ['Prospect'], assignedTo: '', temperature: '',
    dateFrom: isoDaysAgo(30), dateTo: isoToday(), phone: '', email: '', company: '', industry: '',
  };
}

function countActive(f: Filters): number {
  let n = 0;
  if (f.leadId)              n++;
  if (f.excludedStatuses.length > 0) n++;
  if (f.assignedTo)          n++;
  if (f.temperature)         n++;
  if (f.dateFrom || f.dateTo) n++;
  if (f.phone)               n++;
  if (f.email)               n++;
  if (f.company)             n++;
  if (f.industry)            n++;
  return n;
}

// ── Quick date range helpers ──────────────────────────────────────────────────
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Section header inside drawer ──────────────────────────────────────────────
function FilterSection({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[#f0f0f0] flex items-center justify-center text-[#6b6b6b]">
          {icon}
        </span>
        <span className="text-[11px] font-bold text-[#6b6b6b] uppercase tracking-widest">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PipelineClient({ leads, userId }: PipelineClientProps) {
  const [search, setSearch]                 = useState('');
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showManageStatuses, setShowManageStatuses] = useState(false);
  const [showDrawer, setShowDrawer]         = useState(false);
  const [dbStatuses, setDbStatuses]         = useState<DBStatus[]>([]);

  // Load dynamic statuses
  const loadStatuses = useCallback(() => {
    fetch('/api/lead-statuses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.statuses) setDbStatuses(j.statuses); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);
  const [applied, setApplied]               = useState<Filters>(buildDefaultFilters);
  const [pending, setPending]               = useState<Filters>(buildDefaultFilters);

  // Derive unique assigned-to values from leads for the dropdown
  const agents = useMemo(() => {
    const set = new Set<string>();
    leads.forEach(l => { if (l.assigned_to) set.add(l.assigned_to); });
    return [...set].sort();
  }, [leads]);

  const openDrawer = useCallback(() => {
    setPending(applied);   // seed pending with currently applied
    setShowDrawer(true);
  }, [applied]);

  const applyFilters = useCallback(() => {
    setApplied(pending);
    setShowDrawer(false);
  }, [pending]);

  // Reset → back to smart default (last 30d, all except Prospect)
  const resetFilters = useCallback(() => {
    const def = buildDefaultFilters();
    // If statuses are loaded, restore "all except Prospect"
    const allExceptProspect = dbStatuses.map(s => s.name).includes('Prospect')
      ? ['Prospect']
      : def.excludedStatuses;
    setPending({ ...def, excludedStatuses: allExceptProspect });
  }, [dbStatuses]);

  const clearAll = useCallback(() => {
    setApplied(EMPTY_FILTERS);
    setPending(EMPTY_FILTERS);
    setShowDrawer(false);
  }, []);

  const setQuickDate = useCallback((from: string, to: string) => {
    setPending(p => ({ ...p, dateFrom: from, dateTo: to }));
  }, []);

  // ── Sort + filter (most-recent first) ─────────────────────────────────────
  const sorted = useMemo(() => {
    return [...leads].sort((a, b) => {
      const tA = new Date(activityAt(a) || 0).getTime();
      const tB = new Date(activityAt(b) || 0).getTime();
      return tB - tA;
    });
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Search looks at every pipeline lead — filters do not narrow it
    if (q) {
      return sorted.filter(lead =>
        lead.name?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.phone?.toLowerCase().includes(q) ||
        lead.company?.toLowerCase().includes(q) ||
        lead.id.toLowerCase().includes(q)
      );
    }
    const f = applied;
    return sorted.filter(lead => {
      // Lead ID
      if (f.leadId && !lead.id.toLowerCase().includes(f.leadId.toLowerCase())) return false;
      // Status (multi-exclude)
      if (f.excludedStatuses.length > 0) {
        const s = lead.lead_status || '';
        if (f.excludedStatuses.includes(s)) return false;
      }
      // Assigned to
      if (f.assignedTo && lead.assigned_to !== f.assignedTo) return false;
      // Temperature
      if (f.temperature && lead.temperature !== f.temperature) return false;
      const activityDate = activityAt(lead);
      if (f.dateFrom && activityDate) {
        if (new Date(activityDate) < new Date(f.dateFrom + 'T00:00:00')) return false;
      }
      if (f.dateTo && activityDate) {
        if (new Date(activityDate) > new Date(f.dateTo + 'T23:59:59')) return false;
      }
      // Phone
      if (f.phone && !lead.phone?.toLowerCase().includes(f.phone.toLowerCase())) return false;
      // Email
      if (f.email && !lead.email?.toLowerCase().includes(f.email.toLowerCase())) return false;
      // Company
      if (f.company && !lead.company?.toLowerCase().includes(f.company.toLowerCase())) return false;
      // Industry (stored in notes or other fields — skip if no value)
      // (industry filter requires underwriting_data, which isn't in list — we'll skip unless field exists)
      return true;
    });
  }, [sorted, search, applied]);

  const activeCount  = countActive(applied);

  // Count how many filters differ from the smart default so we only badge
  // when the user has intentionally changed something.
  const defaultFilters = buildDefaultFilters();
  const nonDefaultCount = useMemo(() => {
    let n = 0;
    if (applied.leadId !== defaultFilters.leadId) n++;
    if (applied.assignedTo !== defaultFilters.assignedTo) n++;
    if (applied.temperature !== defaultFilters.temperature) n++;
    if (applied.phone !== defaultFilters.phone) n++;
    if (applied.email !== defaultFilters.email) n++;
    if (applied.company !== defaultFilters.company) n++;
    if (applied.industry !== defaultFilters.industry) n++;
    // Date range: only flag if different from the default 30-day window
    if (applied.dateFrom !== defaultFilters.dateFrom || applied.dateTo !== defaultFilters.dateTo) n++;
    // Statuses: flag if the excluded set differs from default (['Prospect'])
    const defExcl = ['Prospect'];
    const appliedExcl = [...applied.excludedStatuses].sort();
    const defaultExcl = [...defExcl].sort();
    if (JSON.stringify(appliedExcl) !== JSON.stringify(defaultExcl)) n++;
    return n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);
  const statusNames  = useMemo(() => dbStatuses.map(s => s.name), [dbStatuses]);
  const [leadOverlayId, setLeadOverlayId] = useState<string | null>(null);
  const goTo = (id: string) => setLeadOverlayId(id);

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">Pipeline</h1>
          <span className="text-xs font-semibold bg-[#f5f5f5] text-[#6b6b6b] px-2.5 py-1 rounded-full">
            {filtered.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search leads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-2 py-2 text-sm bg-transparent text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none w-56"
            />
          </div>

          {/* Manage Statuses — tiny kanban icon, now lives next to the Status dropdown in the workspace */}

          {/* Filters button — plain text, badge only when non-default */}
          <button
            onClick={openDrawer}
            className="flex items-center gap-1.5 text-sm text-[#1a1a1a] hover:text-[#555] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters
            {nonDefaultCount > 0 && (
              <span className="w-[18px] h-[18px] rounded-full border border-[#1a1a1a] text-[#1a1a1a] text-[10px] font-bold flex items-center justify-center leading-none">
                {nonDefaultCount}
              </span>
            )}
          </button>

          {/* Add Lead — plain text */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-sm text-[#1a1a1a] hover:text-[#555] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Lead
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-lg overflow-hidden">
        {/* Table header */}
        <div className={`grid ${PIPELINE_COLS} gap-x-3 border-b border-[#e5e5e5] bg-[#fafafa] px-3 py-2`}>
          <div className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-wider">Lead</div>
          <div className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-wider">Status</div>
          <div className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-wider text-right px-1">Amount</div>
          <div className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-wider px-1">Follow-up</div>
          <div className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-wider flex items-center justify-end gap-1">
            Activity
            <svg className="w-3 h-3 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-[#9b9b9b]">
            <svg className="w-10 h-10 mx-auto mb-3 text-[#d4d4d4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium text-[#6b6b6b]">
              {activeCount > 0 || search ? 'No leads match your filters' : 'No pipeline leads yet'}
            </p>
            <p className="text-xs mt-1">
              {activeCount > 0 || search ? (
                <button onClick={clearAll} className="text-[#1a1a1a] underline underline-offset-2">Clear all filters</button>
              ) : 'Move leads from the Leads page to get started'}
            </p>
          </div>
        ) : (
          filtered.map((lead, idx) => {
            const status      = lead.lead_status || '';
            const statusStyle = getStatusStyleFrom(status, dbStatuses);
            const activityDate = activityAt(lead);
            const amount = amountForLead(lead);
            const followUp = followUpLabel(lead);
            return (
              <div
                key={lead.id}
                onClick={() => goTo(lead.id)}
                className={`grid ${PIPELINE_COLS} gap-x-3 px-3 py-1.5 cursor-pointer hover:bg-[#fafafa] transition-colors border-b border-[#f5f5f5] ${
                  idx === filtered.length - 1 ? 'border-b-0' : ''
                }`}
              >
                {/* Lead info — company bold + name inline */}
                <div className="flex flex-col justify-center min-w-0 pr-3">
                  <span className="text-xs font-semibold text-[#1a1a1a] truncate leading-tight">
                    {lead.company || lead.name}
                  </span>
                  {lead.company && (
                    <span className="text-[11px] text-[#9b9b9b] truncate leading-tight">{lead.name}</span>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center pr-3">
                  {status ? (
                    <span
                      className="w-full px-2 py-0.5 rounded text-[11px] font-medium text-center truncate"
                      style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                      {status}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#c4c4c4]">—</span>
                  )}
                </div>

                {/* Amount */}
                <div className="flex items-center justify-end px-1">
                  {amount != null && (
                    <span className="text-[11px] font-medium text-[#1a1a1a] tabular-nums">{formatAmount(amount)}</span>
                  )}
                </div>

                {/* Follow-up */}
                <div className="flex items-center px-1">
                  {followUp && (
                    <span className="text-[11px] text-[#1a1a1a]">{followUp}</span>
                  )}
                </div>

                {/* Activity */}
                <div className="flex flex-col justify-center items-end text-right">
                  <span className="text-[11px] font-medium text-[#1a1a1a] leading-tight">{relativeTime(activityDate)}</span>
                  <span className="text-[10px] text-[#9b9b9b] leading-tight">{absDate(activityDate)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── FILTER DRAWER ─────────────────────────────────────────────────── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowDrawer(false)} />

          {/* Drawer panel (slides in from right) */}
          <div className="relative ml-auto w-full max-w-sm bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Drawer header */}
            <div className="px-5 pt-5 pb-4 border-b border-[#f0f0f0] flex items-start justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#f0f0f0] flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1a1a1a]">Filter Leads</p>
                  <p className="text-xs text-[#9b9b9b]">
                    {countActive(pending) === 0 ? 'No filters applied' : `${countActive(pending)} filter${countActive(pending) > 1 ? 's' : ''} selected`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDrawer(false)} className="p-1 text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-1">

              {/* ── DATE RANGE (top) ── */}
              <FilterSection
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                title="Date Range"
              >
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1">From</p>
                    <input
                      type="date"
                      value={pending.dateFrom}
                      onChange={e => setPending(p => ({ ...p, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1">To</p>
                    <input
                      type="date"
                      value={pending.dateTo}
                      onChange={e => setPending(p => ({ ...p, dateTo: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                    />
                  </div>
                </div>
                {/* Quick shortcuts */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { label: 'Today',    from: isoToday(),      to: isoToday() },
                    { label: 'Last 7d',  from: isoDaysAgo(7),   to: isoToday() },
                    { label: 'Last 30d', from: isoDaysAgo(30),  to: isoToday() },
                    { label: 'Last 90d', from: isoDaysAgo(90),  to: isoToday() },
                  ].map(({ label, from, to }) => {
                    const active = pending.dateFrom === from && pending.dateTo === to;
                    return (
                      <button
                        key={label}
                        onClick={() => setQuickDate(active ? '' : from, active ? '' : to)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                            : 'border-[#e5e5e5] text-[#6b6b6b] hover:bg-[#f0f0f0]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>

              {/* ── LEAD ID ── */}
              <FilterSection
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>}
                title="Lead ID"
              >
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  <input
                    type="text"
                    value={pending.leadId}
                    onChange={e => setPending(p => ({ ...p, leadId: e.target.value }))}
                    placeholder="Search by lead ID..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                  />
                </div>
              </FilterSection>

              {/* ── STATUS (multi-select checkboxes) ── */}
              <FilterSection
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
                title="Status"
              >
                {/* Select All / None */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[#9b9b9b]">
                    {statusNames.length - pending.excludedStatuses.length} of {statusNames.length} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPending(p => ({ ...p, excludedStatuses: [] }))}
                      className="text-[11px] text-[#1a1a1a] font-medium hover:underline"
                    >
                      All
                    </button>
                    <span className="text-[#d4d4d4]">·</span>
                    <button
                      type="button"
                      onClick={() => setPending(p => ({ ...p, excludedStatuses: [...statusNames] }))}
                      className="text-[11px] text-[#9b9b9b] hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Checkbox list */}
                <div className="max-h-56 overflow-y-auto rounded-lg border border-[#e5e5e5] divide-y divide-[#f5f5f5]">
                  {statusNames.length === 0 && (
                    <p className="text-xs text-[#9b9b9b] px-3 py-4 text-center">Loading statuses…</p>
                  )}
                  {statusNames.map(name => {
                    const isChecked = !pending.excludedStatuses.includes(name);
                    const col = getStatusStyleFrom(name, dbStatuses);
                    return (
                      <label
                        key={name}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#fafafa] cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const checked = e.target.checked;
                            setPending(p => ({
                              ...p,
                              excludedStatuses: checked
                                ? p.excludedStatuses.filter(s => s !== name)
                                : [...p.excludedStatuses, name],
                            }));
                          }}
                          className="w-3.5 h-3.5 rounded border-[#d4d4d4] accent-[#1a1a1a] cursor-pointer"
                        />
                        <span
                          className="px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
                          style={{ background: col.bg, color: col.text }}
                        >
                          {name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </FilterSection>

              {/* ── ASSIGNMENT ── */}
              <FilterSection
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                title="Assignment"
              >
                {/* Assigned Agent */}
                <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1.5">Assigned Agent</p>
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <select
                    value={pending.assignedTo}
                    onChange={e => setPending(p => ({ ...p, assignedTo: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white appearance-none"
                  >
                    <option value="">All agents</option>
                    {agents.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Lead Type (Temperature) */}
                <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1.5">Lead Type</p>
                <div className="flex gap-2">
                  {(['Hot', 'Warm', 'Cold'] as const).map(t => {
                    const active = pending.temperature === t;
                    const dotCls = t === 'Hot' ? 'bg-red-500' : t === 'Warm' ? 'bg-amber-400' : 'bg-blue-400';
                    const activeCls = t === 'Hot'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : t === 'Warm'
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-blue-50 border-blue-300 text-blue-700';
                    return (
                      <button
                        key={t}
                        onClick={() => setPending(p => ({ ...p, temperature: p.temperature === t ? '' : t }))}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          active ? activeCls : 'border-[#e5e5e5] text-[#6b6b6b] bg-[#fafafa] hover:bg-[#f0f0f0]'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${dotCls}`} />
                        {t}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>

              {/* ── CONTACT INFO ── */}
              <FilterSection
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
                title="Contact Info"
              >
                {/* Phone */}
                <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1.5">Phone Number</p>
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <input
                    type="tel"
                    value={pending.phone}
                    onChange={e => setPending(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Filter by phone..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                  />
                </div>

                {/* Email */}
                <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1.5">Email Address</p>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    type="email"
                    value={pending.email}
                    onChange={e => setPending(p => ({ ...p, email: e.target.value }))}
                    placeholder="Filter by email..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                  />
                </div>
              </FilterSection>

              {/* ── BUSINESS INFO ── */}
              <FilterSection
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                title="Business Info"
              >
                {/* Company */}
                <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1.5">Company Name</p>
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <input
                    type="text"
                    value={pending.company}
                    onChange={e => setPending(p => ({ ...p, company: e.target.value }))}
                    placeholder="Filter by company..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                  />
                </div>

                {/* Industry */}
                <p className="text-[11px] text-[#9b9b9b] uppercase font-semibold tracking-wider mb-1.5">Industry Type</p>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <input
                    type="text"
                    value={pending.industry}
                    onChange={e => setPending(p => ({ ...p, industry: e.target.value }))}
                    placeholder="Filter by industry..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
                  />
                </div>
              </FilterSection>

            </div>

            {/* Drawer footer */}
            <div className="flex-shrink-0 px-5 pb-6 pt-4 border-t border-[#f0f0f0]">
              <button
                onClick={applyFilters}
                className="w-full py-3 bg-[#1a1a1a] text-white text-sm font-semibold rounded-xl hover:bg-[#333] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Apply Filters
              </button>
              <button
                onClick={resetFilters}
                className="w-full py-2.5 mt-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] flex items-center justify-center gap-1.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset All Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD PIPELINE LEAD MODAL ──────────────────────────────────────── */}
      {showAddModal && <AddPipelineLeadModal onClose={() => setShowAddModal(false)} />}

      {/* ── MANAGE STATUSES MODAL ────────────────────────────────────────── */}
      {showManageStatuses && (
        <ManageStatusesModal
          onClose={() => setShowManageStatuses(false)}
          onSaved={() => { loadStatuses(); }}
        />
      )}

      {/* ── LEAD OVERLAY ─────────────────────────────────────────────────── */}
      {leadOverlayId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setLeadOverlayId(null)}
          />
          {/* Panel */}
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] flex-shrink-0">
              <span className="text-xs text-[#6b6b6b] font-medium">Lead Info</span>
              <div className="flex items-center gap-3">
                <a
                  href={`/pipeline/${leadOverlayId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b6b6b] hover:text-[#1a1a1a] text-xs flex items-center gap-1 transition-colors"
                  title="Open in full page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Full page
                </a>
                <button
                  onClick={() => setLeadOverlayId(null)}
                  className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* iframe */}
            <iframe
            src={`/pipeline/${leadOverlayId}?modal=1`}
            className="flex-1 w-full bg-white border-0"
            title="Lead workspace"
            />
          </div>
        </>
      )}
    </div>
  );
}
