'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PortalNeed } from '@/lib/merchantPortal/mask';

export default function MerchantPortalPanel({
  leadId,
  onStatusChange,
}: {
  leadId: string;
  onStatusChange?: (status: string) => void;
}) {
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const [status, setStatus] = useState('none');
  const [lastViewedAt, setLastViewedAt] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [needs, setNeeds] = useState<PortalNeed[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/merchant-portal?leadId=${encodeURIComponent(leadId)}`, { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const next = json.status || 'none';
    setStatus(next);
    setLastViewedAt(json.lastViewedAt || null);
    setSmsConsent(!!json.smsConsent);
    setNeeds(Array.isArray(json.needs) ? json.needs : []);
    onStatusChangeRef.current?.(next);
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: 'send' | 'rotate' | 'revoke') {
    setBusy(action);
    setMessage('');
    try {
      const res = await fetch('/api/crm/merchant-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId, action, sms: smsConsent }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || 'Could not update portal');
        return;
      }
      if (action === 'rotate' && json.url) {
        await navigator.clipboard.writeText(json.url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      if (action === 'send') setMessage('Link sent');
      await load();
    } finally {
      setBusy('');
    }
  }

  async function saveNeeds(next: PortalNeed[]) {
    setNeeds(next);
    await fetch('/api/crm/merchant-portal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ leadId, needs: next }),
    });
  }

  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Merchant portal</h3>
          <p className="text-xs text-gray-500">
            {status}
            {lastViewedAt ? ` · last viewed ${new Date(lastViewedAt).toLocaleDateString()}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act('send')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'send' ? 'Sending…' : smsConsent ? 'Send new link (email / SMS)' : 'Send new link (email)'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act('rotate')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {copied ? 'Copied' : busy === 'rotate' ? 'Copying…' : 'Copy new link'}
        </button>
        <button
          type="button"
          disabled={!!busy || status === 'revoked' || status === 'none'}
          onClick={() => void act('revoke')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-gray-500">{message}</p>}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-gray-700">What we need from them</p>
        <ul className="space-y-1.5">
          {needs.map(need => (
            <li key={need.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={need.done}
                onChange={e => {
                  const next = needs.map(n => n.id === need.id
                    ? { ...n, done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : null }
                    : n);
                  void saveNeeds(next);
                }}
              />
              <span className={need.done ? 'text-gray-400 line-through' : 'text-gray-800'}>{need.label}</span>
              <button
                type="button"
                onClick={() => void saveNeeds(needs.filter(n => n.id !== need.id))}
                className="ml-auto text-xs text-gray-400 hover:text-gray-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Add a document"
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              const text = label.trim();
              if (!text) return;
              const next = [...needs, { id: `need_${Date.now()}`, label: text, done: false }];
              setLabel('');
              void saveNeeds(next);
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
