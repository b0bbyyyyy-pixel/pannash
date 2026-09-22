'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TwilioMessagingSidForm({ initialSid }: { initialSid?: string | null }) {
  const [sid, setSid] = useState(initialSid ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/settings/phone/connect', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_service_sid: sid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-purple-100">
      <label className="block text-xs font-medium text-gray-700 mb-1">
        Messaging Service SID (A2P / 10DLC)
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={sid}
          onChange={e => { setSid(e.target.value); setSaved(false); }}
          className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      {saved && <p className="text-xs text-emerald-700 mt-1.5">Saved. New texts will send through this service.</p>}
      <p className="text-[11px] text-gray-500 mt-1.5">
        Twilio Console → Messaging → Services. After approval, send through this SID or carriers drop the texts.
      </p>
    </div>
  );
}
