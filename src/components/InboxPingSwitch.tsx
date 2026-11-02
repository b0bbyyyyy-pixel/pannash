'use client';

import { useEffect, useState, type MouseEvent } from 'react';

/** Compact ping switch — black when on (desktop). Same setting as Messages. */
export default function InboxPingSwitch() {
  const [on, setOn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/casper/ping', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setOn(!!d.inbox))
      .catch(() => {});
  }, []);

  const toggle = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      const res = await fetch('/api/casper/ping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inbox: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setOn(!next);
      else setOn(!!d.inbox);
    } catch {
      setOn(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ping my cell on new texts"
      title="Ping my cell when a lead texts in"
      disabled={saving}
      onClick={toggle}
      className="flex shrink-0 items-center gap-1.5 py-1 disabled:opacity-50"
    >
      <span className="text-[11px] text-[#9b9b9b]">Ping</span>
      <span
        className={`relative block h-[24px] w-[40px] rounded-full transition-colors ${on ? 'bg-[#1a1a1a]' : 'bg-[#e5e5e5]'}`}
      >
        <span
          className={`absolute top-[2px] block h-[20px] w-[20px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
        />
      </span>
    </button>
  );
}
