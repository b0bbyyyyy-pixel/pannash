'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const UnderwritingSuite    = dynamic(() => import('@/components/UnderwritingSuite'), { ssr: false });
const ScheduleEmailModal   = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });
const DocumentsModal       = dynamic(() => import('@/components/DocumentsModal'), { ssr: false });
const SendToLenderModal    = dynamic(() => import('@/components/SendToLenderModal'), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  last_contact?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  lead_status?: string | null;
  temperature?: string | null;
  assigned_to?: string | null;
  in_pipeline?: boolean;
  month_key?: string | null;
  stage?: string | null;
  value?: number | null;
  lead_source?: string | null;
  underwriting_data?: Record<string, unknown> | null;
}

interface LeadWorkspaceClientProps {
  lead: Lead;
  allLeadIds: string[];
  userId: string;
  userName: string;
}

// ── Status helpers (dynamic) ───────────────────────────────────────────────────
interface DBStatus { id: string; name: string; color: string; bg_color: string; }

function getStatusStyle(status: string | null | undefined, list?: DBStatus[]) {
  if (!status) return { bg: '#f5f5f5', text: '#6b6b6b' };
  if (list) {
    const found = list.find(s => s.name === status);
    if (found) return { bg: found.bg_color, text: found.color };
  }
  return { bg: '#f5f5f5', text: '#6b6b6b' };
}

