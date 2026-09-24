'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_CASPER_CAPABILITIES,
  DEFAULT_CASPER_SYSTEM_PROMPT,
  type CasperCapabilities,
} from '@/lib/casper/defaults';

type CasperRun = {
  id: string;
  lead_id: string | null;
  trigger: string;
  status: string;
  thinking: string | null;
  actions: unknown;
  model: string | null;
  input_summary: string | null;
  output_summary: string | null;
  error: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function actionsList(raw: unknown): Array<Record<string, unknown>> {
  return Array.isArray(raw) ? raw.filter(a => a && typeof a === 'object') as Array<Record<string, unknown>> : [];
}

export function ActivityPanel() {
  const [runs, setRuns] = useState<CasperRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/casper/runs?limit=50');
      const json = await res.json();
      setRuns(json.runs || []);
      setError(json.error || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <p className="text-sm text-gray-400 py-12 text-center">Loading activity…</p>;
  }
  if (error && !runs.length) {
    return (
      <p className="text-sm text-gray-500 py-12 text-center px-6">
        Activity log is empty. Run <code className="text-xs">add-casper-brain.sql</code> in Supabase if this is a new install.
      </p>
    );
  }
  if (!runs.length) {
    return <p className="text-sm text-gray-400 py-12 text-center">No Casper runs yet. Inbound SMS will show thinking and actions here.</p>;
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const acts = actionsList(run.actions);
        return (
          <div key={run.id} className="bg-white border border-[#e5e5e5] rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{run.trigger}</span>
                <span className={`text-[10px] font-semibold ${run.status === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {run.status}
                </span>
              </div>
              <span className="text-[10px] text-gray-400">{timeAgo(run.created_at)}</span>
            </div>
            {run.thinking && <p className="text-sm text-[#1a1a1a] mb-2">{run.thinking}</p>}
            {run.output_summary && (
              <p className="text-xs text-gray-600 bg-[#f7f7f7] rounded-xl px-3 py-2 mb-2">{run.output_summary}</p>
            )}
            {run.error && <p className="text-xs text-red-500 mb-2">{run.error}</p>}
            {acts.length > 0 && (
              <ul className="space-y-1">
                {acts.map((a, i) => {
                  const file = String(a.file_name || a.file_path || '');
                  const kind = String(a.type || 'action');
                  return (
                    <li key={i} className="text-[11px] text-gray-500">
                      {kind}
                      {file ? ` · ${file}` : ''}
                      {a.sent === false ? ' · not sent' : ''}
                      {a.sid ? ` · ${String(a.sid).slice(0, 12)}…` : ''}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BrainPanel() {
  const [prompt, setPrompt] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/casper')
      .then(r => r.json())
      .then(d => {
        setPrompt(d.system_prompt || DEFAULT_CASPER_SYSTEM_PROMPT);
        setSavedAt(d.updated_at ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (next: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/casper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: next }),
      });
      const json = await res.json();
      setPrompt(json.system_prompt || next);
      setSavedAt(json.updated_at ?? new Date().toISOString());
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-12 text-center">Loading brain…</p>;

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1a1a1a]">Master brain</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            How Casper speaks on SMS. Saved prompt is used on the next allowed auto-reply.
          </p>
        </div>
        {savedAt && (
          <span className="text-[10px] text-gray-400">Saved {timeAgo(savedAt)}</span>
        )}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={18}
        className="w-full text-sm leading-relaxed border border-[#e5e5e5] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1a1a1a] bg-[#fafafa]"
      />
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => save(prompt)}
          disabled={saving}
          className="px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => { setPrompt(DEFAULT_CASPER_SYSTEM_PROMPT); save(DEFAULT_CASPER_SYSTEM_PROMPT); }}
          disabled={saving}
          className="px-4 py-2 text-xs font-medium text-gray-600 border border-[#e5e5e5] rounded-xl"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

const CAP_ITEMS: { key: keyof CasperCapabilities; label: string; future?: boolean }[] = [
  { key: 'chat_sms', label: 'Chatting (SMS replies)' },
  { key: 'email_application', label: 'Email application to lead' },
  { key: 'upload_docs_to_crm', label: 'Upload docs to CRM', future: true },
  { key: 'submit_deals_waterfall', label: 'Submit deals to lenders (waterfall)', future: true },
  { key: 'propose_deals', label: 'Propose deals', future: true },
];

export function CapabilitiesPanel() {
  const [caps, setCaps] = useState<CasperCapabilities>(DEFAULT_CASPER_CAPABILITIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/casper')
      .then(r => r.json())
      .then(d => setCaps(d.capabilities || DEFAULT_CASPER_CAPABILITIES))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof CasperCapabilities) => {
    const next = { ...caps, [key]: !caps[key] };
    setCaps(next);
    setSaving(true);
    try {
      const res = await fetch('/api/settings/casper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilities: next }),
      });
      const json = await res.json();
      if (json.capabilities) setCaps(json.capabilities);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-12 text-center">Loading capabilities…</p>;

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">Capabilities</h3>
      <p className="text-[11px] text-gray-400 mb-4">Only enabled steps may run. Waterfall / propose / upload persist but do not run yet.</p>
      <div className="space-y-2">
        {CAP_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#fafafa] cursor-pointer">
            <input
              type="checkbox"
              checked={!!caps[item.key]}
              onChange={() => toggle(item.key)}
              disabled={saving}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-[#1a1a1a]">{item.label}</span>
            {item.future && <span className="text-[10px] text-gray-400 uppercase">later</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
