'use client';

import { useEffect, useState } from 'react';

export default function EmailDisplayNameForm({
  mailboxEmail,
  connectionId,
  initialFromName,
}: {
  mailboxEmail?: string | null;
  connectionId?: string | null;
  initialFromName?: string | null;
}) {
  const [fromName, setFromName] = useState(initialFromName || '');
  const [savedName, setSavedName] = useState(initialFromName || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/email-signature', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const name = d.fromName || initialFromName || '';
        setFromName(name);
        setSavedName(name);
      })
      .catch(() => {});
  }, [initialFromName]);

  const previewName = (fromName.trim() || savedName.trim() || 'Bob');
  const previewEmail = mailboxEmail || 'you@yourdomain.com';

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/settings/email-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromName: fromName.trim(), connectionId: connectionId || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Could not save display name');
        return;
      }
      setSavedName(d.fromName || fromName.trim());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-blue-100">
      <label className="block text-xs font-semibold text-gray-800 mb-1">Display name</label>
      <p className="text-[11px] text-gray-500 mb-2">
        Shown as the sender in Gmail/Outlook. Does not change the sending address.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={fromName}
          onChange={e => { setFromName(e.target.value); setSaved(false); }}
          placeholder="Bob"
          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md text-xs font-medium hover:bg-[#333] disabled:opacity-40"
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        Sends as <span className="font-medium text-gray-700">{`"${previewName}" <${previewEmail}>`}</span>
      </p>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
