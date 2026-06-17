'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { TIER_LABELS, LenderTier } from '@/data/lenders';

export interface LenderRecord {
  id: string;
  name: string;
  tier: number;
  min_monthly_revenue: number;
  min_tib_months: number;
  min_fico: number;
  tib_fico_tiers: Array<{ minTIBMonths: number; minFico: number }> | null;
  no_credit_pull: boolean;
  min_position: number;
  max_position: number;
  neg_days_max: number | null;
  min_deposits: number | null;
  hard_pull_sole_props: boolean;
  restricted_states: string[];
  restricted_industry_keywords: string[];
  notes: string;
  is_active: boolean;
}

const EMPTY_FORM = {
  name: '',
  tier: 1,
  min_monthly_revenue: 10000,
  min_tib_months: 12,
  min_fico: 600,
  min_position: 1,
  max_position: 10,
  no_credit_pull: false,
  hard_pull_sole_props: false,
  neg_days_max: '',
  min_deposits: '',
  restricted_states: '',
  restricted_industry_keywords: '',
  notes: '',
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

function recordToForm(r: LenderRecord): FormState {
  return {
    name: r.name,
    tier: r.tier,
    min_monthly_revenue: r.min_monthly_revenue,
    min_tib_months: r.min_tib_months,
    min_fico: r.min_fico,
    min_position: r.min_position,
    max_position: r.max_position,
    no_credit_pull: r.no_credit_pull,
    hard_pull_sole_props: r.hard_pull_sole_props,
    neg_days_max: r.neg_days_max != null ? String(r.neg_days_max) : '',
    min_deposits: r.min_deposits != null ? String(r.min_deposits) : '',
    restricted_states: (r.restricted_states ?? []).join(', '),
    restricted_industry_keywords: (r.restricted_industry_keywords ?? []).join(', '),
    notes: r.notes ?? '',
    is_active: r.is_active,
  };
}

function formToPayload(f: FormState) {
  return {
    name: f.name.trim(),
    tier: Number(f.tier),
    min_monthly_revenue: Number(f.min_monthly_revenue) || 0,
    min_tib_months: Number(f.min_tib_months) || 0,
    min_fico: Number(f.min_fico) || 0,
    min_position: Number(f.min_position) || 1,
    max_position: Number(f.max_position) || 10,
    no_credit_pull: f.no_credit_pull,
    hard_pull_sole_props: f.hard_pull_sole_props,
    neg_days_max: f.neg_days_max !== '' ? Number(f.neg_days_max) : null,
    min_deposits: f.min_deposits !== '' ? Number(f.min_deposits) : null,
    restricted_states: f.restricted_states
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    restricted_industry_keywords: f.restricted_industry_keywords
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    notes: f.notes.trim(),
    is_active: f.is_active,
    tib_fico_tiers: null,
  };
}

const TIER_ORDER: LenderTier[] = [1, 2, 3, 4, 5, 6];

interface Props {
  onClose: () => void;
  onRefresh: () => void;
}

export default function LenderSettingsModal({ onClose, onRefresh }: Props) {
  const [lenders, setLenders] = useState<LenderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<number | 'all'>('all');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/lenders');
      const json = await res.json();
      setLenders(json.lenders ?? []);
    } catch {
      setError('Failed to load lenders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (lender: LenderRecord) => {
    setEditingId(lender.id);
    setForm(recordToForm(lender));
    setError('');
  };

  const startAdd = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
  };

  const save = async () => {
    if (!form.name.trim()) { setError('Lender name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = formToPayload(form);
      if (editingId === 'new') {
        const res = await fetch('/api/lenders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else {
        const res = await fetch('/api/lenders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      await load();
      onRefresh();
      setEditingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const deleteLender = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/lenders?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
      onRefresh();
      if (editingId === id) setEditingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const toggleActive = async (lender: LenderRecord) => {
    try {
      await fetch('/api/lenders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lender.id, is_active: !lender.is_active }),
      });
      await load();
      onRefresh();
    } catch { /* ignore */ }
  };

  const filtered = lenders.filter((l) => {
    const matchTier = filterTier === 'all' || l.tier === filterTier;
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase());
    return matchTier && matchSearch;
  });

  const isEditing = editingId !== null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-slate-800 text-white rounded-t-xl">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-base font-semibold">Lender Settings</h2>
            <span className="text-xs text-slate-400">{lenders.length} lenders</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — lender list */}
          <div className={`flex flex-col border-r border-gray-200 overflow-hidden ${isEditing ? 'w-1/2' : 'w-full'}`}>
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lenders..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <option value="all">All Tiers</option>
                {TIER_ORDER.map((t) => (
                  <option key={t} value={t}>{TIER_LABELS[t as LenderTier]}</option>
                ))}
              </select>
              <button
                onClick={startAdd}
                className="px-3 py-1.5 text-xs font-medium bg-slate-700 text-white rounded-md hover:bg-slate-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Lender
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading lenders...</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">No lenders found.</div>
              ) : (
                TIER_ORDER.map((tier) => {
                  const tierLenders = filtered.filter((l) => l.tier === tier);
                  if (tierLenders.length === 0) return null;
                  return (
                    <div key={tier}>
                      <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 uppercase tracking-wide">
                        {TIER_LABELS[tier as LenderTier]}
                      </div>
                      {tierLenders.map((lender) => (
                        <LenderRow
                          key={lender.id}
                          lender={lender}
                          isSelected={editingId === lender.id}
                          onEdit={() => startEdit(lender)}
                          onDelete={() => deleteLender(lender.id, lender.name)}
                          onToggleActive={() => toggleActive(lender)}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel — edit/add form */}
          {isEditing && (
            <div className="w-1/2 flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  {editingId === 'new' ? 'Add New Lender' : `Edit: ${form.name}`}
                </h3>
                <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
                )}

                <FormField label="Lender Name *">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={INPUT}
                    placeholder="e.g., ONDECK"
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Tier">
                    <select value={form.tier} onChange={(e) => setForm({ ...form, tier: Number(e.target.value) })} className={INPUT}>
                      {TIER_ORDER.map((t) => (
                        <option key={t} value={t}>{TIER_LABELS[t as LenderTier]}</option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Min Monthly Revenue ($)">
                    <input type="number" value={form.min_monthly_revenue} onChange={(e) => setForm({ ...form, min_monthly_revenue: Number(e.target.value) })} className={INPUT} min="0" step="1000" />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Min TIB (months)">
                    <input type="number" value={form.min_tib_months} onChange={(e) => setForm({ ...form, min_tib_months: Number(e.target.value) })} className={INPUT} min="0" />
                  </FormField>

                  <FormField label="Min FICO (0 = no min)">
                    <input type="number" value={form.min_fico} onChange={(e) => setForm({ ...form, min_fico: Number(e.target.value) })} className={INPUT} min="0" max="850" />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Min Position">
                    <select value={form.min_position} onChange={(e) => setForm({ ...form, min_position: Number(e.target.value) })} className={INPUT}>
                      {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}{n===1?' (1st pos ok)':` (${n}+ pos only)`}</option>)}
                    </select>
                  </FormField>

                  <FormField label="Max Positions">
                    <select value={form.max_position} onChange={(e) => setForm({ ...form, max_position: Number(e.target.value) })} className={INPUT}>
                      {[1,2,3,4,5,6,7,8,10].map((n) => <option key={n} value={n}>{n === 10 ? 'No limit (10)' : n}</option>)}
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Max Neg Days (blank = no limit)">
                    <input type="number" value={form.neg_days_max} onChange={(e) => setForm({ ...form, neg_days_max: e.target.value })} className={INPUT} min="0" placeholder="e.g. 6" />
                  </FormField>

                  <FormField label="Min Deposits/mo (blank = no min)">
                    <input type="number" value={form.min_deposits} onChange={(e) => setForm({ ...form, min_deposits: e.target.value })} className={INPUT} min="0" placeholder="e.g. 5" />
                  </FormField>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.no_credit_pull} onChange={(e) => setForm({ ...form, no_credit_pull: e.target.checked })} className="w-4 h-4 rounded" />
                    No Credit Pull
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.hard_pull_sole_props} onChange={(e) => setForm({ ...form, hard_pull_sole_props: e.target.checked })} className="w-4 h-4 rounded" />
                    Hard Pull on Sole Props
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                    Active
                  </label>
                </div>

                <FormField label="Restricted States (comma-separated 2-letter codes)">
                  <input
                    type="text"
                    value={form.restricted_states}
                    onChange={(e) => setForm({ ...form, restricted_states: e.target.value })}
                    className={INPUT}
                    placeholder="e.g. TX, CA, NY"
                  />
                </FormField>

                <FormField label="Restricted Industry Keywords (comma-separated, lowercase)">
                  <textarea
                    value={form.restricted_industry_keywords}
                    onChange={(e) => setForm({ ...form, restricted_industry_keywords: e.target.value })}
                    className={`${INPUT} h-16 resize-none`}
                    placeholder="e.g. trucking, cannabis, auto dealership, legal"
                  />
                </FormField>

                <FormField label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={`${INPUT} h-20 resize-none`}
                    placeholder="Special conditions, industry sub-tiers, etc."
                  />
                </FormField>
              </div>

              {/* Save bar */}
              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                <button onClick={cancelEdit} className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId === 'new' ? 'Add Lender' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function LenderRow({
  lender,
  isSelected,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  lender: LenderRecord;
  isSelected: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const fmtRev = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;
  const fmtTIB = (m: number) => {
    if (m === 0) return 'None';
    const y = Math.floor(m / 12), mo = m % 12;
    return y === 0 ? `${mo}mo` : mo === 0 ? `${y}yr` : `${y}yr ${mo}mo`;
  };
  const posLabel = lender.min_position > 1
    ? `${lender.min_position}–${lender.max_position} pos`
    : `1–${lender.max_position} pos`;

  return (
    <div className={`flex items-center px-4 py-2.5 border-b border-gray-100 gap-2 ${isSelected ? 'bg-slate-50' : 'hover:bg-gray-50'} ${!lender.is_active ? 'opacity-50' : ''}`}>
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 cursor-pointer ${lender.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
        title={lender.is_active ? 'Active (click to deactivate)' : 'Inactive (click to activate)'}
        onClick={onToggleActive}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-800 truncate">{lender.name}</span>
          {lender.min_position > 1 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Not 1st pos</span>
          )}
          {lender.no_credit_pull && (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">No pull</span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
          <span>{fmtRev(lender.min_monthly_revenue)}/mo</span>
          <span>·</span>
          <span>{fmtTIB(lender.min_tib_months)} TIB</span>
          {lender.min_fico > 0 && <><span>·</span><span>{lender.min_fico} FICO</span></>}
          <span>·</span>
          <span>{posLabel}</span>
          {(lender.restricted_states ?? []).length > 0 && (
            <><span>·</span><span className="text-red-400">{lender.restricted_states.slice(0,3).join(', ')}{lender.restricted_states.length > 3 ? '…' : ''}</span></>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-slate-700 hover:bg-gray-100 rounded transition-colors"
          title="Edit"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          title="Delete"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
