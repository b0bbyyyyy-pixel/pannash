'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type LeadActionId =
  | 'application'
  | 'status'
  | 'lender'
  | 'send'
  | 'offers'
  | 'financials'
  | 'docs'
  | 'comms'
  | 'sms'
  | 'email'
  | 'call'
  | 'followup'
  | 'edit'
  | 'print'
  | 'csv';

type MenuEntry =
  | { kind: 'item'; id: LeadActionId; label: string }
  | { kind: 'group'; label: string; groupId?: LeadActionId; collapse?: boolean; items: { id: LeadActionId; label: string }[] };

const MENU: MenuEntry[] = [
  { kind: 'item', id: 'application', label: 'Application' },
  { kind: 'item', id: 'status', label: 'Status' },
  { kind: 'item', id: 'lender', label: 'Lenders' },
  { kind: 'item', id: 'docs', label: 'Docs' },
  {
    kind: 'group',
    label: 'Comms',
    collapse: true,
    items: [
      { id: 'sms', label: 'Send SMS' },
      { id: 'email', label: 'Send Email' },
      { id: 'call', label: 'Call' },
      { id: 'followup', label: 'Follow-up' },
    ],
  },
  {
    kind: 'group',
    label: 'More',
    items: [
      { id: 'edit', label: 'Edit lead' },
      { id: 'print', label: 'Print report' },
      { id: 'csv', label: 'Download CSV' },
    ],
  },
];

export default function LeadActionsMenu({
  onAction,
  align = 'right',
  compact = false,
  currentSection,
  showAppDot = false,
  appComplete = false,
  hiddenItems,
}: {
  onAction: (id: LeadActionId) => void;
  align?: 'left' | 'right';
  compact?: boolean;
  currentSection?: LeadActionId | null;
  showAppDot?: boolean;
  appComplete?: boolean;
  hiddenItems?: LeadActionId[];
}) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 200;
    const gap = 4;
    const pad = 8;
    const left = align === 'right' ? r.right - width : r.left;
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;
    // Keep the plus clickable: never draw the menu over the trigger.
    const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    if (openBelow) {
      setCoords({
        top: r.bottom + gap,
        left: Math.min(Math.max(pad, left), window.innerWidth - width - pad),
        maxHeight: Math.max(120, spaceBelow),
      });
      return;
    }
    const maxHeight = Math.max(120, spaceAbove);
    setCoords({
      top: Math.max(pad, r.top - gap - maxHeight),
      left: Math.min(Math.max(pad, left), window.innerWidth - width - pad),
      maxHeight,
    });
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(v => {
      const next = !v;
      if (next) place();
      else setOpenGroup(null);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (open) place();
  }, [openGroup, open]);

  const fire = (e: React.MouseEvent, id: LeadActionId) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
    onAction(id);
  };

  const itemCls =
    'w-full text-left px-3 py-1.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors flex items-center gap-1.5';

  const hidden = new Set(hiddenItems ?? []);
  const mark = (id?: LeadActionId) =>
    currentSection && id && currentSection === id;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onMouseDown={e => e.stopPropagation()}
        className={`relative ${open ? 'z-[210]' : ''} ${compact ? 'p-1' : 'p-2'} rounded-md border border-[#e5e5e5] hover:bg-[#f5f5f5] text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors`}
        title="Lead actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {showAppDot && (
          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${appComplete ? 'bg-emerald-500' : 'bg-red-500'}`} />
        )}
      </button>
      {open && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          className="fixed z-[200] w-[200px] bg-white border border-[#e5e5e5] rounded-lg shadow-xl py-1 overflow-y-auto"
          style={{ top: coords.top, left: coords.left, maxHeight: coords.maxHeight }}
        >
          {MENU.map((entry, i) => {
            if (entry.kind === 'item') {
              if (hidden.has(entry.id)) return null;
              const current = mark(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  onClick={e => fire(e, entry.id)}
                  className={`${itemCls} ${current ? 'font-semibold' : ''}`}
                >
                  <span className="flex-1">{entry.label}</span>
                  {entry.id === 'application' && showAppDot && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${appComplete ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  )}
                  {current && <span className="text-[#1a1a1a] flex-shrink-0">✓</span>}
                </button>
              );
            }
            const visibleItems = entry.items.filter(item => !hidden.has(item.id));
            if (visibleItems.length === 0) return null;
            const groupCurrent = mark(entry.groupId);
            const expanded = !entry.collapse || openGroup === entry.label;
            return (
              <div key={entry.label} className={i > 0 ? 'mt-1 pt-1 border-t border-[#f0f0f0]' : ''}>
                {entry.collapse ? (
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={expanded}
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      setOpenGroup(g => g === entry.label ? null : entry.label);
                    }}
                    className={`${itemCls} ${groupCurrent ? 'font-semibold' : ''}`}
                  >
                    <span className="flex-1">{entry.label}</span>
                    <svg
                      className={`w-3 h-3 text-[#9b9b9b] flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                ) : entry.groupId ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={e => fire(e, entry.groupId!)}
                    className={`w-full text-left px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider hover:text-[#1a1a1a] flex items-center gap-1.5 ${
                      groupCurrent ? 'text-[#1a1a1a]' : 'text-[#9b9b9b]'
                    }`}
                  >
                    <span className="flex-1">{entry.label}</span>
                    {groupCurrent && <span className="text-[#1a1a1a] normal-case tracking-normal">✓</span>}
                  </button>
                ) : (
                  <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9b9b9b]">
                    {entry.label}
                  </p>
                )}
                {expanded && visibleItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={e => fire(e, item.id)}
                    className={itemCls}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
