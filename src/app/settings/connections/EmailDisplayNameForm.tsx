'use client';

import { useState } from 'react';

export default function EmailDisplayNameForm({
  mailboxEmail,
  connectionId,
  initialFromName,
  initialSignature,
  isPreferred,
}: {
  mailboxEmail?: string | null;
  connectionId?: string | null;
  initialFromName?: string | null;
  initialSignature?: string | null;
  isPreferred?: boolean;
}) {
  const [fromName, setFromName] = useState(initialFromName || '');
  const [savedName, setSavedName] = useState(initialFromName || '');
  const [signature, setSignature] = useState(initialSignature || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preferred, setPreferred] = useState(!!isPreferred);
  const [error, setError] = useState('');

  const previewName = (fromName.trim() || savedName.trim() || 'Bob');
  const previewEmail = mailboxEmail || 'you@yourdomain.com';

  const save = async (makePreferred = false) => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/settings/email-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fromName: fromName.trim(),
          signature,
          connectionId: connectionId || undefined,
          preferred: makePreferred || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Could not save sender');
        return;
      }
      setSavedName(d.fromName || fromName.trim());
      setSaved(true);
      if (makePreferred) setPreferred(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-blue-100 space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-800 mb-1">Display name</label>
        <p className="text-[11px] text-gray-500 mb-2">
          Shown as the sender in Gmail/Outlook. Does not change the sending address.
        </p>
        <input
          type="text"
          value={fromName}
          onChange={e => { setFromName(e.target.value); setSaved(false); }}
          placeholder="Bob"
          className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
        />
        <p className="mt-1.5 text-[11px] text-gray-500">
          Sends as <span className="font-medium text-gray-700">{`"${previewName}" <${previewEmail}>`}</span>
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-800 mb-1">Signature for this email</label>
        <p className="text-[11px] text-gray-500 mb-2">
          Added to the bottom of emails sent from this address.
        </p>
        <textarea
          value={signature}
          onChange={e => { setSignature(e.target.value); setSaved(false); }}
          rows={4}
          placeholder={"Bobby Gulinello\nAmerican Business Funding\n631-892-2787"}
          className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={saving}
          className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md text-xs font-medium hover:bg-[#333] disabled:opacity-40"
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
        {connectionId ? (
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving || preferred}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-40"
          >
            {preferred ? 'Default send-from' : 'Make default send-from'}
          </button>
        ) : null}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
