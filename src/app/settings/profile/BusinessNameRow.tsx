'use client';

import { useEffect, useState } from 'react';

export default function BusinessNameRow() {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/business-name', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setName(String(d.business_name || '')))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings/business-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: next, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not update business name');
        return;
      }
      setName(json.business_name || next);
      setOpen(false);
      setPassword('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
          {name || 'Not set'}
        </div>
        <button
          type="button"
          onClick={() => { setOpen(true); setNext(name); setError(''); }}
          className="text-sm text-[#1a1a1a] underline"
        >
          Change
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">Must match the brand registered for your texting number.</p>
      {open && (
        <div className="mt-3 space-y-2 border border-gray-200 rounded-lg p-3">
          <input
            value={next}
            onChange={e => setNext(e.target.value)}
            placeholder="Business name"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Current password"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-3 py-1.5 bg-[#1a1a1a] text-white text-xs rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
