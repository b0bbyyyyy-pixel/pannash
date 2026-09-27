'use client';

import { useEffect, useState } from 'react';

type Settings = {
  phoneLanding: boolean;
  webPush: boolean;
  smsFallback: boolean;
  personalAlertNumber: string;
  setupRequired?: boolean;
};

const DEFAULTS: Settings = {
  phoneLanding: true,
  webPush: true,
  smsFallback: false,
  personalAlertNumber: '',
};

export default function MobileTextSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/m/settings')
      .then(r => r.json())
      .then(d => {
        setSettings({
          phoneLanding: d.phoneLanding !== false,
          webPush: d.webPush !== false,
          smsFallback: d.smsFallback === true,
          personalAlertNumber: d.personalAlertNumber || '',
          setupRequired: d.setupRequired,
        });
        if (d.setupRequired) setMessage('Run add-mobile-text.sql in Supabase to save these toggles.');
      })
      .catch(() => setMessage('Could not load mobile text settings.'));
  }, []);

  async function save(next: Settings) {
    setSettings(next);
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/m/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) setMessage(data.error || 'Save failed');
      else setMessage('Saved');
    } catch {
      setMessage('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Mobile Text</h2>
        <p className="text-gray-600 text-sm mb-4">
          On a phone, login opens the texting app. Desktop stays the full CRM.
        </p>
        <a
          href="/m/text"
          target="_blank"
          rel="noreferrer"
          className="inline-block bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800"
        >
          Open mobile text app
        </a>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
        <div className="mx-auto w-[390px] h-[844px] rounded-[36px] border border-gray-300 overflow-hidden bg-white shadow-sm">
          <iframe
            title="Mobile text preview"
            src="/m/text"
            className="w-[390px] h-[844px] border-0 bg-white"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Alerts</h2>
        <label className="flex items-center justify-between gap-4 text-sm text-gray-900">
          <span>Enable mobile landing on phones</span>
          <input
            type="checkbox"
            checked={settings.phoneLanding}
            onChange={e => save({ ...settings, phoneLanding: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm text-gray-900">
          <span>Web push alerts for inbound SMS</span>
          <input
            type="checkbox"
            checked={settings.webPush}
            onChange={e => save({ ...settings, webPush: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm text-gray-900">
          <span>SMS fallback alert to my personal number</span>
          <input
            type="checkbox"
            checked={settings.smsFallback}
            onChange={e => save({ ...settings, smsFallback: e.target.checked })}
          />
        </label>
        {settings.smsFallback && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personal alert number</label>
            <input
              value={settings.personalAlertNumber}
              onChange={e => setSettings({ ...settings, personalAlertNumber: e.target.value })}
              onBlur={() => save(settings)}
              placeholder="(555) 555-5555"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-gray-900"
            />
          </div>
        )}
        {saving && <p className="text-sm text-gray-500">Saving…</p>}
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">iPhone</h2>
        <p className="text-sm text-gray-600 mb-4">
          On iPhone: Share → Add to Home Screen to get reply notifications.
        </p>
        <p className="text-sm text-gray-700 font-mono leading-6">
          /m/text<br />
          /m/text/[threadId]<br />
          /m/text/[threadId]/contact
        </p>
      </div>
    </div>
  );
}
