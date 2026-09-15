'use client';

import { useState, useEffect } from 'react';

interface LeadStatus {
  id: string;
  name: string;
  color: string;
  bg_color: string;
  sort_order: number;
}

// Preset color pairs (text / background)
const PRESETS = [
  { label: 'Blue',   color: '#1d4ed8', bg: '#dbeafe' },
  { label: 'Sky',    color: '#0369a1', bg: '#e0f2fe' },
  { label: 'Green',  color: '#15803d', bg: '#dcfce7' },
  { label: 'Teal',   color: '#0f766e', bg: '#ccfbf1' },
  { label: 'Emerald',color: '#047857', bg: '#d1fae5' },
  { label: 'Lime',   color: '#3f6212', bg: '#ecfccb' },
  { label: 'Purple', color: '#7e22ce', bg: '#f3e8ff' },
  { label: 'Violet', color: '#6d28d9', bg: '#ede9fe' },
  { label: 'Pink',   color: '#be185d', bg: '#fce7f3' },
  { label: 'Red',    color: '#b91c1c', bg: '#fee2e2' },
  { label: 'Orange', color: '#c2410c', bg: '#fff7ed' },
  { label: 'Amber',  color: '#b45309', bg: '#fef9c3' },
  { label: 'Yellow', color: '#a16207', bg: '#fefce8' },
  { label: 'Brown',  color: '#92400e', bg: '#fef3c7' },
  { label: 'Gray',   color: '#4b5563', bg: '#f3f4f6' },
  { label: 'Slate',  color: '#374151', bg: '#e5e7eb' },
];

interface Props {
  onClose: () => void;
  onSaved: () => void; // refresh parent
}

export default function ManageStatusesModal({ onClose, onSaved }: Props) {
  const [statuses, setStatuses]   = useState<LeadStatus[]>([]);
  const [loading, setLoading]     = useState(true);
  const [newName, setNewName]     = useState('');
  const [newColor, setNewColor]   = useState(PRESETS[0].color);
  const [newBg, setNewBg]         = useState(PRESETS[0].bg);
  const [adding, setAdding]       = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]         = useState('');

  useEffect(() => {
    fetch('/api/lead-statuses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { setStatuses(j.statuses || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const addStatus = async () => {
    if (!newName.trim()) return;
    setAdding(true); setError('');
    const res = await fetch('/api/lead-statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: newName.trim(), color: newColor, bg_color: newBg }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Failed'); setAdding(false); return; }
    setStatuses(s => [...s, json.status]);
    setNewName('');
    setAdding(false);
    onSaved();
  };

  const deleteStatus = async (id: string) => {
    setDeletingId(id);
    await fetch('/api/lead-statuses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });
    setStatuses(s => s.filter(x => x.id !== id));
    setDeletingId(null);
    onSaved();
  };

  const pickPreset = (p: typeof PRESETS[0]) => {
    setNewColor(p.color); setNewBg(p.bg);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f0f0] flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-[#1a1a1a]">Manage Pipeline Statuses</p>
            <p className="text-xs text-[#9b9b9b] mt-0.5">Add, remove, or re-color your deal stages</p>
          </div>
          <button onClick={onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add new */}
        <div className="px-6 py-4 border-b border-[#f0f0f0] flex-shrink-0">
          <p className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider mb-2">Add New Status</p>

          {/* Color presets */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => pickPreset(p)}
                title={p.label}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${newColor === p.color ? 'border-[#1a1a1a] scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: p.bg, outlineColor: p.color }}
              >
                <span className="sr-only">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              {/* Preview pill */}
              {newName && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ color: newColor, background: newBg }}>
                  {newName}
                </span>
              )}
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addStatus()}
                placeholder="Status name…"
                className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] pr-28"
              />
            </div>
            <button onClick={addStatus} disabled={adding || !newName.trim()}
              className="px-4 py-2 bg-[#1a1a1a] text-white text-sm font-semibold rounded-lg hover:bg-[#333] disabled:opacity-40 transition-colors whitespace-nowrap">
              {adding ? '…' : '+ Add'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Status list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-[#9b9b9b]">Loading…</div>
          ) : statuses.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#9b9b9b]">No statuses yet</div>
          ) : (
            <div className="space-y-1.5">
              {statuses.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#fafafa] group">
                  {/* Color dot */}
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />

                  {/* Pill preview */}
                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold flex-shrink-0"
                    style={{ color: s.color, background: s.bg_color }}>
                    {s.name}
                  </span>

                  <span className="flex-1" />

                  {/* Delete */}
                  <button
                    onClick={() => deleteStatus(s.id)}
                    disabled={deletingId === s.id}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#9b9b9b] hover:text-red-500 transition-all"
                    title="Delete status"
                  >
                    {deletingId === s.id
                      ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f0f0f0] flex-shrink-0">
          <p className="text-[11px] text-[#9b9b9b] text-center">
            {statuses.length} statuses · Changes apply immediately across all leads
          </p>
        </div>
      </div>
    </div>
  );
}
