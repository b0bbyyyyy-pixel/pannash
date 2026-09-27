'use client';

import { useState } from 'react';

export default function InboundPhoto({
  messageId,
  index,
  savedAt,
  onSaved,
}: {
  messageId: string;
  index: number;
  savedAt?: string | null;
  onSaved: (savedAt: string) => void;
}) {
  const [saved, setSaved] = useState(savedAt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="overflow-hidden rounded-[18px] bg-[#E9E9EB]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/m/media/${messageId}?i=${index}`}
        alt="Photo"
        className="block max-h-64 w-full object-cover"
      />
      <button
        type="button"
        onClick={save}
        disabled={Boolean(saved) || busy}
        className="block w-full px-3 py-1.5 text-left text-[12px] font-medium text-[#007AFF] disabled:text-[#8E8E93]"
      >
        {saved ? 'In Documents' : busy ? 'Saving…' : 'Save to Documents'}
      </button>
      {error && <p className="px-3 pb-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
