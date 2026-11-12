'use client';

import { useEffect, useState } from 'react';
import { MERCHANT_STAGES, type MerchantStage } from '@/lib/merchantPortal/stages';

export default function MerchantPortalSettings() {
  const [enabled, setEnabled] = useState(true);
  const [map, setMap] = useState<Record<string, MerchantStage>>({});
  const [portalDomain, setPortalDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings/merchant-portal', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setEnabled(d.enabled !== false);
        setMap(d.map && typeof d.map === 'object' ? d.map : {});
        setPortalDomain(typeof d.portalDomain === 'string' ? d.portalDomain : '');
      })
      .catch(() => {});
  }, []);

  async function save(nextEnabled = enabled, nextMap = map, nextDomain = portalDomain) {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings/merchant-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: nextEnabled, map: nextMap, portalDomain: nextDomain }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || 'Could not save');
        return;
      }
      if (typeof json.portalDomain === 'string') setPortalDomain(json.portalDomain);
      setMessage('Saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Merchant portal</h2>
      <p className="text-sm text-gray-500 mb-4">
        Application links for merchants. Stage mapping controls what they see.
      </p>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            setEnabled(e.target.checked);
            void save(e.target.checked, map, portalDomain);
          }}
        />
        Enabled
      </label>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Portal domain</label>
        <input
          value={portalDomain}
          onChange={e => setPortalDomain(e.target.value)}
          onBlur={() => void save(enabled, map, portalDomain)}
          placeholder="https://"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-gray-500">
          Full https origin, no trailing slash. Leave blank to use the app URL.
        </p>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {Object.entries(map).map(([status, stage]) => (
          <div key={status} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">{status}</span>
            <select
              value={stage}
              onChange={e => {
                const next = { ...map, [status]: e.target.value as MerchantStage };
                setMap(next);
                void save(enabled, next, portalDomain);
              }}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            >
              {MERCHANT_STAGES.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">{saving ? 'Saving…' : message}</p>
    </div>
  );
}
