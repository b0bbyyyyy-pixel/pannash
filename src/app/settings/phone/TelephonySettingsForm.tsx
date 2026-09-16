'use client';

import { useState, useEffect } from 'react';

interface Settings {
  sip_uri: string | null;
  wrap_seconds: number;
  record_calls: boolean;
  dry_run: boolean;
  calling_window_start: string;
  calling_window_end: string;
  max_attempts_per_day: number;
  compliance_ack: boolean;
}

export default function TelephonySettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/telephony/settings')
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => setError('Failed to load settings'));
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/telephony/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="text-sm text-gray-500">Loading dialer settings…</div>;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* SIP URI */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1">Desk Phone SIP URI</label>
        <input
          type="text"
          value={settings.sip_uri ?? ''}
          onChange={(e) => set('sip_uri', e.target.value || null)}
          placeholder="sip:desk@yourdomain.sip.twilio.com"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
        <p className="text-xs text-gray-500 mt-1">
          Your desk phone&apos;s address on your Twilio SIP domain. Calls ring this phone first, then dial the lead when you pick up.
        </p>
      </div>

      {/* Dry run */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.dry_run}
          onChange={(e) => set('dry_run', e.target.checked)}
          className="mt-0.5 accent-black"
        />
        <span className="text-sm">
          <span className="font-medium text-gray-900">Dry-run mode</span>
          <span className="block text-xs text-gray-500">
            Logs the would-be call (SIP / From / To) without dialing anyone. Turn off when your SIP phone is registered.
          </span>
        </span>
      </label>

      {/* Record */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.record_calls}
          onChange={(e) => set('record_calls', e.target.checked)}
          className="mt-0.5 accent-black"
        />
        <span className="text-sm">
          <span className="font-medium text-gray-900">Record calls</span>
          <span className="block text-xs text-gray-500">Records from lead answer. Recording link saved to the call log.</span>
        </span>
      </label>

      {/* Calling window + caps */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Calling window start</label>
          <input
            type="time"
            value={settings.calling_window_start}
            onChange={(e) => set('calling_window_start', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Calling window end</label>
          <input
            type="time"
            value={settings.calling_window_end}
            onChange={(e) => set('calling_window_end', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Max attempts / lead / day</label>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.max_attempts_per_day}
            onChange={(e) => set('max_attempts_per_day', parseInt(e.target.value || '3', 10))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Wrap time (seconds)</label>
          <select
            value={settings.wrap_seconds}
            onChange={(e) => set('wrap_seconds', parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
          >
            {[1, 2, 3, 5].map((s) => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
        </div>
      </div>

      {/* Compliance */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.compliance_ack}
          onChange={(e) => set('compliance_ack', e.target.checked)}
          className="mt-0.5 accent-black"
        />
        <span className="text-sm">
          <span className="font-medium text-gray-900">I am responsible for TCPA / DNC compliance</span>
          <span className="block text-xs text-gray-500">
            This is a single-line power dialer, not a compliant predictive dialer.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Dialer Settings'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}
