'use client';

import { useState } from 'react';

export default function InboundPhoto({
  messageId,
  index,
  savedAt,
  onSaved,
  type,
  canSave = true,
}: {
  messageId: string;
  index: number;
  savedAt?: string | null;
  onSaved: (savedAt: string) => void;
  type?: string;
  canSave?: boolean;
}) {
  const [saved, setSaved] = useState(savedAt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const src = `/api/m/media/${messageId}?i=${index}`;
  const isPdf = (type || '').toLowerCase().includes('pdf');

  async function save() {
    if (saved || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/m/media/${messageId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save');
        return;
      }
      setSaved(data.savedAt || new Date().toISOString());
      onSaved(data.savedAt || new Date().toISOString());
    } catch {
      setError('Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (isPdf) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-[18px] bg-[#E9E9EB] px-3 py-2 text-[13px] font-medium text-[#1a1a1a]"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[10px] font-semibold tracking-wide">PDF</span>
        Open PDF
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] bg-[#E9E9EB]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Photo"
        className="block max-h-64 w-full object-cover"
      />
      {canSave && (
        <button
          type="button"
          onClick={save}
          disabled={Boolean(saved) || busy}
          className="block w-full px-3 py-1.5 text-left text-[12px] font-medium text-[#007AFF] disabled:text-[#8E8E93]"
        >
          {saved ? 'In Documents' : busy ? 'Saving…' : 'Save to Documents'}
        </button>
      )}
      {error && <p className="px-3 pb-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
