'use client';

import { useState, useEffect, useRef } from 'react';

interface LeadStatus {
  id: string;
  name: string;
  color: string;
  bg_color: string;
  sort_order: number;
}

type ColorPair = { color: string; bg: string };

// Preset color pairs (text / background)
const PRESETS: (ColorPair & { label: string })[] = [
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

function parseHex(raw: string): string | null {
  const s = String(raw ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) return '#' + s.split('').map(c => c + c).join('').toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase();
  return null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = parseHex(hex);
  if (!h) return null;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}

function mix(hex: string, toward: string, t: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  if (!a || !b) return parseHex(hex) || '#1d4ed8';
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

function luminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pairFromCustom(hex: string): ColorPair {
  const parsed = parseHex(hex) || '#1d4ed8';
  if (luminance(parsed) > 0.55) return { color: mix(parsed, '#000000', 0.45), bg: parsed };
  return { color: parsed, bg: mix(parsed, '#ffffff', 0.88) };
}

function isPresetColor(color: string) {
  const c = parseHex(color);
  return PRESETS.some(p => parseHex(p.color) === c);
}

function ColorDots({
  color,
  bg,
  disabled,
  onPick,
}: {
  color: string;
  bg: string;
  disabled?: boolean;
  onPick: (pair: ColorPair) => void;
}) {
  const customSelected = !isPresetColor(color);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map(p => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p)}
          disabled={disabled}
          title={p.label}
          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${color === p.color ? 'border-[#1a1a1a] scale-110' : 'border-transparent'}`}
          style={{ backgroundColor: p.bg }}
        >
          <span className="sr-only">{p.label}</span>
        </button>
      ))}
      <label
        title="Custom color"
        className={`relative w-5 h-5 rounded-full border-2 overflow-hidden cursor-pointer transition-transform hover:scale-110 shrink-0 ${customSelected ? 'border-[#1a1a1a] scale-110' : 'border-[#d4d4d4]'}`}
      >
        <span
          className="block w-full h-full"
          style={{ background: 'conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)' }}
        />
        <input
          type="color"
          value={parseHex(color) || '#1d4ed8'}
          disabled={disabled}
          onChange={e => onPick(pairFromCustom(e.target.value))}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-0"
        />
      </label>
      {customSelected && (
        <>
          <label title="Text color" className="relative w-5 h-5 rounded-full overflow-hidden cursor-pointer border border-[#e5e5e5] shrink-0" style={{ backgroundColor: color }}>
            <input
              type="color"
              value={parseHex(color) || '#1d4ed8'}
              disabled={disabled}
              onChange={e => onPick({ color: parseHex(e.target.value) || color, bg })}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-0"
            />
          </label>
          <label title="Background color" className="relative w-5 h-5 rounded-full overflow-hidden cursor-pointer border border-[#e5e5e5] shrink-0" style={{ backgroundColor: bg }}>
            <input
              type="color"
              value={parseHex(bg) || '#dbeafe'}
              disabled={disabled}
              onChange={e => onPick({ color, bg: parseHex(e.target.value) || bg })}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-0"
            />
          </label>
        </>
      )}
    </div>
  );
}

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
  const [recolorId, setRecolorId] = useState<string | null>(null);
  const [savingId, setSavingId]   = useState<string | null>(null);
  const [error, setError]         = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/lead-statuses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { setStatuses(j.statuses || []); setLoading(false); })
      .catch(() => setLoading(false));
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
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

  const pickPreset = (p: ColorPair) => {
    setNewColor(p.color); setNewBg(p.bg);
  };

  const updateColor = async (id: string, p: ColorPair, opts?: { debounce?: boolean }) => {
    setError('');
    setStatuses(s => s.map(x => x.id === id ? { ...x, color: p.color, bg_color: p.bg } : x));
    const persist = async () => {
      setSavingId(id);
      const res = await fetch('/api/lead-statuses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, color: p.color, bg_color: p.bg }),
      });
      const json = await res.json().catch(() => ({}));
      setSavingId(null);
      if (!res.ok) {
        setError(json.error || 'Failed to update color');
        return;
      }
      if (json.status) {
        setStatuses(s => s.map(x => x.id === id ? json.status : x));
      }
      onSaved();
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (opts?.debounce) {
      saveTimer.current = setTimeout(persist, 400);
      return;
    }
    await persist();
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

          <div className="mb-3">
            <ColorDots color={newColor} bg={newBg} onPick={pickPreset} />
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
                <div key={s.id} className={`rounded-lg hover:bg-[#fafafa] ${recolorId === s.id ? 'bg-[#fafafa]' : ''}`}>
                  <div className="flex items-center gap-3 px-3 py-2 group">
                    <button
                      type="button"
                      onClick={() => setRecolorId(recolorId === s.id ? null : s.id)}
                      title="Change color"
                      className="w-3 h-3 rounded-full flex-shrink-0 ring-offset-1 hover:ring-2 hover:ring-[#1a1a1a]/30"
                      style={{ backgroundColor: s.color }}
                    />

                    <button
                      type="button"
                      onClick={() => setRecolorId(recolorId === s.id ? null : s.id)}
                      title="Change color"
                      className="px-2.5 py-0.5 rounded text-xs font-semibold flex-shrink-0"
                      style={{ color: s.color, background: s.bg_color }}
                    >
                      {s.name}
                    </button>

                    <span className="flex-1" />

                    {savingId === s.id && (
                      <svg className="w-3.5 h-3.5 animate-spin text-[#9b9b9b]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    )}

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
                  {recolorId === s.id && (
                    <div className="px-3 pb-2.5">
                      <ColorDots
                        color={s.color}
                        bg={s.bg_color}
                        onPick={pair => {
                          const preset = PRESETS.some(p => p.color === pair.color && p.bg === pair.bg);
                          updateColor(s.id, pair, { debounce: !preset });
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f0f0f0] flex-shrink-0">
          <p className="text-[11px] text-[#9b9b9b] text-center">
            {statuses.length} statuses · Click a status to change its color
          </p>
        </div>
      </div>
    </div>
  );
}
