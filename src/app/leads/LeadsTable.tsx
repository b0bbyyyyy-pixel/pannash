'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BulkDeleteButton from './BulkDeleteButton';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string | null;
  last_contact?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  email_status?: string;
  lead_lists?: { name: string };
}

interface LeadsTableProps {
  leads: Lead[];
  deleteLead: (formData: FormData) => Promise<void>;
  deleteMultipleLeads: (formData: FormData) => Promise<void>;
  searchQuery?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function absDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Parse pipe-separated notes into { cleanNotes, extraPhone, extraDate } */
function parseNotes(raw: string | null | undefined): { clean: string; extraPhone?: string; extraDate?: string } {
  if (!raw) return { clean: '' };
  const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
  const phoneRe = /^[\d\s()\-+.]{7,}$/;
  const dateRe  = /^\d{4}-\d{2}-\d{2}/;
  let extraPhone: string | undefined;
  let extraDate: string | undefined;
  const rest: string[] = [];
  for (const p of parts) {
    if (!extraPhone && phoneRe.test(p.replace(/\D/g, '').length >= 7 ? p : '')) {
      extraPhone = p;
    } else if (!extraDate && dateRe.test(p)) {
      extraDate = p.slice(0, 10);
    } else {
      rest.push(p);
    }
  }
  return { clean: rest.join(' · '), extraPhone, extraDate };
}

export default function LeadsTable({ leads, deleteLead, deleteMultipleLeads, searchQuery = '' }: LeadsTableProps) {
  const router = useRouter();
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [leadOverlayId, setLeadOverlayId] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lead: Lead } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Pipeline move state
  const [pipelineMoving, setPipelineMoving] = useState<string | null>(null);

