'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type WhoToTextPerson = {
  leadId: string;
  name: string;
  company: string | null;
  phone: string;
  lastMessageAt: string | null;
  lastDirection: 'inbound' | 'outbound' | null;
  action: 'reply' | 'follow_up';
  reason: string;
};

export type WhoToTextCleared = {
  leadId: string;
  at: string;
};

function clearedKey(userId: string) {
  return `who-to-text-cleared:${userId}`;
}

export function loadWhoToTextCleared(userId: string): WhoToTextCleared[] {
  try {
    const raw = localStorage.getItem(clearedKey(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const leadId = String(r.leadId ?? '').trim();
        const at = String(r.at ?? '').trim();
        if (!leadId || !at) return null;
        return { leadId, at };
      })
      .filter(Boolean) as WhoToTextCleared[];
  } catch {
    return [];
  }
}

export function saveWhoToTextCleared(userId: string, rows: WhoToTextCleared[]) {
  try {
    localStorage.setItem(clearedKey(userId), JSON.stringify(rows.slice(-300)));
  } catch {
    /* ignore */
  }
}

function relativeTime(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function WhoToTextPanel({
  anchor,
  loading,
  error,
  people,
  onClose,
  onSelect,
  onClear,
  onRescan,
}: {
  anchor: { top: number; left: number };
  loading: boolean;
  error: string;
  people: WhoToTextPerson[];
  onClose: () => void;
  onSelect: (person: WhoToTextPerson) => void;
  onClear: (person: WhoToTextPerson) => void;
  onRescan: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchor.top,
    left: Math.max(8, Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - 340)),
    zIndex: 9999,
    width: 328,
    maxHeight: 'min(70vh, 520px)',
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="bg-white border border-[#e5e5e5] rounded-lg shadow-lg overflow-hidden flex flex-col"
    >
      <div className="px-3 py-2.5 border-b border-[#e5e5e5] flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium text-[#1a1a1a]">Who to text</p>
          <button
            type="button"
            onClick={onRescan}
            disabled={loading}
            className="text-[11px] font-medium text-[#6b6b6b] hover:text-[#1a1a1a] bg-transparent border-0 p-0 disabled:opacity-50"
          >
            {loading ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
        <p className="text-[10px] text-[#9b9b9b] mt-0.5">People waiting on a reply or a follow-up</p>
      </div>
      <div className="overflow-y-auto flex-1">
        {loading && people.length === 0 && !error ? (
          <p className="px-3 py-8 text-xs text-[#9b9b9b] text-center">Reading your texts…</p>
        ) : error && people.length === 0 ? (
          <p className="px-3 py-8 text-xs text-red-600 text-center">{error}</p>
        ) : people.length === 0 ? (
          <p className="px-3 py-8 text-xs text-[#9b9b9b] text-center">Nothing looks overdue right now.</p>
        ) : (
          people.map((person, i) => (
            <div
              key={person.leadId}
              className="flex items-start gap-2 px-3 py-2.5 border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors"
            >
              <button
                type="button"
                title="Already handled"
                onClick={() => onClear(person)}
                className="mt-0.5 flex-shrink-0 w-3 h-3 rounded-full border border-[#c4c4c4] bg-transparent p-0 hover:border-[#1a1a1a] hover:bg-[#f0f0f0]"
              />
              <button
                type="button"
                onClick={() => onSelect(person)}
                className="flex-1 min-w-0 text-left bg-transparent border-0 p-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-[#1a1a1a] truncate">
                    {i + 1}. {person.company || person.name}
                  </p>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{relativeTime(person.lastMessageAt)}</span>
                </div>
                {person.company ? (
                  <p className="text-[10px] text-[#6b6b6b] truncate mt-0.5">{person.name}</p>
                ) : null}
                <p className="text-[11px] text-[#555] mt-1 leading-snug">{person.reason}</p>
                <p className="text-[10px] text-[#9b9b9b] mt-1">
                  {person.action === 'reply' ? 'Reply' : 'Follow up'}
                </p>
              </button>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
