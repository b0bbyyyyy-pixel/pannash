'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { formatDisplay } from '@/lib/dialer/e164';
import { getPhoneLocation } from '@/lib/phoneLocation';
import ManualDialPanel from './ManualDialPanel';
import { useDialerSession } from './useDialerSession';

const ScheduleEmailModal = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });
const QuickTextPopup = dynamic(() => import('@/components/QuickTextPopup'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Lead {
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
  lead_status: string | null;
  month_key: string | null;
  list_id?: string | null;
  in_pipeline?: boolean | null;
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

// The only 3 outcomes on this card — keys 1-3
const DISPOSITIONS = [
  { key: 'pipeline',  label: 'Pipeline',  shortcut: '1' },
  { key: 'dnc',       label: 'DNC',       shortcut: '2' },
  { key: 'no_answer', label: 'No Answer', shortcut: '3' },
] as const;

type TileKey = typeof DISPOSITIONS[number]['key'];
type DispositionKey = 'prospect' | 'new_lead' | 'dnc' | 'no_answer';
type PipelineChoice = 'Prospect' | 'New Lead';

// Full label/color map — still needed to display historical last_disposition values
const DISPOSITION_META: Record<string, { label: string; color: string }> = {
  connected:  { label: 'Connected',  color: '#16a34a' },
  voicemail:  { label: 'Voicemail',  color: '#2563eb' },
  no_answer:  { label: 'No Answer',  color: '#6b7280' },
  busy:       { label: 'Busy',       color: '#d97706' },
  bad_number: { label: 'Bad Number', color: '#dc2626' },
  dnc:        { label: 'DNC',        color: '#1a1a1a' },
  callback:   { label: 'Callback',   color: '#7c3aed' },
  prospect:   { label: 'Prospect',   color: '#16a34a' },
  new_lead:   { label: 'New Lead',   color: '#0369a1' },
  pipeline:   { label: 'Pipeline',   color: '#16a34a' },
};

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
  return DISPOSITION_META[key]?.label ?? key;
}

function dispositionColor(key: string | null): string {
  if (!key) return '#9ca3af';
  return DISPOSITION_META[key]?.color ?? '#6b7280';
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

type CardView = 'idle' | 'on_call' | 'wrap';

export function DialerCard({
  lead,
  view,
  onCall,
  phoneStatus,
  onHangup,
  onSave,
  saving,
  onEmailSaved,
  onQuickEmail,
  className = '',
  compact = false,
}: {
  lead: Lead;
  view: CardView;
  onCall: () => void;
  phoneStatus?: string;
  onHangup?: () => void;
  onSave: (disposition: DispositionKey, notes: string) => void;
  saving: boolean;
  onEmailSaved: (email: string) => void;
  onQuickEmail: () => void;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  // Derive city/state/timezone from the phone's area code
  const phoneLoc = getPhoneLocation(lead.phone_e164);
  const effectiveTz = lead.timezone || phoneLoc?.timezone || null;

  const [localT, setLocalT] = useState(localTime(effectiveTz));
  const [showOverlay, setShowOverlay] = useState(false);
  const [emailDraft, setEmailDraft] = useState(lead.email || '');
  const [editingEmail, setEditingEmail] = useState(!lead.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Wrap-up state lives here so a disposition punched during the call
  // survives the swap into the wrap view (same card, content swaps in place)
  const [selected, setSelected] = useState<TileKey | null>(null);
  const [pipelineChoice, setPipelineChoice] = useState<PipelineChoice | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const t = setInterval(() => setLocalT(localTime(effectiveTz)), 30_000);
    return () => clearInterval(t);
  }, [effectiveTz]);

  useEffect(() => {
    setEmailDraft(lead.email || '');
    setEditingEmail(!lead.email);
    setEmailError('');
  }, [lead.id, lead.email]);

  // New lead → clear the wrap-up form
  useEffect(() => {
    setSelected(null);
    setPipelineChoice(null);
    setNotes('');
  }, [lead.id]);

  const pickTile = (key: TileKey) => {
    setSelected(key);
    if (key !== 'pipeline') setPipelineChoice(null);
  };

  const handleSave = useCallback(() => {
    if (!selected || saving) return;
    if (selected === 'pipeline') {
      if (!pipelineChoice) return;
      onSave(pipelineChoice === 'Prospect' ? 'prospect' : 'new_lead', notes);
      return;
    }
    onSave(selected, notes);
  }, [selected, pipelineChoice, saving, notes, onSave]);

  // Keyboard: 1-3 pick a disposition (on call or wrap), N / Enter saves on wrap.
  // Ignored while typing in inputs / notes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (view === 'on_call' || view === 'wrap') {
        const d = DISPOSITIONS.find((d) => d.shortcut === e.key);
        if (d) { pickTile(d.key); return; }
      }
      if (view === 'wrap' && (e.key.toLowerCase() === 'n' || (e.key === 'Enter' && tag !== 'BUTTON'))) {
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, handleSave]);

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

  // Gray status pill — same on idle + wrap. Light lives inside it.
  // Ready → In Progress → Connected → Call Ended → Ready
  const statusMeta =
    view === 'wrap'
      ? { label: 'Call Ended', live: false }
      : view === 'on_call' && phoneStatus === 'in-call'
        ? { label: 'Connected', live: true }
        : view === 'on_call'
          ? { label: 'In Progress', live: true }
          : { label: 'Ready', live: false };

  const statusPill = (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#6b7280] bg-[#f4f4f4] px-3 py-1.5 rounded-full shrink-0">
      <span
        className={`w-2 h-2 rounded-full ${statusMeta.live ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
      />
      {statusMeta.label}
    </span>
  );

  const canSave = !!selected && !saving && (selected !== 'pipeline' || !!pipelineChoice);

  const pillClass = (active: boolean) =>
    `flex-1 border font-medium transition-all whitespace-nowrap ${
      compact ? 'rounded-none py-1 px-0.5 text-[10px] -ml-px first:ml-0' : 'rounded-xl h-full text-sm'
    } ${
      active
        ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
        : 'border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#1a1a1a] hover:bg-[#f9f9f9]'
    }`;

  // ── ONE CARD: idle / on call / wrap ─────────────────────────────────────────
  return (
    <div className={`bg-white border border-[#e5e5e5] rounded-2xl p-8 shadow-sm ${className}`}>
      {/* Header row */}
      <div className={`flex items-start justify-between ${compact ? 'mb-3' : 'mb-6'}`}>
        <div className={`min-w-0 ${compact ? 'pr-2' : 'pr-4'}`}>
          <div className={`flex items-baseline flex-wrap ${compact ? 'gap-1.5' : 'gap-2.5'}`}>
            <button
              type="button"
              onClick={() => setShowOverlay(true)}
              title="View lead info"
              className={`${compact ? 'text-base' : 'text-2xl'} font-semibold text-[#1a1a1a] leading-tight hover:underline text-left`}
            >
              {lead.name}
            </button>
            {lead.company && (
              <button
                type="button"
                onClick={() => setShowOverlay(true)}
                title="View lead info"
                className={`${compact ? 'text-xs' : 'text-sm'} text-[#6b7280] leading-tight hover:underline hover:text-[#1a1a1a] text-left`}
              >
                {lead.company}
              </button>
            )}
          </div>
          <div className={`flex items-center gap-1.5 min-w-0 ${compact ? 'mt-0.5' : 'mt-1.5'}`}>
            {editingEmail || !lead.email ? (
              <form onSubmit={saveEmail} className="flex items-center gap-1.5 min-w-0">
                <input
                  type="email"
                  value={emailDraft}
                  autoFocus={editingEmail && !!lead.email}
                  onChange={(e) => { setEmailDraft(e.target.value); setEmailError(''); }}
                  onBlur={() => { void saveEmail(); }}
                  placeholder="Add email"
                  className={`w-56 max-w-full bg-transparent border-0 p-0 ${compact ? 'text-xs' : 'text-sm'} text-[#1a1a1a] placeholder:text-[#c4c4c4] focus:outline-none`}
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingEmail(true)}
                title="Edit email"
                className={`${compact ? 'text-xs' : 'text-sm'} text-[#6b7280] truncate hover:text-[#1a1a1a] transition-colors`}
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
          {lead.lead_status === 'Prospect' && (
            <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-[#f0f0f0] text-[#555]">
              Prospect
            </span>
          )}
        </div>
        <div className="text-right text-xs text-[#9ca3af] space-y-1.5">
          <div className="flex justify-end">{statusPill}</div>
          <div>
            Last called: <span className="text-[#1a1a1a]">{timeAgo(lead.last_called_at)}</span>
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

      {/* Phone (half width) + city / state / local time + Text */}
      <div className={`flex items-center ${compact ? 'mb-3 gap-2' : 'mb-6 gap-3'}`}>
        {!compact && (
        <div className="flex items-center gap-2 min-w-0 w-1/2">
          <div className="flex items-center gap-2 bg-[#f4f4f4] rounded-xl px-3 py-2 min-w-0 flex-1">
            <svg className="w-3.5 h-3.5 text-[#6b7280] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
            </svg>
            <a
              href={`tel:${lead.phone_e164}`}
              className="text-[#1a1a1a] font-mono text-sm hover:text-blue-600 transition-colors truncate"
            >
              {formatDisplay(lead.phone_e164)}
            </a>
          </div>
          <button
            onClick={copyNumber}
            className="p-2 rounded-xl border border-[#e5e5e5] hover:bg-[#f4f4f4] text-[#6b7280] hover:text-[#1a1a1a] transition-colors shrink-0"
            title="Copy number"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
        )}
        <div className={`flex items-center gap-2 text-[#6b7280] min-w-0 flex-1 ${compact ? 'text-[11px]' : 'text-sm'}`}>
          {(phoneLoc || localT) && (
            <>
              <svg className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {phoneLoc && (
                <span className="text-[#1a1a1a] font-medium truncate">
                  {[phoneLoc.city, phoneLoc.state].filter(Boolean).join(', ')}
                </span>
              )}
              {phoneLoc && localT && (
                <span className="text-[#d4d4d4]">·</span>
              )}
              {localT && (
                <span className="text-[#1a1a1a] font-medium truncate">{localT}</span>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowText(true)}
          className={`shrink-0 font-medium text-[#1a1a1a] hover:underline ${compact ? 'text-[11px]' : 'text-sm'}`}
        >
          Text
        </button>
      </div>

      {showText && (
        <QuickTextPopup
          lead={{
            id: lead.id,
            name: lead.name,
            company: lead.company,
            list_id: lead.list_id,
            lead_status: lead.lead_status,
            in_pipeline: lead.in_pipeline,
          }}
          onClose={() => setShowText(false)}
        />
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

      {/* Footer: Call → Ringing/Hang up → 3 outcomes + Save & next */}
      {view === 'wrap' ? (
        <div>
          {selected === 'pipeline' && (
            <div className={`flex items-center mb-2 ${compact ? 'gap-0' : 'gap-2'}`}>
              {(['Prospect', 'New Lead'] as const).map((choice) => (
                <button
                  key={choice}
                  onClick={() => setPipelineChoice(choice)}
                  className={`flex-1 border font-medium transition-all ${
                    compact ? 'rounded-none py-1 text-xs -ml-px first:ml-0' : 'rounded-xl py-2 text-sm'
                  } ${
                    pipelineChoice === choice
                      ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
                      : 'border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#1a1a1a] hover:bg-[#f9f9f9]'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
          <div className={`flex items-stretch ${compact ? 'gap-0' : 'gap-2 h-14'}`}>
            <div className={`flex flex-1 min-w-0 ${compact ? 'gap-0' : 'gap-2'}`}>
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => pickTile(d.key)}
                  className={pillClass(selected === d.key)}
                >
                  {compact && d.key === 'no_answer' ? 'No Ans.' : d.label}
                  <span className={`${compact ? 'ml-0.5 text-[9px]' : 'ml-1 text-[10px]'} ${selected === d.key ? 'text-[#aaa]' : 'text-[#ccc]'}`}>[{d.shortcut}]</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`shrink-0 bg-[#1a1a1a] text-white font-medium flex items-center justify-center whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#333] transition-all ${
                compact ? 'rounded-none py-1 px-1.5 text-[10px] -ml-px' : 'rounded-xl px-5 text-sm gap-2 active:scale-[0.98]'
              }`}
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                'Save & next →'
              )}
            </button>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Call notes (optional)"
            className="mt-2 w-full bg-transparent border-0 p-0 text-sm text-[#1a1a1a] placeholder:text-[#c4c4c4] focus:outline-none"
          />
        </div>
      ) : view === 'on_call' ? (
        <button
          onClick={onHangup}
          className={`w-full bg-[#f4f4f4] text-[#1a1a1a] font-medium hover:bg-[#ececec] transition-all flex items-center justify-center gap-2 ${
            compact ? 'rounded-none py-1 px-2.5 text-sm' : 'rounded-xl py-4 text-base active:scale-[0.98]'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          {phoneStatus === 'ringing' && 'Ringing…'}
          {phoneStatus === 'connecting' && 'Connecting…'}
          {phoneStatus === 'in-call' && 'On call'}
          {phoneStatus !== 'ringing' && phoneStatus !== 'connecting' && phoneStatus !== 'in-call' && 'Call in progress'}
          <span className={`text-[#9ca3af] font-normal ${compact ? 'text-xs' : 'text-sm'}`}>· Hang up</span>
        </button>
      ) : (
        <button
          onClick={onCall}
          className={`w-full bg-[#1a1a1a] text-white font-medium hover:bg-[#333] transition-all flex items-center justify-center ${
            compact ? 'rounded-none py-1 px-2.5 text-sm gap-1.5' : 'rounded-xl py-4 text-base gap-2.5 active:scale-[0.98]'
          }`}
        >
          <svg className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
          </svg>
          Call {lead.name.split(' ')[0]}
          <span className={`text-[#888] ${compact ? 'text-[10px] ml-0.5' : 'text-xs ml-1'}`}>[C]</span>
        </button>
      )}
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
export interface Campaign {
  id: string;
  name: string;
  created_at: string;
  total: number;
  touched: number;
  called: number;
}

// ─── Campaign picker modal ─────────────────────────────────────────────────────
export function CampaignPickerModal({
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
  const {
    state, lead, queue, error, setError,
    activeCampaign, showPicker, setShowPicker,
    testMode, toggleTestMode, showCallCount, setShowCallCount,
    showEmailModal, setShowEmailModal,
    webphone, campaignPct, claimNext,
    handleLoadCampaign, handleClearCampaign,
    handleCall, handleHangup, handleDisposition, setLead,
  } = useDialerSession();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1a1a1a]">Dialer</h1>
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
          <div className="flex items-center justify-end gap-3 mb-2 min-h-[20px]">
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
          {state === 'loading' ? (
            <div className="bg-white border border-[#e5e5e5] rounded-2xl p-12 flex flex-col items-center justify-center shadow-sm">
              <div className="w-8 h-8 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin mb-4" />
              <p className="text-sm text-[#9ca3af]">Loading next lead…</p>
            </div>
          ) : state === 'empty' ? (
            <EmptyState onRefresh={() => claimNext(null)} queueLen={queue.length} />
          ) : lead && (state === 'ready' || state === 'on_call' || state === 'wrap_up' || state === 'saving') ? (
            <DialerCard
              lead={lead}
              view={state === 'on_call' ? 'on_call' : state === 'ready' ? 'idle' : 'wrap'}
              onCall={handleCall}
              phoneStatus={webphone.status}
              onHangup={handleHangup}
              onSave={handleDisposition}
              saving={state === 'saving'}
              onEmailSaved={(email) => setLead((prev) => prev ? { ...prev, email } : prev)}
              onQuickEmail={() => setShowEmailModal(true)}
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
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">1</kbd> Pipeline</span>
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">2</kbd> DNC</span>
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">3</kbd> No Answer</span>
        <span><kbd className="bg-[#f0f0f0] text-[#888] px-1.5 py-0.5 rounded">N</kbd> Save & next</span>
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
