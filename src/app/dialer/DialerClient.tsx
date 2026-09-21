'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { formatDisplay } from '@/lib/dialer/e164';
import { getPhoneLocation } from '@/lib/phoneLocation';
import { useWebPhone } from '@/components/webphone/WebPhone';
import ManualDialPanel from './ManualDialPanel';

const ScheduleEmailModal = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
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

type DialerState = 'loading' | 'ready' | 'on_call' | 'wrap_up' | 'saving' | 'empty';

const LIVE_PHONE = new Set(['connecting', 'ringing', 'in-call']);

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

function LeadInfoOverlay({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      {/* Panel */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] flex-shrink-0">
          <span className="text-xs text-[#6b6b6b] font-medium">Lead Info</span>
          <div className="flex items-center gap-3">
            <a
              href={`/pipeline/${leadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6b6b6b] hover:text-[#1a1a1a] text-xs flex items-center gap-1 transition-colors"
              title="Open in full page"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Full page
            </a>
            <button
              onClick={onClose}
              className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* iframe — reuses the same modal=1 route the pipeline uses */}
        <iframe
          src={`/pipeline/${leadId}?modal=1`}
          className="flex-1 w-full bg-white border-0"
          title="Lead workspace"
        />
      </div>
    </>
  );
}

function LeadCard({
  lead,
  onCall,
  inCall,
  phoneStatus,
  onHangup,
  onEmailSaved,
  onQuickEmail,
}: {
  lead: Lead;
  onCall: () => void;
  inCall?: boolean;
  phoneStatus?: string;
  onHangup?: () => void;
  onEmailSaved: (email: string) => void;
  onQuickEmail: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Derive city/state/timezone from the phone's area code
  const phoneLoc = getPhoneLocation(lead.phone_e164);
  const effectiveTz = lead.timezone || phoneLoc?.timezone || null;

  const [localT, setLocalT] = useState(localTime(effectiveTz));
  const [showOverlay, setShowOverlay] = useState(false);
  const [emailDraft, setEmailDraft] = useState(lead.email || '');
  const [editingEmail, setEditingEmail] = useState(!lead.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    const t = setInterval(() => setLocalT(localTime(effectiveTz)), 30_000);
    return () => clearInterval(t);
  }, [effectiveTz]);

  useEffect(() => {
    setEmailDraft(lead.email || '');
    setEditingEmail(!lead.email);
    setEmailError('');
  }, [lead.id, lead.email]);

  const copyNumber = () => {
    navigator.clipboard.writeText(lead.phone_e164).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveEmail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = emailDraft.trim();
    if (value === (lead.email || '')) {
      setEditingEmail(!!lead.email ? false : true);
      return;
    }
    if (!value || !value.includes('@') || !value.includes('.')) {
      setEmailError('Enter a valid email');
      return;
    }
    setSavingEmail(true);
    setEmailError('');
    try {
      const res = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId: lead.id, field: 'email', value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEmailError(d.error || 'Could not save email');
        return;
      }
      onEmailSaved(value);
      setEditingEmail(false);
    } catch {
      setEmailError('Could not save email');
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-8 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div className="min-w-0 pr-4">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className="text-2xl font-semibold text-[#1a1a1a] leading-tight">{lead.name}</h2>
            {lead.company && (
              <span className="text-sm text-[#6b7280] leading-tight">{lead.company}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
            {editingEmail || !lead.email ? (
              <form onSubmit={saveEmail} className="flex items-center gap-1.5 min-w-0">
                <input
                  type="email"
                  value={emailDraft}
                  autoFocus={editingEmail && !!lead.email}
                  onChange={(e) => { setEmailDraft(e.target.value); setEmailError(''); }}
                  onBlur={() => { void saveEmail(); }}
                  placeholder="Add email…"
                  className="w-56 max-w-full px-2 py-0.5 border border-[#e5e5e5] rounded-md text-sm text-[#1a1a1a] placeholder:text-[#c4c4c4] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingEmail(true)}
                title="Edit email"
                className="text-sm text-[#6b7280] truncate hover:text-[#1a1a1a] transition-colors"
              >
                {lead.email}
              </button>
            )}
            <button
              type="button"
              onClick={onQuickEmail}
              disabled={!lead.email}
              title="Send email"
              className="shrink-0 p-0.5 text-[#9ca3af] hover:text-[#6b7280] disabled:opacity-30 disabled:hover:text-[#9ca3af] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
          {lead.stage && (
            <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-[#f0f0f0] text-[#555]">
              {lead.stage}
            </span>
          )}
        </div>
        <div className="text-right text-xs text-[#9ca3af] space-y-1">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowOverlay(true)}
              title="View lead info"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f4f4f4] hover:bg-[#e8e8e8] text-[#555] hover:text-[#1a1a1a] transition-colors text-[10px] font-medium"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Info
            </button>
            <span>Last called: <span className="text-[#1a1a1a]">{timeAgo(lead.last_called_at)}</span></span>
          </div>
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

      {/* Full lead info overlay */}
      {showOverlay && <LeadInfoOverlay leadId={lead.id} onClose={() => setShowOverlay(false)} />}

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

      {/* Location + local time */}
      {(phoneLoc || localT) && (
        <div className="flex items-center gap-2 text-sm text-[#6b7280] mb-5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {phoneLoc && (
            <span className="text-[#1a1a1a] font-medium">
              {[phoneLoc.city, phoneLoc.state].filter(Boolean).join(', ')}
            </span>
          )}
          {phoneLoc && localT && (
            <span className="text-[#d4d4d4]">·</span>
          )}
          {localT && (
            <span className="text-[#1a1a1a] font-medium">{localT}</span>
          )}
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

      {/* Call button / live status */}
      {inCall ? (
        <div className="space-y-3">
          <div className="w-full py-3 rounded-xl bg-[#f4f4f4] text-[#1a1a1a] text-sm font-medium flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {phoneStatus === 'ringing' && 'Ringing…'}
            {phoneStatus === 'connecting' && 'Connecting…'}
            {phoneStatus === 'in-call' && 'On call'}
            {phoneStatus !== 'ringing' && phoneStatus !== 'connecting' && phoneStatus !== 'in-call' && 'Call in progress'}
          </div>
          {onHangup && (
            <button
              onClick={onHangup}
              className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 active:scale-[0.98] transition-all"
            >
              Hang up
            </button>
          )}
        </div>
      ) : (
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
      )}
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
            <span className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]" />
            Call ended
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

function QueueSidebar({ queue }: { queue: QueuePreview[] }) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1a1a1a]">Next up</h3>
        {queue.length > 0 && (
          <span className="text-xs text-[#9ca3af]">{queue.length} in queue</span>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[#9ca3af]">Queue clear.</p>
      ) : (
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{queue[0].name}</p>
            {queue[0].company && (
              <p className="text-xs text-[#9ca3af] truncate">{queue[0].company}</p>
            )}
          </div>
          {queue[0].last_disposition && (
            <span
              className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full border"
              style={{
                color: dispositionColor(queue[0].last_disposition),
                borderColor: dispositionColor(queue[0].last_disposition) + '40',
                backgroundColor: dispositionColor(queue[0].last_disposition) + '10',
              }}
            >
              {dispositionLabel(queue[0].last_disposition)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onRefresh, queueLen }: { onRefresh: () => void; queueLen: number }) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl p-12 text-center shadow-sm">
      {queueLen > 0 ? (
        <>
          <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">{queueLen} leads ready</h2>
          <p className="text-sm text-[#6b7280] mb-6 max-w-xs mx-auto">
            Hit &ldquo;Check again&rdquo; to load the first lead.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">Queue&apos;s clear</h2>
          <p className="text-sm text-[#6b7280] mb-6 max-w-xs mx-auto">
            No eligible leads right now — load a campaign or check back soon.
          </p>
        </>
      )}
      <button
        onClick={onRefresh}
        className="px-6 py-2.5 rounded-xl border border-[#e5e5e5] text-sm text-[#1a1a1a] hover:bg-[#f4f4f4] transition-colors"
      >
        Check again
      </button>
    </div>
  );
}

// ─── Campaign types ────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  name: string;
  created_at: string;
  total: number;
  touched: number;
  called: number;
}

// ─── Campaign picker modal ─────────────────────────────────────────────────────
function CampaignPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (c: Campaign) => void;
  onClose: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dialer/campaigns')
      .then((r) => r.json())
      .then((d) => { setCampaigns(d.campaigns ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0]">
          <h3 className="text-sm font-bold text-[#1a1a1a]">Load Campaign</h3>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a1a] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-[#9ca3af] text-center py-10">No campaigns found. Upload leads first.</p>
          ) : (
            <ul className="divide-y divide-[#f5f5f5]">
              {campaigns.map((c) => {
                const pct = c.total > 0 ? Math.round((c.called / c.total) * 100) : 0;
                return (
                  <li
                    key={c.id}
                    onClick={() => onSelect(c)}
                    className="px-5 py-3.5 hover:bg-[#fafafa] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-[#1a1a1a]">{c.name}</span>
                      <span className="text-xs text-[#9ca3af]">{c.called}/{c.total} called</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                      <div className="h-full bg-[#1a1a1a] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DialerClient() {
  const [state, setState] = useState<DialerState>('loading');
  const [lead, setLead] = useState<Lead | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuePreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [showCallCount, setShowCallCount] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const initDone = useRef(false);
  const webphone = useWebPhone();

  // Keep listId as a ref so async callbacks always see the latest value
  const listIdRef = useRef<string | null>(null);

  // ── Load initial state ──────────────────────────────────────────────────────
  const loadCurrent = useCallback(async (listId: string | null = null) => {
    try {
      const url = listId ? `/api/dialer/current?listId=${listId}` : '/api/dialer/current';
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setQueue(data.queue ?? []);

      if (data.current) {
        setLead(data.current);
        if (data.activeCall) {
          setCallId(data.activeCall.id);
          setState(LIVE_PHONE.has(webphone.status) ? 'on_call' : 'wrap_up');
        } else {
          setState('ready');
        }
      } else {
        await claimNext(null, listId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setState('empty');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // Restore test mode preference
    try { setTestMode(localStorage.getItem('dialer_test_mode') === '1'); } catch { /* ignore */ }

    // Restore the last loaded campaign (persisted across refreshes)
    let saved: Campaign | null = null;
    try {
      const raw = localStorage.getItem('dialer_active_campaign');
      if (raw) saved = JSON.parse(raw) as Campaign;
    } catch { /* ignore corrupt state */ }

    if (saved?.id) {
      setActiveCampaign(saved);
      listIdRef.current = saved.id;
      loadCurrent(saved.id);
      // Refresh stats (called/total) since the saved copy may be stale
      fetch('/api/dialer/campaigns')
        .then((r) => r.json())
        .then((d) => {
          const fresh = (d.campaigns ?? []).find((c: Campaign) => c.id === saved!.id);
          if (fresh) {
            setActiveCampaign(fresh);
            try { localStorage.setItem('dialer_active_campaign', JSON.stringify(fresh)); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    } else {
      loadCurrent(null);
    }
  }, [loadCurrent]);

  // ── Claim a specific lead by ID (fallback when claimNextLead returns null) ──
  const claimSpecific = async (leadId: string, listId: string | null = listIdRef.current) => {
    setState('loading');
    setError(null);
    try {
      const res = await fetch('/api/dialer/claim-specific', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, listId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load lead');
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

  // ── Claim next lead ─────────────────────────────────────────────────────────
  const claimNext = async (releasePreviousId: string | null, listId: string | null = listIdRef.current) => {
    setState('loading');
    setError(null);
    try {
      const res = await fetch('/api/dialer/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releasePreviousId, listId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load next lead');

      const freshQueue: QueuePreview[] = data.queue ?? [];
      setQueue(freshQueue);

      if (data.current) {
        setLead(data.current);
        setCallId(null);
        setState('ready');
      } else if (freshQueue.length > 0) {
        // claimNextLead returned null but peekQueue has leads —
        // directly claim the first queued lead as a fallback.
        await claimSpecific(freshQueue[0].id, listId);
      } else {
        setLead(null);
        setState('empty');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
      setState('empty');
    }
  };

  // ── Load campaign ────────────────────────────────────────────────────────────
  const handleLoadCampaign = async (campaign: Campaign) => {
    setShowPicker(false);
    setActiveCampaign(campaign);
    listIdRef.current = campaign.id;
    try { localStorage.setItem('dialer_active_campaign', JSON.stringify(campaign)); } catch { /* ignore */ }
    // Release current lead and start fresh with new campaign
    await claimNext(lead?.id ?? null, campaign.id);
  };

  const handleClearCampaign = async () => {
    setActiveCampaign(null);
    listIdRef.current = null;
    try { localStorage.removeItem('dialer_active_campaign'); } catch { /* ignore */ }
    await claimNext(lead?.id ?? null, null);
  };

  // ── Test mode toggle ─────────────────────────────────────────────────────────
  const toggleTestMode = () => {
    setTestMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('dialer_test_mode', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // ── Start call ──────────────────────────────────────────────────────────────
  const handleCall = async () => {
    if (!lead) return;
    // In test mode, skip the real phone dial — just walk through the flow.
    // Otherwise dial through the in-app WebRTC phone (audio in your headset).
    if (!testMode) {
      try {
        await webphone.connect(lead.phone_e164, { name: lead.name });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not start call');
        return;
      }
    }
    try {
      const res = await fetch('/api/dialer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start call');
      setCallId(data.callId);
      setState(testMode ? 'wrap_up' : 'on_call');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error starting call');
    }
  };

  // After hangup, show wrap-up. Stay on the lead card while ringing / on call.
  const wasLiveRef = useRef(false);
  useEffect(() => {
    const live = LIVE_PHONE.has(webphone.status);
    if (live) wasLiveRef.current = true;
    if (state === 'on_call' && wasLiveRef.current && !live && callId) {
      wasLiveRef.current = false;
      setState('wrap_up');
    }
    if (state !== 'on_call') wasLiveRef.current = live;
  }, [webphone.status, state, callId]);

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

      // Bump the campaign's called count so the progress bar updates live
      setActiveCampaign((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, called: Math.min(prev.called + 1, prev.total) };
        try { localStorage.setItem('dialer_active_campaign', JSON.stringify(updated)); } catch { /* ignore */ }
        return updated;
      });

      await claimNext(lead.id);
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
  }, [state, lead, testMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ─────────────────────────────────────────────────────────────────

  const campaignPct = activeCampaign && activeCampaign.total > 0
    ? Math.round((activeCampaign.called / activeCampaign.total) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#1a1a1a]">Dialer</h1>
        <div className="flex items-center gap-3">
          {/* Test mode toggle */}
          <button
            onClick={toggleTestMode}
            title="Test mode — Call skips the real phone dial"
            className="flex items-center gap-1.5 shrink-0"
          >
            <span className={`text-xs ${testMode ? 'text-[#1a1a1a] font-medium' : 'text-[#c4c4c4]'}`}>Test</span>
            <span className={`relative inline-block w-7 h-4 rounded-full transition-colors ${testMode ? 'bg-[#1a1a1a]' : 'bg-[#e5e5e5]'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${testMode ? 'left-3.5' : 'left-0.5'}`} />
            </span>
          </button>
          {activeCampaign && (
            <button
              onClick={() => setShowCallCount((v) => !v)}
              title="Click to toggle call count"
              className="flex items-center gap-2 min-w-0 cursor-pointer"
            >
              <span className="text-sm font-semibold text-[#1a1a1a] truncate max-w-[200px]">{activeCampaign.name}</span>
              <div className="w-24 h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden shrink-0">
                <div className="h-full bg-[#1a1a1a] rounded-full transition-all" style={{ width: `${campaignPct}%` }} />
              </div>
              <span className="text-xs text-[#9ca3af] shrink-0">
                {showCallCount
                  ? `${activeCampaign.called}/${activeCampaign.total} called · ${campaignPct}%`
                  : `${campaignPct}%`}
              </span>
            </button>
          )}
          <button
            onClick={() => setShowPicker(true)}
            className="text-sm font-medium text-[#1a1a1a] hover:text-[#555] transition-colors"
          >
            {activeCampaign ? 'Switch Campaign' : 'Load Campaign'}
          </button>
          {activeCampaign && (
            <button
              onClick={handleClearCampaign}
              className="text-xs text-[#9ca3af] hover:text-[#1a1a1a] transition-colors"
              title="Clear campaign"
            >
              Clear
            </button>
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
            <EmptyState onRefresh={() => claimNext(null)} queueLen={queue.length} />
          ) : (state === 'ready' || state === 'on_call') && lead ? (
            <LeadCard
              lead={lead}
              onCall={handleCall}
              inCall={state === 'on_call'}
              phoneStatus={webphone.status}
              onHangup={webphone.hangup}
              onEmailSaved={(email) => setLead((prev) => prev ? { ...prev, email } : prev)}
              onQuickEmail={() => setShowEmailModal(true)}
            />
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
        <div className="lg:col-span-1 space-y-6">
          <QueueSidebar queue={queue} />
          <ManualDialPanel />
        </div>
      </div>

      {/* Keyboard reference */}
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#ccc]">
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">C</kbd> Call</span>
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">1-7</kbd> Disposition</span>
      </div>

      {/* Campaign picker */}
      {showPicker && (
        <CampaignPickerModal
          onSelect={handleLoadCampaign}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showEmailModal && lead && (
        <ScheduleEmailModal
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            company: lead.company,
          }}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}
