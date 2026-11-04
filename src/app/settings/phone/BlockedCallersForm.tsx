'use client';

import { useEffect, useState } from 'react';

type Row = { phone: string; display: string; created_at: string };

export default function BlockedCallersForm() {
  const [rows, setRows] = useState<Row[]>([]);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/telephony/block', { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Could not load blocked numbers');
    setRows(d.numbers || []);
  }

  useEffect(() => {
    load().catch(e => setError(e instanceof Error ? e.message : 'Could not load blocked numbers'));
  }, []);

  async function add() {
    const value = phone.trim();
    if (!value) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/telephony/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not block number');
      setPhone('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not block number');
    } finally {
      setSaving(false);
    }
  }

  async function remove(n: string) {
    setError('');
    try {
      const res = await fetch(`/api/telephony/block?phone=${encodeURIComponent(n)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not unblock');
      setRows(prev => prev.filter(r => r.phone !== n));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unblock');
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void add(); }}
          placeholder="(555) 123-4567"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={saving || !phone.trim()}
          className="px-3 py-2 text-sm font-medium border border-[#e5e5e5] rounded-lg hover:border-[#1a1a1a] disabled:opacity-40"
        >
          {saving ? 'Blocking…' : 'Block'}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No blocked numbers yet.</p>
      ) : (
        <div className="divide-y divide-[#f0f0f0]">
          {rows.map(row => (
            <div key={row.phone} className="flex items-center justify-between py-2">
              <span className="text-sm text-[#1a1a1a]">{row.display || row.phone}</span>
              <button
                type="button"
                onClick={() => void remove(row.phone)}
                className="text-xs uppercase tracking-wide text-[#9b9b9b] hover:text-[#1a1a1a]"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
