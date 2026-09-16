'use client';

/**
 * Manual phone — call ANY number from the Dialer page.
 * Uses the same agent-first SIP flow as click-to-call:
 * your desk phone rings first, then Twilio dials the number.
 *
 * Note: once connected, use the DESK PHONE for DTMF menus / mute —
 * audio terminates there, not in the browser.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { toE164, formatDisplay } from '@/lib/dialer/e164';

type PhoneState = 'idle' | 'starting' | 'live' | 'ended';

interface LiveCall {
  id: string;
  status: string | null;
  answered_at: string | null;
  duration_seconds: number | null;
}

const KEYPAD: { d: string; letters: string }[] = [
  { d: '1', letters: '' },     { d: '2', letters: 'ABC' }, { d: '3', letters: 'DEF' },
  { d: '4', letters: 'GHI' },  { d: '5', letters: 'JKL' }, { d: '6', letters: 'MNO' },
  { d: '7', letters: 'PQRS' }, { d: '8', letters: 'TUV' }, { d: '9', letters: 'WXYZ' },
  { d: '*', letters: '' },     { d: '0', letters: '+' },   { d: '#', letters: '' },
];

const LIVE_STATUSES = ['created', 'ringing_agent', 'agent_answered', 'in_progress'];

const STATUS_TEXT: Record<string, string> = {
  created: 'Starting…',
  ringing_agent: 'Ringing your desk phone…',
  agent_answered: 'Dialing…',
  in_progress: 'Connected',
  completed: 'Call ended',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Call failed',
  canceled: 'Canceled',
  agent_no_answer: 'Desk phone not answered',
  dry_run: 'Dry run logged (enable live calls in Settings \u2192 Phone)',
};

function fmtElapsed(fromIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function ManualDialPanel() {
  const [number, setNumber] = useState('');
  const [phase, setPhase] = useState<PhoneState>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [answeredAt, setAnsweredAt] = useState<string | null>(null);
  const [, setTick] = useState(0); // re-render for the timer
  const inputRef = useRef<HTMLInputElement>(null);

  const e164 = toE164(number);

  // ── Timer tick while connected ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live' || !answeredAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase, answeredAt]);

  // ── Poll call status while live ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live' || !callId) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/telephony/calls?callId=${callId}&limit=1`);
        const data = await res.json();
        const call: LiveCall | undefined = data.calls?.[0];
        if (!call) return;
        setStatus(call.status ?? '');
        if (call.answered_at) setAnsweredAt(call.answered_at);
        if (!LIVE_STATUSES.includes(call.status ?? '')) {
          setPhase('ended');
        }
      } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(t);
  }, [phase, callId]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const press = (d: string) => {
    if (phase === 'live' || phase === 'starting') return;
    setNumber((n) => n + d);
    setError(null);
    if (phase === 'ended') setPhase('idle');
  };

  const backspace = () => setNumber((n) => n.slice(0, -1));

  const startCall = useCallback(async () => {
    if (!e164 || phase === 'starting' || phase === 'live') return;
    setPhase('starting');
    setError(null);
    setAnsweredAt(null);
    try {
      const res = await fetch('/api/telephony/click-to-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Call failed');
      setCallId(data.callId);
      if (data.dryRun) {
        setStatus('dry_run');
        setPhase('ended');
      } else {
        setStatus('ringing_agent');
        setPhase('live');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Call failed');
      setPhase('idle');
    }
  }, [e164, phase]);

  const hangup = async () => {
    if (!callId) return;
    try {
      await fetch('/api/telephony/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });
    } catch { /* status poll will settle it */ }
    setPhase('ended');
    setStatus('completed');
  };

  const reset = () => {
    setPhase('idle');
    setCallId(null);
    setStatus('');
    setNumber('');
    setAnsweredAt(null);
  };

  const isLive = phase === 'live';
  const display = e164 ? formatDisplay(e164) : number;

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">Phone</h3>

      {/* Number display / input */}
      <input
        ref={inputRef}
        type="tel"
        value={display}
        onChange={(e) => {
          if (isLive || phase === 'starting') return;
          // Keep only dial characters
          setNumber(e.target.value.replace(/[^\d+*#]/g, ''));
          setError(null);
          if (phase === 'ended') setPhase('idle');
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') startCall(); }}
        placeholder="(555) 123-4567"
        disabled={isLive || phase === 'starting'}
        className="w-full text-center text-xl font-medium text-[#1a1a1a] tracking-wide border-b border-[#e5e5e5] pb-2 mb-4 focus:outline-none focus:border-[#1a1a1a] placeholder:text-[#d4d4d4] disabled:bg-transparent"
      />

      {/* Status / timer */}
      {(status || error) && (
        <div className="text-center mb-3">
          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : (
            <p className={`text-xs ${status === 'in_progress' ? 'text-green-600 font-medium' : 'text-[#6b7280]'}`}>
              {status === 'in_progress' && answeredAt
                ? `Connected · ${fmtElapsed(answeredAt)}`
                : STATUS_TEXT[status] || status}
            </p>
          )}
        </div>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {KEYPAD.map(({ d, letters }) => (
          <button
            key={d}
            onClick={() => press(d)}
            disabled={isLive || phase === 'starting'}
            className="py-2.5 rounded-xl border border-[#f0f0f0] hover:bg-[#f7f7f7] active:bg-[#efefef] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="block text-base font-medium text-[#1a1a1a] leading-none">{d}</span>
            <span className="block text-[8px] text-[#b0b0b0] tracking-widest mt-0.5 h-2">{letters}</span>
          </button>
        ))}
      </div>

      {/* Call / Hangup row */}
      <div className="flex items-center gap-2">
        {isLive ? (
          <button
            onClick={hangup}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Hang Up
          </button>
        ) : (
          <button
            onClick={phase === 'ended' ? reset : startCall}
            disabled={phase === 'starting' || (phase !== 'ended' && !e164)}
            className="flex-1 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-sm font-medium hover:bg-[#333] disabled:opacity-40 transition-colors"
          >
            {phase === 'starting' ? 'Calling…' : phase === 'ended' ? 'New Call' : 'Call'}
          </button>
        )}
        <button
          onClick={backspace}
          disabled={isLive || phase === 'starting' || !number}
          aria-label="Delete digit"
          className="px-3.5 py-2.5 rounded-xl border border-[#e5e5e5] text-[#6b7280] hover:bg-[#f7f7f7] disabled:opacity-40 transition-colors"
        >
          ⌫
        </button>
      </div>

      <p className="text-[10px] text-[#b0b0b0] mt-3 text-center">
        Rings your desk phone first, then dials the number.
      </p>
    </div>
  );
}