  // Dashboard promote modal (kept for backward compat)
  const [promoteConfirm, setPromoteConfirm] = useState<Lead | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteMonth, setPromoteMonth] = useState('');
  const [dashboardTabs, setDashboardTabs] = useState<{ month_key: string; custom_name: string }[]>([]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    if (contextMenu) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, []);

  // Close overlay on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLeadOverlayId(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = leads.filter(lead => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      lead.name?.toLowerCase().includes(q) ||
      lead.email?.toLowerCase().includes(q) ||
      lead.phone?.toLowerCase().includes(q) ||
      lead.company?.toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && selectedLeads.length === filtered.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < filtered.length;

  const toggleSelect = (id: string) =>
    setSelectedLeads(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll = () =>
    setSelectedLeads(allSelected ? [] : filtered.map(l => l.id));

  const handleDelete = useCallback(async (lead: Lead) => {
    setContextMenu(null);
    if (!confirm(`Delete "${lead.name}"?`)) return;
    const fd = new FormData();
    fd.append('leadId', lead.id);
    await deleteLead(fd);
    router.refresh();
  }, [deleteLead, router]);

  const moveToPipeline = useCallback(async (lead: Lead) => {
    setContextMenu(null);
    setPipelineMoving(lead.id);
    try {
      const res = await fetch('/api/leads/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (res.ok) {
        setLeadOverlayId(lead.id);
      } else {
        const d = await res.json();
        alert(`Error: ${d.error}`);
      }
    } finally {
      setPipelineMoving(null);
    }
  }, []);

  const handlePromote = useCallback(async () => {
    if (!promoteConfirm) return;
    setPromoting(promoteConfirm.id);
    try {
      const res = await fetch('/api/leads/promote-to-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: promoteConfirm.id, monthKey: promoteMonth }),
      });
      if (res.ok) {
        setPromoteConfirm(null);
        router.refresh();
        router.push('/dashboard');
      } else {
        const d = await res.json();
        alert(`Error: ${d.error}`);
      }
    } finally {
      setPromoting(null);
    }
  }, [promoteConfirm, promoteMonth, router]);

  if (!leads || leads.length === 0) {
    return (
      <div className="py-20 text-center text-[#9b9b9b]">
        <p className="text-sm font-medium">No leads yet</p>
        <p className="text-xs mt-1">Upload a CSV file or add leads manually</p>
      </div>
    );
  }

  if (filtered.length === 0 && searchQuery) {
    return (
      <div className="py-20 text-center text-[#9b9b9b]">
        <p className="text-sm font-medium">No matches found</p>
        <p className="text-xs mt-1">Try a different search term</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#e5e5e5] overflow-hidden">

        {/* Header */}
        <div className="grid grid-cols-[32px_1fr_190px_130px_72px] gap-0 px-3 py-2 border-b border-[#f0f0f0] bg-[#fafafa]">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[#1a1a1a]"
            />
          </div>
          {['LEAD', 'CONTACT', 'ACTIVITY', ''].map(h => (
            <div key={h} className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-widest flex items-center">
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {filtered.map((lead, idx) => {
          const activityDate = lead.last_contact || lead.updated_at || lead.created_at;
          const { clean: cleanNote, extraPhone } = parseNotes(lead.notes);
          const phone = lead.phone || extraPhone || '';

          return (
            <div
              key={lead.id}
              onClick={() => setLeadOverlayId(lead.id)}
              onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, lead }); }}
              className={`grid grid-cols-[32px_1fr_190px_130px_72px] gap-0 px-3 py-1.5 cursor-pointer hover:bg-[#fafafa] transition-colors border-b border-[#f5f5f5] ${
                idx === filtered.length - 1 ? 'border-b-0' : ''
              } ${selectedLeads.includes(lead.id) ? 'bg-blue-50/40' : ''}`}
            >
              {/* Checkbox */}
              <div className="flex items-center" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedLeads.includes(lead.id)}
                  onChange={() => toggleSelect(lead.id)}
                  className="w-3.5 h-3.5 rounded cursor-pointer accent-[#1a1a1a]"
                />
              </div>

              {/* LEAD: company bold + name */}
              <div className="flex flex-col justify-center min-w-0 pr-3">
                <span className="text-xs font-semibold text-[#1a1a1a] truncate leading-tight">
                  {lead.company || lead.name}
                </span>
                {lead.company && (
                  <span className="text-[11px] text-[#9b9b9b] truncate leading-tight">{lead.name}</span>
                )}
                {cleanNote && (
                  <span className="text-[10px] text-[#b0b0b0] truncate leading-tight mt-0.5">{cleanNote}</span>
                )}
              </div>

              {/* CONTACT: email + phone */}
              <div className="flex flex-col justify-center min-w-0 pr-3">
                <span className="text-[11px] text-[#6b6b6b] truncate leading-tight">{lead.email || '—'}</span>
                <span className="text-[11px] text-[#9b9b9b] leading-tight">{phone || ''}</span>
              </div>

              {/* ACTIVITY */}
              <div className="flex flex-col justify-center">
                <span className="text-[11px] font-medium text-[#1a1a1a] leading-tight">{relativeTime(activityDate)}</span>
                <span className="text-[10px] text-[#9b9b9b] leading-tight">{absDate(activityDate)}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setLeadOverlayId(lead.id)}
                  className="p-1 rounded hover:bg-[#f0f0f0] text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors"
                  title="View"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                <button
                  onClick={() => moveToPipeline(lead)}
                  disabled={pipelineMoving === lead.id}
                  className="p-1 rounded hover:bg-[#f0f0f0] text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors"
                  title="Move to Pipeline"
                >
                  {pipelineMoving === lead.id
                    ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                  }
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          className="bg-white border border-[#e5e5e5] rounded-xl shadow-2xl py-1 min-w-[200px]"
        >
          <div className="px-4 py-2 border-b border-[#f0f0f0]">
            <p className="text-xs font-semibold text-[#1a1a1a] truncate">{contextMenu.lead.name}</p>
            <p className="text-xs text-[#9b9b9b] truncate">{contextMenu.lead.company || contextMenu.lead.email}</p>
          </div>
          <button
            onClick={() => { setLeadOverlayId(contextMenu.lead.id); setContextMenu(null); }}
            className="w-full text-left px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#fafafa] flex items-center gap-2.5"
          >
            <svg className="w-4 h-4 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View Lead
          </button>
          <button
            onClick={() => moveToPipeline(contextMenu.lead)}
            className="w-full text-left px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#fafafa] flex items-center gap-2.5"
          >
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Move to Pipeline
          </button>
          <button
            onClick={async () => {
              setPromoteConfirm(contextMenu.lead);
              setContextMenu(null);
              try {
                const res = await fetch('/api/dashboard/tabs');
                if (res.ok) {
                  const data = await res.json();
                  setDashboardTabs(data.tabs || []);
                  if (data.tabs?.length > 0) setPromoteMonth(data.tabs[0].month_key);
                }
              } catch {}
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#fafafa] flex items-center gap-2.5"
          >
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Move to Dashboard
          </button>
          <div className="border-t border-[#f0f0f0] mt-1" />
          <button
            onClick={() => handleDelete(contextMenu.lead)}
            className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Lead
          </button>
        </div>
      )}

      {/* ── Promote to Dashboard modal ────────────────────────────────────── */}
      {promoteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-[#1a1a1a] mb-1">Move to Dashboard</h3>
            <p className="text-sm text-[#6b6b6b] mb-4">
              <span className="font-medium text-[#1a1a1a]">{promoteConfirm.name}</span>
              {promoteConfirm.company ? ` · ${promoteConfirm.company}` : ''}
              {' '}will be added to your Dashboard pipeline.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#9b9b9b] uppercase mb-1">Dashboard Tab</label>
              {dashboardTabs.length > 0 ? (
                <select
                  value={promoteMonth}
                  onChange={e => setPromoteMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a1a] bg-white"
                >
                  {dashboardTabs.map(tab => (
                    <option key={tab.month_key} value={tab.month_key}>{tab.custom_name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-[#9b9b9b] italic">No dashboard tabs found.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPromoteConfirm(null)} className="flex-1 px-4 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#fafafa]">Cancel</button>
              <button onClick={handlePromote} disabled={!!promoting} className="flex-1 px-4 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-semibold hover:bg-[#333] disabled:opacity-50">
                {promoting ? 'Moving…' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk select bar ───────────────────────────────────────────────── */}
      <BulkDeleteButton
        selectedLeads={selectedLeads}
        onClearSelection={() => setSelectedLeads([])}
        deleteMultipleLeads={deleteMultipleLeads}
      />

      {/* ── Lead overlay ─────────────────────────────────────────────────── */}
      {leadOverlayId && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[80]" onClick={() => setLeadOverlayId(null)} />
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
          >
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
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <iframe
              src={`/pipeline/${leadOverlayId}?modal=1`}
              className="flex-1 w-full bg-white border-0"
              title="Lead workspace"
            />
          </div>
        </>
      )}
    </>
  );
}