// ── Inline editable field ──────────────────────────────────────────────────────
function Field({
  label,
  value,
  onSave,
  masked = false,
  readOnly = false,
  type = 'text',
  valueStyle,
}: {
  label: string;
  value: string | null | undefined;
  onSave?: (val: string) => Promise<void>;
  masked?: boolean;
  readOnly?: boolean;
  type?: string;
  valueStyle?: React.CSSProperties;
}) {
  const [editing, setEditing]   = useState(false);
  const [editVal, setEditVal]   = useState(value || '');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving]     = useState(false);

  const display = masked && !revealed
    ? (value ? '•••-••-••••' : '—')
    : (value || '—');

  const handleSave = async () => {
    if (!onSave) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(editVal); } finally { setSaving(false); setEditing(false); }
  };

  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5] last:border-b-0">
      <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">{label}</span>
      {editing ? (
        <div className="flex-1 flex gap-1">
          <input
            type={type}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            className="flex-1 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
          />
          {saving && <span className="text-xs text-[#9b9b9b] pt-1">…</span>}
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1 group">
          <span
            className={`text-sm text-[#1a1a1a] flex-1 ${!readOnly ? 'cursor-pointer hover:underline underline-offset-2 decoration-dotted' : ''}`}
            style={valueStyle}
            onClick={() => { if (!readOnly && !masked) { setEditVal(value || ''); setEditing(true); } }}
          >
            {masked && !revealed ? <span className="text-[#9b9b9b]">{display}</span> : display}
          </span>
          {masked && value && (
            <button
              onClick={() => setRevealed(r => !r)}
              className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a] px-1"
            >
              {revealed ? 'hide' : 'show'}
            </button>
          )}
          {!readOnly && !masked && (
            <button
              onClick={() => { setEditVal(value || ''); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#9b9b9b] hover:text-[#1a1a1a]"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Time-in-business field (Years + Months) ────────────────────────────────────
function TIBField({ valueMonths, onSave }: { valueMonths: number | null | undefined; onSave: (months: number) => void }) {
  const total = Number(valueMonths) || 0;
  const [years,  setYears]  = useState(Math.floor(total / 12));
  const [months, setMonths] = useState(total % 12);
  const [editing, setEditing] = useState(false);

  const display = total === 0 ? '—' : `${Math.floor(total / 12)}y ${total % 12}m`;

  const save = () => {
    onSave(years * 12 + months);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
      <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Time in Biz</span>
      {editing ? (
        <div className="flex-1 flex items-center gap-1">
          <input type="number" min={0} value={years} onChange={e => setYears(Number(e.target.value) || 0)}
            className="w-14 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]" placeholder="Yr" />
          <span className="text-xs text-[#9b9b9b]">yr</span>
          <input type="number" min={0} max={11} value={months} onChange={e => setMonths(Number(e.target.value) || 0)}
            className="w-14 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]" placeholder="Mo" />
          <span className="text-xs text-[#9b9b9b]">mo</span>
          <button onClick={save} className="text-xs text-[#1a1a1a] font-medium hover:underline ml-1">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-[#9b9b9b]">✕</button>
        </div>
      ) : (
        <span onClick={() => { setYears(Math.floor(total/12)); setMonths(total%12); setEditing(true); }}
          className="text-sm text-[#1a1a1a] cursor-pointer hover:underline underline-offset-2 decoration-dotted">{display}</span>
      )}
    </div>
  );
}

// ── Checkbox field ─────────────────────────────────────────────────────────────
function CheckboxField({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#f5f5f5]">
      <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0">{label}</span>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${checked ? 'bg-[#1a1a1a]' : 'bg-[#d4d4d4]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-[#6b6b6b]">{checked ? 'Yes' : 'No'}</span>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-1.5 w-full text-left mb-2"
        onClick={() => collapsible && setOpen(o => !o)}
      >
        <span className="text-[11px] font-semibold text-[#9b9b9b] uppercase tracking-wider">{title}</span>
        {collapsible && (
          <svg className={`w-3 h-3 text-[#9b9b9b] transition-transform ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LeadWorkspaceClient({
  lead: initialLead,
  allLeadIds,
  userId,
  userName,
}: LeadWorkspaceClientProps) {
  const router = useRouter();
  const [lead, setLead]               = useState(initialLead);
  const [centerTab, setCenterTab]     = useState<'submissions' | 'notes' | 'updates'>('submissions');
  const [notes, setNotes]             = useState(initialLead.notes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEmailModal, setShowEmailModal]   = useState(false);
  const [showDocsModal, setShowDocsModal]     = useState(false);
  const [showSendModal, setShowSendModal]     = useState(false);
  const [dbStatuses, setDbStatuses]           = useState<DBStatus[]>([]);

  // Load dynamic statuses
  useEffect(() => {
    fetch('/api/lead-statuses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.statuses) setDbStatuses(j.statuses); })
      .catch(() => {});
  }, []);

  // Prev/Next navigation
  const currentIdx = allLeadIds.indexOf(lead.id);
  const prevId = currentIdx > 0 ? allLeadIds[currentIdx - 1] : null;
  const nextId = currentIdx < allLeadIds.length - 1 ? allLeadIds[currentIdx + 1] : null;

  const status = lead.lead_status || lead.stage || 'New Lead';
  const statusStyle = getStatusStyle(status, dbStatuses);

  // Fields that can be updated directly via update-crm
  const DIRECT_FIELDS = new Set([
    'company', 'name', 'email', 'phone', 'notes', 'stage',
    'value', 'lead_source', 'last_contact', 'offers',
  ]);

  // ── Field save helper ────────────────────────────────────────────────────────
  const saveField = useCallback(async (field: string, value: string) => {
    if (DIRECT_FIELDS.has(field)) {
      // Save directly to lead column via update-crm
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field, value }),
      });
      if (res.ok) {
        setLead(prev => ({ ...prev, [field]: value }));
      }
    } else {
      // Save to underwriting_data JSONB
      const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
      const updatedUd = { ...currentUd, [field]: value };
      const res = await fetch('/api/leads/underwriting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, underwritingData: updatedUd }),
      });
      if (res.ok) {
        setLead(prev => ({ ...prev, underwriting_data: updatedUd }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.underwriting_data]);

  // ── Apply parsed application fields ─────────────────────────────────────────
  const applyParsedApp = async (
    fields: Record<string, string>,
    selected: Set<string>
  ) => {
    const DIRECT = new Set(['company', 'name', 'email', 'phone', 'notes', 'stage', 'value']);
    const directUpdates: Record<string, string> = {};
    const udUpdates: Record<string, string>     = {};

    for (const [k, v] of Object.entries(fields)) {
      if (!selected.has(k) || !v) continue;
      if (DIRECT.has(k)) directUpdates[k] = v;
      else                udUpdates[k]     = v;
    }

    // Direct fields — one PATCH per field
    for (const [field, value] of Object.entries(directUpdates)) {
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field, value }),
        credentials: 'include',
      });
      setLead(prev => ({ ...prev, [field]: value }));
    }

    // Underwriting fields — merge into existing ud
    if (Object.keys(udUpdates).length) {
      const currentUd = (lead.underwriting_data || {}) as Record<string, unknown>;
      const mergedUd  = { ...currentUd, ...udUpdates };
      await fetch('/api/leads/underwriting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, underwritingData: mergedUd }),
        credentials: 'include',
      });
      setLead(prev => ({ ...prev, underwriting_data: mergedUd }));
    }
  };

  // ── Notes save ───────────────────────────────────────────────────────────────
  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field: 'notes', value: notes }),
      });
      setLead(prev => ({ ...prev, notes }));
    } finally {
      setNotesSaving(false);
    }
  };

  // ── Underwriting save ────────────────────────────────────────────────────────
  const handleUnderwritingSave = async (data: Record<string, unknown>) => {
    await fetch('/api/leads/underwriting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, underwritingData: data }),
    });
    setLead(prev => ({ ...prev, underwriting_data: data }));
  };

  // ── Delete lead ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.append('leadId', lead.id);
      await fetch('/api/leads/delete', { method: 'POST', body: fd });
      router.push('/pipeline');
    } finally {
      setDeleting(false);
    }
  };

  // ── Status / temperature / assigned save ────────────────────────────────────
  const saveLeadStatus = async (val: string) => {
    await fetch('/api/leads/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, field: 'lead_status', value: val }),
    });
    setLead(prev => ({ ...prev, lead_status: val }));
  };

  const saveTemperature = async (val: string) => {
    await fetch('/api/leads/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, field: 'temperature', value: val }),
    });
    setLead(prev => ({ ...prev, temperature: val }));
  };

  const saveAssignedTo = async (val: string) => {
    await fetch('/api/leads/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, field: 'assigned_to', value: val }),
    });
    setLead(prev => ({ ...prev, assigned_to: val }));
  };

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── Derive display values from underwriting_data JSONB ──────────────────────
  const ud = (lead.underwriting_data || {}) as Record<string, unknown>;
  const creditScore = (ud.creditScore != null ? Number(ud.creditScore) : null);
  /** Safely extract a string from unknown JSON value */
  const str = (v: unknown): string | null => (v != null ? String(v) : null);

  const creditScoreColor =
    !creditScore ? '#9b9b9b' :
    creditScore >= 750 ? '#15803d' :
    creditScore >= 650 ? '#a16207' : '#b91c1c';

  const scrollToUW = () => {
    document.getElementById('underwriting-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col">
      {/* ── TOP HEADER BAR ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e5e5e5] px-6 py-3 flex items-center justify-between flex-shrink-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-4">
          <a
            href="/pipeline"
            className="flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Pipeline
          </a>
          <span className="text-[#e5e5e5]">|</span>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#1a1a1a]">{lead.company || lead.name}</h2>
            <span className="text-xs text-[#9b9b9b] font-mono">#{lead.id.slice(0, 8)}</span>
          </div>
          <span
            className="px-2.5 py-0.5 rounded text-xs font-medium"
            style={{ background: statusStyle.bg, color: statusStyle.text }}
          >
            {status}
          </span>
        </div>

        {/* Right: actions + prev/next */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/pipeline/${lead.id}?edit=true`)}
            className="p-2 rounded-md border border-[#e5e5e5] hover:bg-[#f5f5f5] text-[#6b6b6b] transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 rounded-md border border-[#e5e5e5] hover:bg-red-50 text-[#9b9b9b] hover:text-red-600 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <div className="flex gap-1 ml-2">
            <button
              onClick={() => prevId && router.push(`/pipeline/${prevId}`)}
              disabled={!prevId}
              className="px-2 py-1.5 text-sm border border-[#e5e5e5] rounded-md disabled:opacity-30 hover:bg-[#f5f5f5] transition-colors"
              title="Previous"
            >
              ← Prev
            </button>
            <button
              onClick={() => nextId && router.push(`/pipeline/${nextId}`)}
              disabled={!nextId}
              className="px-2 py-1.5 text-sm border border-[#e5e5e5] rounded-md disabled:opacity-30 hover:bg-[#f5f5f5] transition-colors"
              title="Next"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ── 3-PANE BODY ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[460px_1fr_340px] min-h-[calc(100vh-140px)]">

        {/* ── LEFT PANE: Lead Details ─────────────────────────────────────── */}
        <div className="border-r border-[#e5e5e5] bg-white p-4">
          {/* PERSON */}
          <Section title="Person">
            {/* name is a single field in DB — show split for display but save as full name */}
            <Field label="Full Name"  value={lead.name}    onSave={v => saveField('name', v)} />
            <Field label="Email"      value={lead.email}   onSave={v => saveField('email', v)}  type="email" />
            <Field label="Mobile"     value={lead.phone}   onSave={v => saveField('phone', v)}  type="tel" />
            <Field label="DOB"        value={str(ud.dob)}        onSave={v => saveField('dob', v)} />
            <Field label="SSN"        value={str(ud.ssn)}        onSave={v => saveField('ssn', v)} masked />
            <Field label="Home Address" value={str(ud.homeAddress)} onSave={v => saveField('homeAddress', v)} />
            <Field label="City"       value={str(ud.city)}       onSave={v => saveField('city', v)} />
            <Field label="State"      value={str(ud.state)}      onSave={v => saveField('state', v)} />
            <Field label="ZIP"        value={str(ud.zip)}        onSave={v => saveField('zip', v)} />
            <Field label="Country"    value={str(ud.country) ?? 'US'} onSave={v => saveField('country', v)} />
          </Section>

          {/* CREDIT */}
          <Section title="Credit">
            <Field
              label="Credit Score"
              value={creditScore != null ? String(creditScore) : null}
              onSave={v => saveField('creditScore', v)}
              type="number"
              valueStyle={{ color: creditScoreColor, fontWeight: 700 }}
            />
            <Field label="Credit Util %" value={str(ud.creditUtilization)} onSave={v => saveField('creditUtilization', v)} type="number" />
            <Field label="Inquiries"     value={str(ud.creditInquiries)}   onSave={v => saveField('creditInquiries', v)} type="number" />
            <Field label="Lates"         value={str(ud.creditLates)}       onSave={v => saveField('creditLates', v)} type="number" />
          </Section>

          {/* COMPANY */}
          <Section title="Company">
            <Field label="Legal Name"    value={lead.company}              onSave={v => saveField('company', v)} />
            <Field label="DBA"           value={str(ud.dba)}              onSave={v => saveField('dba', v)} />
            <Field label="Address"       value={str(ud.businessAddress)}  onSave={v => saveField('businessAddress', v)} />
            <Field label="City"          value={str(ud.businessCity)}     onSave={v => saveField('businessCity', v)} />
            <Field label="State"         value={str(ud.businessState)}    onSave={v => saveField('businessState', v)} />
            <Field label="ZIP"           value={str(ud.businessZip)}      onSave={v => saveField('businessZip', v)} />
            <Field label="Industry"      value={str(ud.industry)}         onSave={v => saveField('industry', v)} />
            <TIBField
              valueMonths={typeof ud.timeInBusiness === 'number' ? ud.timeInBusiness : Number(ud.timeInBusiness) || null}
              onSave={months => saveField('timeInBusiness', String(months))}
            />
            <Field label="Start Date"    value={str(ud.businessStartDate)} onSave={v => saveField('businessStartDate', v)} />
            <Field label="EIN"           value={str(ud.ein)}              onSave={v => saveField('ein', v)} />
            <Field label="Entity Type"   value={str(ud.entityType)}       onSave={v => saveField('entityType', v)} />
            <Field label="Ownership %"   value={str(ud.ownershipPercent)} onSave={v => saveField('ownershipPercent', v)} />
            <Field label="Business Phone" value={str(ud.businessPhone)}   onSave={v => saveField('businessPhone', v)} type="tel" />
            <Field label="Fax"           value={str(ud.fax)}              onSave={v => saveField('fax', v)} />
            <CheckboxField
              label="Sole Proprietor"
              checked={!!(ud as Record<string, unknown>).isSoleProp}
              onToggle={() => saveField('isSoleProp', String(!(ud as Record<string, unknown>).isSoleProp))}
            />
          </Section>

          {/* DEAL */}
          <Section title="Deal">
            <Field label="Amount Requested"  value={lead.value != null ? String(lead.value) : str(ud.requestedAmount)} onSave={v => saveField('value', v)} />
            <Field label="Use of Funds"      value={str(ud.purposeOfFunds)}   onSave={v => saveField('purposeOfFunds', v)} />
            <Field label="Avg Monthly Rev"   value={str(ud.monthlyRevenue)}   onSave={v => saveField('monthlyRevenue', v)} type="number" />
            <Field label="Avg Daily Balance" value={str(ud.avgDailyBalance)}  onSave={v => saveField('avgDailyBalance', v)} type="number" />
            <Field label="Ending Balance"    value={str(ud.endingBalance)}    onSave={v => saveField('endingBalance', v)} type="number" />
            <Field label="NSF Count (3mo)"   value={str(ud.nsfCount)}         onSave={v => saveField('nsfCount', v)} type="number" />
            <Field label="Avg Deposits/Mo"   value={str(ud.depositsCount)}    onSave={v => saveField('depositsCount', v)} type="number" />
            <CheckboxField
              label="Has MCA Loans"
              checked={!!(ud as Record<string, unknown>).hasOtherMCALoans}
              onToggle={() => saveField('hasOtherMCALoans', String(!(ud as Record<string, unknown>).hasOtherMCALoans))}
            />
          </Section>

          {/* OWNER 2 — collapsible, show only if any owner2 field exists */}
          {!!(ud.owner2FirstName || ud.owner2LastName || ud.owner2CreditScore) && (
            <Section title="Owner 2" collapsible>
              <Field label="First Name"   value={str(ud.owner2FirstName)}       onSave={v => saveField('owner2FirstName', v)} />
              <Field label="Last Name"    value={str(ud.owner2LastName)}        onSave={v => saveField('owner2LastName', v)} />
              <Field label="DOB"          value={str(ud.owner2Dob)}             onSave={v => saveField('owner2Dob', v)} />
              <Field label="Ownership %"  value={str(ud.owner2OwnershipPercent)} onSave={v => saveField('owner2OwnershipPercent', v)} />
              <Field label="Credit Score" value={str(ud.owner2CreditScore)}     onSave={v => saveField('owner2CreditScore', v)} />
              <Field label="SSN"          value={str(ud.owner2Ssn)}             onSave={v => saveField('owner2Ssn', v)} masked />
              <Field label="City"         value={str(ud.owner2City)}            onSave={v => saveField('owner2City', v)} />
              <Field label="State"        value={str(ud.owner2State)}           onSave={v => saveField('owner2State', v)} />
              <Field label="ZIP"          value={str(ud.owner2Zip)}             onSave={v => saveField('owner2Zip', v)} />
            </Section>
          )}

          {/* META */}
          <Section title="Meta">
            <Field label="Created At"  value={fmtDate(lead.created_at)}  readOnly />
            <Field label="Updated At"  value={fmtDate(lead.updated_at)}  readOnly />
          </Section>
        </div>

        {/* ── CENTER PANE: Submissions / Notes / Updates ──────────────────── */}
        <div className="bg-[#fafafa] flex flex-col border-r border-[#e5e5e5]">
          {/* Segmented control */}
          <div className="flex-shrink-0 bg-white border-b border-[#e5e5e5] px-4 pt-4 pb-0 flex items-center gap-1">
            {(['submissions', 'notes', 'updates'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setCenterTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                  centerTab === tab
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#9b9b9b] hover:text-[#6b6b6b]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4">
            {/* SUBMISSIONS */}
            {centerTab === 'submissions' && (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-[#f0f0f0] flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-[#d4d4d4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[#6b6b6b]">No submissions yet</p>
                <p className="text-xs text-[#9b9b9b] mt-1">Click <strong>Send to Lender</strong> in the Actions panel to get started.</p>
              </div>
            )}

            {/* NOTES */}
            {centerTab === 'notes' && (
              <div className="h-full flex flex-col gap-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this lead…"
                  className="flex-1 w-full px-3 py-2.5 text-sm border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] resize-none min-h-[240px]"
                />
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="self-end px-4 py-2 bg-[#1a1a1a] text-white text-sm font-medium rounded-md hover:bg-[#333] disabled:opacity-50 transition-colors"
                >
                  {notesSaving ? 'Saving…' : 'Save Notes'}
                </button>
              </div>
            )}

            {/* UPDATES */}
            {centerTab === 'updates' && (
              <div className="space-y-3">
                <div className="text-sm text-[#9b9b9b] text-center py-8">
                  Activity timeline will appear here as the deal progresses.
                </div>
                {/* Static entries from lead data */}
                {lead.created_at && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d4] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[#1a1a1a]">Lead created</p>
                      <p className="text-xs text-[#9b9b9b]">{fmtDate(lead.created_at)}</p>
                    </div>
                  </div>
                )}
                {lead.last_contact && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d4] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[#1a1a1a]">Last contact logged</p>
                      <p className="text-xs text-[#9b9b9b]">{fmtDate(lead.last_contact)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Actions + Deal Tools ────────────────────────────── */}
        <div className="bg-white p-4">

          {/* ACTIONS */}
          <Section title="Actions">
            <div className="grid grid-cols-2 gap-2 mb-1">
              <button
                onClick={() => setShowSendModal(true)}
                className="px-3 py-2.5 bg-[#1a1a1a] text-white text-xs font-medium rounded-md hover:bg-[#333] transition-colors text-center"
              >
                Send to Lender
              </button>
              <button
                onClick={() => setShowEmailModal(true)}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Send Email
              </button>
              <button
                onClick={() => router.push(`/inbox?leadId=${lead.id}`)}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Send SMS
              </button>
              <button
                onClick={() => setShowDocsModal(true)}
                className="px-3 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-xs font-medium rounded-md hover:bg-[#f5f5f5] transition-colors text-center"
              >
                Documents
              </button>
            </div>

            {/* Generate App (coming soon) */}
            <button
              disabled
              title="Coming soon — will link to your funding site application"
              className="w-full px-3 py-2.5 border border-[#e5e5e5] text-[#9b9b9b] text-xs font-medium rounded-md cursor-not-allowed text-center flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Generate App
            </button>
          </Section>

          {/* STATUS & OWNERSHIP */}
          <Section title="Status & Ownership">
            {/* Lead Status dropdown */}
            <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Lead Status</span>
              <div className="flex-1 min-w-0">
                <select
                  value={lead.lead_status || lead.stage || ''}
                  onChange={e => saveLeadStatus(e.target.value)}
                  className="w-full text-sm border border-[#e5e5e5] rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                >
                  <option value="">— Select —</option>
                  {dbStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Temperature pills */}
            <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-1">Temperature</span>
              <div className="flex gap-1">
                {(['Hot', 'Warm', 'Cold'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => saveTemperature(t)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      lead.temperature === t
                        ? t === 'Hot' ? 'bg-red-100 text-red-700' : t === 'Warm' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        : 'bg-[#f5f5f5] text-[#6b6b6b] hover:bg-[#ebebeb]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned To */}
            <div className="flex items-start gap-2 py-2 border-b border-[#f5f5f5]">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Assigned To</span>
              <AssignedToField value={lead.assigned_to} onSave={saveAssignedTo} />
            </div>

            {/* Created By (read-only) */}
            <div className="flex items-start gap-2 py-2">
              <span className="text-xs text-[#9b9b9b] w-28 flex-shrink-0 pt-0.5">Created By</span>
              <span className="text-sm text-[#6b6b6b]">{userName}</span>
            </div>
          </Section>

          {/* DEAL TOOLS */}
          <Section title="Deal Tools">
            <p className="text-xs text-[#9b9b9b] mb-2">Input Financials, Bank Statements, Lender Match, and Offers are below — scroll down or jump directly.</p>
            <button
              onClick={scrollToUW}
              className="w-full px-4 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] text-sm font-medium rounded-md hover:bg-[#f5f5f5] transition-colors flex items-center justify-between"
            >
              <span>Jump to Underwriting</span>
              <svg className="w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </Section>
        </div>
      </div>

      {/* ── UNDERWRITING SUITE (inline, full-width below the 3-pane) ────── */}
      <div id="underwriting-section" className="border-t-4 border-[#e5e5e5] bg-white">
        <div className="px-6 py-3 bg-[#fafafa] border-b border-[#e5e5e5] flex items-center gap-2">
          <svg className="w-4 h-4 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-[#1a1a1a]">Underwriting Suite</span>
          <span className="text-xs text-[#9b9b9b]">— Input Financials · Bank Statements · Lender Match · Offers</span>
        </div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <UnderwritingSuite
          leadId={lead.id}
          leadName={lead.name}
          businessName={lead.company}
          phone={lead.phone}
          leadNotes={lead.notes}
          initialData={lead.underwriting_data as any}
          onClose={() => {}}
          onSave={handleUnderwritingSave as any}
          onNotesUpdate={async (n: string) => { await saveField('notes', n); setNotes(n); }}
          inline
        />
      </div>

      {/* ── DOCUMENTS MODAL ──────────────────────────────────────────────── */}
      {showDocsModal && (
        <DocumentsModal
          leadId={lead.id}
          leadName={lead.name}
          leadCompany={lead.company}
          onApplyParsed={applyParsedApp}
          onClose={() => setShowDocsModal(false)}
        />
      )}

      {/* ── SCHEDULE EMAIL MODAL ─────────────────────────────────────────── */}
      {showEmailModal && (
        <ScheduleEmailModal
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            underwriting_data: lead.underwriting_data,
          }}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {/* ── SEND TO LENDER MODAL ─────────────────────────────────────────── */}
      {showSendModal && (
        <SendToLenderModal
          leadId={lead.id}
          leadName={lead.name}
          leadCompany={lead.company}
          leadValue={lead.value ?? null}
          leadStatus={lead.lead_status || lead.stage || undefined}
          userName={userName}
          criteria={{
            timeInBusiness:    Number(ud.timeInBusiness  ?? 0),
            creditScore:       Number(ud.creditScore     ?? 0),
            avgMonthlyRevenue: Number(ud.monthlyRevenue  ?? 0),
            currentPositions:  ud.hasOtherMCALoans ? Number(ud.mcaPositionCount ?? 1) : 0,
            businessState:     String(ud.businessState   ?? ''),
            industry:          String(ud.industry        ?? ''),
            nsfCount:          Number(ud.nsfCount        ?? 0),
            depositsCount:     Number(ud.depositsCount   ?? 0),
            isSoleProp:        Boolean(ud.isSoleProp     ?? false),
          }}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {/* ── DELETE CONFIRM MODAL ──────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-[#1a1a1a] mb-2">Delete Lead?</h3>
            <p className="text-sm text-[#6b6b6b] mb-4">
              <span className="font-medium text-[#1a1a1a]">{lead.company || lead.name}</span> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2.5 border border-[#e5e5e5] rounded-lg text-sm text-[#6b6b6b] hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assigned To inline editable ───────────────────────────────────────────────
function AssignedToField({ value, onSave }: { value: string | null | undefined; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value || '');
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    try { await onSave(val); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <div className="flex gap-1 flex-1">
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="flex-1 px-2 py-0.5 text-sm border border-[#e5e5e5] rounded focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
        />
        {saving && <span className="text-xs text-[#9b9b9b] pt-1">…</span>}
      </div>
    );
  }
  return (
    <span
      onClick={() => { setVal(value || ''); setEditing(true); }}
      className="text-sm text-[#1a1a1a] cursor-pointer hover:underline underline-offset-2 decoration-dotted"
    >
      {value || <span className="text-[#9b9b9b] italic">Unassigned</span>}
    </span>
  );
}
