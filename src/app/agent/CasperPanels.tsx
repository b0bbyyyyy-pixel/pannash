'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '@/lib/sync/usePolling';
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

type PingMsg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  kind: string;
  status: string;
  created_at: string;
};

function pingTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function PingPanel() {
  const [enabled, setEnabled] = useState(false);
  const [activity, setActivity] = useState(false);
  const [phone, setPhone] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [messages, setMessages] = useState<PingMsg[]>([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState('');
  const catchingUp = useRef(false);
  const lastCatchUpId = useRef<string | null>(null);

  const load = useCallback(async (silent = false, recover = false) => {
    const qs = recover ? '?recover=1' : '';
    const res = await fetch(`/api/casper/ping${qs}`, { cache: 'no-store' });
    const d = await res.json();
    setMessages(Array.isArray(d.messages) ? d.messages : []);
    setSetupRequired(!!d.setupRequired);
    if (!silent) {
      setEnabled(!!d.enabled);
      setActivity(!!d.activity);
      setPhone(d.phone || '');
      setSavedPhone(d.phone || '');
    }
    setLoading(false);
    return d as { messages?: PingMsg[] };
  }, []);

  useEffect(() => { load(false, true); }, [load]);

  const pollPing = useCallback(() => { load(true); }, [load]);
  usePolling(pollPing, 15_000, true, false);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.direction !== 'inbound' || catchingUp.current) return;
    if (lastCatchUpId.current === last.id) return;
    lastCatchUpId.current = last.id;
    catchingUp.current = true;
    setReplying(true);
    fetch('/api/casper/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catchUp: true }),
    })
      .then(() => load(true))
      .finally(() => {
        catchingUp.current = false;
        setReplying(false);
      });
  }, [messages, load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setSavedNote('');
    try {
      const res = await fetch('/api/casper/ping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, activity, phone: phone.trim() }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error || 'Could not save');
      else {
        setEnabled(!!d.enabled);
        setActivity(!!d.activity);
        setPhone(d.phone || phone);
        setSavedPhone(d.phone || phone.trim());
        setSavedNote('Saved');
      }
    } finally {
      setSaving(false);
    }
  };

  const send = async (test = false) => {
    const text = draft.trim();
    if (!test && !text) return;
    if (phone.trim() && phone.trim() !== savedPhone) await save();
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/casper/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test ? { test: true } : { body: text }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.reason || d.error || 'Send failed');
      else {
        setDraft('');
        await load(true);
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-12 text-center">Loading ping…</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">Ping</h3>
        <p className="text-[11px] text-gray-400 mb-4">
          Calendar reminders always go to this cell. Chat replies and “needs you” pings follow the toggle below. Lead activity texts are separate.
        </p>
        {setupRequired && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">
            Run <code>add-casper-ping.sql</code> in Supabase so Ping can save the thread.
          </p>
        )}
        <label className="flex items-center justify-between gap-3 mb-3">
          <span className="text-sm text-[#1a1a1a]">Allow Casper to ping me</span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={e => setEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
        </label>
        <label className="flex items-center justify-between gap-3 mb-4">
          <span className="text-sm text-[#1a1a1a]">
            Lead activity updates
            <span className="block text-[11px] text-gray-400 font-normal">Apps and bank statements landing in the CRM</span>
          </span>
          <input
            type="checkbox"
            checked={activity}
            disabled={saving}
            onChange={e => setActivity(e.target.checked)}
            className="rounded border-gray-300"
          />
        </label>
        <label className="block text-[11px] text-gray-500 mb-1">Your cell</label>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setSavedNote(''); }}
            placeholder="(555) 555-5555"
            className="flex-1 text-sm border border-[#e5e5e5] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !phone.trim()}
            className="px-3 py-2 text-xs font-semibold bg-[#1a1a1a] text-white rounded-xl disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => send(true)}
            disabled={sending || !phone.trim()}
            className="px-3 py-2 text-xs font-semibold border border-[#e5e5e5] rounded-xl disabled:opacity-40"
          >
            {sending ? '…' : 'Test ping'}
          </button>
        </div>
        {savedNote && <p className="text-xs text-emerald-600 mt-2">{savedNote}</p>}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5 flex flex-col min-h-[360px]">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Thread with Casper</p>
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] mb-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No pings yet. Send a test or text her from your phone.</p>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] ${msg.direction === 'outbound' ? 'items-start' : 'items-end'} flex flex-col gap-0.5`}>
                  <div className={`px-3 py-2 rounded-2xl text-sm ${
                    msg.direction === 'outbound'
                      ? 'bg-[#f0f0f0] text-[#1a1a1a] rounded-bl-sm'
                      : 'bg-[#1a1a1a] text-white rounded-br-sm'
                  }`}>
                    {msg.body}
                  </div>
                  <span className="text-[10px] text-gray-400 px-1">
                    {msg.direction === 'outbound' ? 'Casper' : 'You'} · {pingTime(msg.created_at)}
                    {msg.kind !== 'chat' ? ` · ${msg.kind.replace('_', ' ')}` : ''}
                  </span>
                </div>
              </div>
            ))
          )}
          {replying && (
            <p className="text-[11px] text-gray-400 px-1">Casper is answering…</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(false); } }}
            placeholder="Text Casper…"
            className="flex-1 text-sm border border-[#e5e5e5] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]"
          />
          <button
            type="button"
            onClick={() => send(false)}
            disabled={sending || !draft.trim()}
            className="px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
