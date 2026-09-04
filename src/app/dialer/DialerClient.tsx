'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDisplay } from '@/lib/dialer/e164';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  company: string | null;
  phone_e164: string;
  timezone: string | null;
  last_disposition: string | null;
  last_called_at: string | null;
  last_call_notes: string | null;
  notes: string | null;
  stage: string | null;
  month_key: string | null;
}

interface QueuePreview {
  id: string;
  name: string;
  company: string | null;
  phone_e164: string;
  last_disposition: string | null;
}

interface DialerCall {
  id: string;
  lead_id: string;
  lead_name: string;
  to_number: string;
  started_at: string;
  disposition: string | null;
  notes: string | null;
  callback_at: string | null;
}

type DialerState = 'loading' | 'ready' | 'wrap_up' | 'saving' | 'empty';

const DISPOSITIONS = [
  { key: 'connected',  label: 'Connected',   color: '#16a34a', shortcut: '1' },
  { key: 'voicemail',  label: 'Voicemail',   color: '#2563eb', shortcut: '2' },
  { key: 'no_answer',  label: 'No Answer',   color: '#6b7280', shortcut: '3' },
  { key: 'busy',       label: 'Busy',        color: '#d97706', shortcut: '4' },
  { key: 'bad_number', label: 'Bad Number',  color: '#dc2626', shortcut: '5' },
  { key: 'dnc',        label: 'DNC',         color: '#1a1a1a', shortcut: '6' },
  { key: 'callback',   label: 'Callback',    color: '#7c3aed', shortcut: '7' },
] as const;

type DispositionKey = typeof DISPOSITIONS[number]['key'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localTime(timezone: string | null): string {
  const tz = timezone || 'America/New_York';
  try {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    }) + ' ' + new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  } catch {
    return '';
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function dispositionLabel(key: string | null): string {
  if (!key) return '—';
  return DISPOSITIONS.find((d) => d.key === key)?.label ?? key;
}

function dispositionColor(key: string | null): string {
  if (!key) return '#9ca3af';
  return DISPOSITIONS.find((d) => d.key === key)?.color ?? '#6b7280';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onCall,
}: {
  lead: Lead;
  onCall: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [localT, setLocalT] = useState(localTime(lead.timezone));

  useEffect(() => {
    const t = setInterval(() => setLocalT(localTime(lead.timezone)), 30_000);
    return () => clearInterval(t);
  }, [lead.timezone]);

  const copyNumber = () => {
    navigator.clipboard.writeText(lead.phone_e164).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-8 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1a1a1a] leading-tight">{lead.name}</h2>
          {lead.company && (
            <p className="text-sm text-[#6b7280] mt-0.5">{lead.company}</p>
          )}
          {lead.stage && (
            <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-[#f0f0f0] text-[#555]">
              {lead.stage}
            </span>
          )}
        </div>
        <div className="text-right text-xs text-[#9ca3af] space-y-1">
          <div>Last called: <span className="text-[#1a1a1a]">{timeAgo(lead.last_called_at)}</span></div>
          {lead.last_disposition && (
            <div>
              Last result:{' '}
              <span style={{ color: dispositionColor(lead.last_disposition) }}>
                {dispositionLabel(lead.last_disposition)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Phone */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-[#f4f4f4] rounded-xl px-4 py-3 flex-1">
          <svg className="w-4 h-4 text-[#6b7280] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
          </svg>
          <a
            href={`tel:${lead.phone_e164}`}
            className="text-[#1a1a1a] font-mono text-lg hover:text-blue-600 transition-colors"
          >
            {formatDisplay(lead.phone_e164)}
          </a>
        </div>
        <button
          onClick={copyNumber}
          className="p-3 rounded-xl border border-[#e5e5e5] hover:bg-[#f4f4f4] text-[#6b7280] hover:text-[#1a1a1a] transition-colors"
          title="Copy number"
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Local time */}
      {localT && (
        <div className="flex items-center gap-2 text-sm text-[#6b7280] mb-5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Their local time: <span className="text-[#1a1a1a] font-medium">{localT}</span>
        </div>
      )}

      {/* Last call notes */}
      {lead.last_call_notes && (
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3 mb-5 text-sm text-[#92400e]">
          <span className="font-medium">Last note:</span> {lead.last_call_notes}
        </div>
      )}

      {/* Lead notes */}
      {lead.notes && (
        <div className="bg-[#f9f9f9] rounded-xl px-4 py-3 mb-6 text-sm text-[#6b7280]">
          {lead.notes}
        </div>
      )}

      {/* Call button */}
      <button
        onClick={onCall}
        className="w-full py-4 rounded-xl bg-[#1a1a1a] text-white text-base font-medium hover:bg-[#333] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
        </svg>
        Call {lead.name.split(' ')[0]}
        <span className="text-[#888] text-xs ml-1">[C]</span>
      </button>
    </div>
  );
}

function WrapUpCard({
  lead,
  callId,
  onSave,
  saving,
}: {
  lead: Lead;
  callId: string;
  onSave: (disposition: DispositionKey, notes: string, callbackAt: string) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<DispositionKey | null>(null);
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');

  // Keyboard shortcuts for dispositions
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const d = DISPOSITIONS.find((d) => d.shortcut === e.key);
      if (d) setSelected(d.key as DispositionKey);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSave = () => {
    if (!selected) return;
    if (selected === 'callback' && !callbackAt) return;
    onSave(selected, notes, callbackAt);
  };

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-8 shadow-sm">
      {/* Who we just called */}
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center text-white text-sm font-semibold shrink-0">
          {lead.name[0]}
        </div>
        <div>
          <p className="text-sm text-[#6b7280]">Just called</p>
          <p className="font-semibold text-[#1a1a1a]">{lead.name} · {formatDisplay(lead.phone_e164)}</p>
        </div>
        <div className="ml-auto">
          <span className="inline-flex items-center gap-1.5 text-xs text-[#6b7280] bg-[#f4f4f4] px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Call in progress
          </span>
        </div>
      </div>

      <p className="text-sm font-medium text-[#1a1a1a] mb-3">How did it go?</p>

      {/* Disposition grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {DISPOSITIONS.map((d) => (
          <button
            key={d.key}
            onClick={() => setSelected(d.key as DispositionKey)}
            className={`relative flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-sm font-medium transition-all ${
              selected === d.key
                ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white shadow'
                : 'border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#1a1a1a] hover:bg-[#f9f9f9]'
            }`}
          >
            <span>{d.label}</span>
            <span className={`text-[10px] ${selected === d.key ? 'text-[#aaa]' : 'text-[#ccc]'}`}>[{d.shortcut}]</span>
          </button>
        ))}
      </div>

      {/* Callback datetime */}
      {selected === 'callback' && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#6b7280] mb-1.5">Callback date & time</label>
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"
          />
        </div>
      )}

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-[#6b7280] mb-1.5">Call notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened? Objections, next steps..."
          rows={3}
          className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#ccc] resize-none focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!selected || saving || (selected === 'callback' && !callbackAt)}
        className="w-full py-3.5 rounded-xl bg-[#1a1a1a] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#333] active:scale-[0.98] transition-all"
      >
        {saving ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Saving…
          </>
        ) : (
          'Save & next lead →'
        )}
      </button>
    </div>
  );
}

function QueueSidebar({
  queue,
  todayCalls,
}: {
  queue: QueuePreview[];
  todayCalls: DialerCall[];
}) {
  return (
    <div className="space-y-6">
      {/* Next up */}
      <div className="bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#f0f0f0]">
          <h3 className="text-sm font-semibold text-[#1a1a1a]">
            Next up{' '}
            <span className="text-[#9ca3af] font-normal">({queue.length})</span>
          </h3>
        </div>
        {queue.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[#9ca3af]">Queue clear for now.</p>
        ) : (
          <ul className="divide-y divide-[#f0f0f0]">
            {queue.map((lead, i) => (
              <li key={lead.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-xs text-[#ccc] w-4 text-right shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1a1a1a] truncate">{lead.name}</p>
                  {lead.company && (
                    <p className="text-xs text-[#9ca3af] truncate">{lead.company}</p>
                  )}
                </div>
                {lead.last_disposition && (
                  <span
                    className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full border"
                    style={{
                      color: dispositionColor(lead.last_disposition),
                      borderColor: dispositionColor(lead.last_disposition) + '40',
                      backgroundColor: dispositionColor(lead.last_disposition) + '10',
                    }}
                  >
                    {dispositionLabel(lead.last_disposition)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Today's log */}
      <div className="bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#f0f0f0]">
          <h3 className="text-sm font-semibold text-[#1a1a1a]">
            Today{' '}
            <span className="text-[#9ca3af] font-normal">({todayCalls.length} calls)</span>
          </h3>
        </div>
        {todayCalls.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[#9ca3af]">No calls yet today.</p>
        ) : (
          <ul className="divide-y divide-[#f0f0f0] max-h-72 overflow-y-auto">
            {todayCalls.map((call) => (
              <li key={call.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#1a1a1a] truncate">{call.lead_name}</p>
                  <p className="text-xs text-[#9ca3af] ml-2 shrink-0">
                    {new Date(call.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {call.disposition && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full border"
                    style={{
                      color: dispositionColor(call.disposition),
                      borderColor: dispositionColor(call.disposition) + '40',
                      backgroundColor: dispositionColor(call.disposition) + '10',
                    }}
                  >
                    {dispositionLabel(call.disposition)}
                  </span>
                )}
                {call.notes && (
                  <p className="text-xs text-[#9ca3af] mt-1 line-clamp-1">{call.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-12 text-center shadow-sm">
      <div className="text-5xl mb-4">☕</div>
      <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">Queue's clear</h2>
      <p className="text-sm text-[#6b7280] mb-6 max-w-xs mx-auto">
        No eligible leads right now — everyone's in a call-back window or outside business hours.
      </p>
      <button
        onClick={onRefresh}
        className="px-6 py-2.5 rounded-xl border border-[#e5e5e5] text-sm text-[#1a1a1a] hover:bg-[#f4f4f4] transition-colors"
      >
        Check again
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DialerClient() {
  const [state, setState] = useState<DialerState>('loading');
  const [lead, setLead] = useState<Lead | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuePreview[]>([]);
  const [todayCalls, setTodayCalls] = useState<DialerCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ connected: 0, total: 0 });
  const initDone = useRef(false);

  // ── Load initial state ──────────────────────────────────────────────────────
  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/dialer/current');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setQueue(data.queue ?? []);
      setTodayCalls(data.todayCalls ?? []);

      const calls: DialerCall[] = data.todayCalls ?? [];
      setStats({
        total: calls.length,
        connected: calls.filter((c: DialerCall) => c.disposition === 'connected').length,
      });

      if (data.current) {
        setLead(data.current);
        if (data.activeCall) {
          // There was a call started but no disposition yet — resume wrap-up
          setCallId(data.activeCall.id);
          setState('wrap_up');
        } else {
          setState('ready');
        }
      } else {
        // No current lock — claim next
        await claimNext(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setState('empty');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initDone.current) { initDone.current = true; loadCurrent(); }
  }, [loadCurrent]);

  // ── Claim next lead ─────────────────────────────────────────────────────────
  const claimNext = async (releasePreviousId: string | null) => {
    setState('loading');
    setError(null);
    try {
      const res = await fetch('/api/dialer/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releasePreviousId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load next lead');

      setQueue(data.queue ?? []);

      if (data.current) {
        setLead(data.current);
        setCallId(null);
        setState('ready');
      } else {
        setLead(null);
        setState('empty');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
      setState('empty');
    }
  };

  // ── Start call ──────────────────────────────────────────────────────────────
  const handleCall = async () => {
    if (!lead) return;

    // Open the dialer immediately
    window.open(`tel:${lead.phone_e164}`, '_self');

    try {
      const res = await fetch('/api/dialer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start call');
      setCallId(data.callId);
      setState('wrap_up');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error starting call');
    }
  };

  // ── Save disposition ────────────────────────────────────────────────────────
  const handleDisposition = async (
    disposition: DispositionKey,
    notes: string,
    callbackAt: string
  ) => {
    if (!lead || !callId) return;
    setState('saving');

    try {
      const res = await fetch('/api/dialer/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          leadId: lead.id,
          disposition,
          notes: notes || undefined,
          callbackAt: callbackAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');

      // Refresh today's calls then go to next
      await claimNext(lead.id);
      // Refresh today's log in background
      fetch('/api/dialer/current').then((r) => r.json()).then((d) => {
        setTodayCalls(d.todayCalls ?? []);
        const calls: DialerCall[] = d.todayCalls ?? [];
        setStats({
          total: calls.length,
          connected: calls.filter((c: DialerCall) => c.disposition === 'connected').length,
        });
      }).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error saving disposition');
      setState('wrap_up');
    }
  };

  // ── Keyboard shortcut: C = call (in ready state) ────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key.toLowerCase() === 'c' && state === 'ready') handleCall();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, lead]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#1a1a1a]">Power Dialer</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">Work your queue. Every call counts.</p>
        </div>

        {/* Today's stats */}
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-2xl font-semibold text-[#1a1a1a]">{stats.total}</p>
            <p className="text-xs text-[#9ca3af]">calls today</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-green-600">{stats.connected}</p>
            <p className="text-xs text-[#9ca3af]">connected</p>
          </div>
          {stats.total > 0 && (
            <div>
              <p className="text-2xl font-semibold text-[#1a1a1a]">
                {Math.round((stats.connected / stats.total) * 100)}%
              </p>
              <p className="text-xs text-[#9ca3af]">connect rate</p>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: lead card / empty / loading */}
        <div className="lg:col-span-2">
          {state === 'loading' || state === 'saving' ? (
            <div className="bg-white border border-[#e5e5e5] rounded-2xl p-12 flex flex-col items-center justify-center shadow-sm">
              <div className="w-8 h-8 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin mb-4" />
              <p className="text-sm text-[#9ca3af]">
                {state === 'saving' ? 'Saving disposition…' : 'Loading next lead…'}
              </p>
            </div>
          ) : state === 'empty' ? (
            <EmptyState onRefresh={() => claimNext(null)} />
          ) : state === 'ready' && lead ? (
            <LeadCard lead={lead} onCall={handleCall} />
          ) : state === 'wrap_up' && lead && callId ? (
            <WrapUpCard
              lead={lead}
              callId={callId}
              onSave={handleDisposition}
              saving={false}
            />
          ) : null}
        </div>

        {/* Right: sidebar */}
        <div className="lg:col-span-1">
          <QueueSidebar queue={queue} todayCalls={todayCalls} />
        </div>
      </div>

      {/* Keyboard reference */}
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#ccc]">
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">C</kbd> Call</span>
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">1-7</kbd> Disposition</span>
      </div>
    </div>
  );
}
