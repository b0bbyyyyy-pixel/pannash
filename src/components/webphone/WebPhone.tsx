'use client';

/**
 * WebPhone — Twilio Voice JS (WebRTC) in-app dialer.
 *
 * <WebPhoneProvider> mounts once in the root layout:
 *   - registers a Twilio Device (identity "agent") when the user is logged in
 *   - exposes useWebPhone() for click-to-dial anywhere in the app
 *   - renders the call bar (mute / keypad / hangup) and incoming-call toast
 *
 * Audio runs through the browser (your headset). No SIP, no desk phone.
 */
import {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

type PhoneStatus = 'offline' | 'ready' | 'connecting' | 'ringing' | 'in-call';

interface WebPhoneContextValue {
  status: PhoneStatus;
  ready: boolean;
  activeNumber: string | null;
  activeName: string | null;
  incomingFrom: string | null;
  muted: boolean;
  error: string | null;
  connect: (e164: string, meta?: { name?: string }) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  sendDigits: (digits: string) => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
}

const WebPhoneContext = createContext<WebPhoneContextValue | null>(null);

export function useWebPhone(): WebPhoneContextValue {
  const ctx = useContext(WebPhoneContext);
  if (!ctx) throw new Error('useWebPhone must be used inside <WebPhoneProvider>');
  return ctx;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function fmtNumber(n: string | null): string {
  if (!n) return '';
  if (/^\+1\d{10}$/.test(n)) {
    const d = n.slice(2);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return n;
}

export default function WebPhoneProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PhoneStatus>('offline');
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const incomingRef = useRef<Call | null>(null);
  const initStarted = useRef(false);

  // Re-render every second while a call is live (for the timer)
  useEffect(() => {
    if (!callStartedAt) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [callStartedAt]);

  const resetCallState = useCallback(() => {
    callRef.current = null;
    setActiveNumber(null);
    setActiveName(null);
    setMuted(false);
    setShowKeypad(false);
    setCallStartedAt(null);
    setStatus(deviceRef.current ? 'ready' : 'offline');
  }, []);

  const wireCall = useCallback((call: Call) => {
    callRef.current = call;
    call.on('accept', () => { setStatus('in-call'); setCallStartedAt(Date.now()); });
    call.on('disconnect', resetCallState);
    call.on('cancel', () => { incomingRef.current = null; setIncomingFrom(null); resetCallState(); });
    call.on('error', (e: Error) => { setError(e.message); resetCallState(); });
  }, [resetCallState]);

  // ── Device init (runs once after login) ─────────────────────────────────────
  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    // Iframes (lead overlay) must not steal the "agent" registration from the parent tab.
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/telephony/token');
        if (!res.ok) return; // not logged in / not configured — stay offline quietly
        const { token } = await res.json();
        if (cancelled) return;

        const { Device } = await import('@twilio/voice-sdk');
        const device = new Device(token, {
          logLevel: 'error',
          // Prefer Opus, fall back to PCMU
          codecPreferences: ['opus', 'pcmu'] as Call.Codec[],
        });
        deviceRef.current = device;

        device.on('registered', () => setStatus('ready'));
        device.on('unregistered', () => setStatus('offline'));
        device.on('error', (e: Error) => setError(e.message));

        device.on('tokenWillExpire', async () => {
          try {
            const r = await fetch('/api/telephony/token');
            if (r.ok) {
              const { token: fresh } = await r.json();
              device.updateToken(fresh);
            }
          } catch { /* next expiry will retry */ }
        });

        device.on('incoming', (call: Call) => {
          incomingRef.current = call;
          setIncomingFrom(call.parameters.From ?? 'Unknown');
          call.on('cancel', () => { incomingRef.current = null; setIncomingFrom(null); });
          call.on('disconnect', () => { incomingRef.current = null; setIncomingFrom(null); resetCallState(); });
        });

        await device.register();
      } catch (e) {
        console.warn('[WebPhone] init failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [resetCallState]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const connect = useCallback(async (e164: string, meta?: { name?: string }) => {
    const device = deviceRef.current;
    if (!device) { setError('Phone not ready — check Twilio setup in Settings.'); return; }
    if (callRef.current) { setError('Already on a call.'); return; }
    setError(null);
    setActiveNumber(e164);
    setActiveName(meta?.name ?? null);
    setStatus('connecting');
    // Use `phone` not `To` — Twilio's own `To` on Client calls is client:agent, not the PSTN number.
    const call = await device.connect({ params: { phone: e164 } });
    wireCall(call);
    call.on('ringing', () => setStatus('ringing'));
  }, [wireCall]);

  const hangup = useCallback(() => {
    callRef.current?.disconnect();
    deviceRef.current?.disconnectAll();
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.isMuted();
    call.mute(next);
    setMuted(next);
  }, []);

  const sendDigits = useCallback((digits: string) => {
    callRef.current?.sendDigits(digits);
  }, []);

  const acceptIncoming = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    incomingRef.current = null;
    setActiveNumber(call.parameters.From ?? null);
    setActiveName(null);
    setIncomingFrom(null);
    wireCall(call);
    call.accept();
    setStatus('in-call');
    setCallStartedAt(Date.now());
  }, [wireCall]);

  const rejectIncoming = useCallback(() => {
    incomingRef.current?.reject();
    incomingRef.current = null;
    setIncomingFrom(null);
  }, []);

  const elapsed = callStartedAt
    ? (() => {
        const s = Math.floor((Date.now() - callStartedAt) / 1000);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      })()
    : null;

  const value: WebPhoneContextValue = {
    status,
    ready: status !== 'offline',
    activeNumber, activeName, incomingFrom, muted, error,
    connect, hangup, toggleMute, sendDigits, acceptIncoming, rejectIncoming,
  };

  const inCall = status === 'connecting' || status === 'ringing' || status === 'in-call';

  return (
    <WebPhoneContext.Provider value={value}>
      {children}

      {/* ── Incoming call toast ── */}
      {incomingFrom && (
        <div className="fixed top-5 right-5 z-[100] bg-white border border-[#e5e5e5] rounded-2xl shadow-xl p-4 w-72 animate-pulse-slow">
          <p className="text-xs text-[#9ca3af] mb-0.5">Incoming call</p>
          <p className="text-base font-semibold text-[#1a1a1a] mb-3">{fmtNumber(incomingFrom)}</p>
          <div className="flex gap-2">
            <button
              onClick={acceptIncoming}
              className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Answer
            </button>
            <button
              onClick={rejectIncoming}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Call bar ── */}
      {inCall && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-[#1a1a1a] text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate max-w-[180px]">
                {activeName || fmtNumber(activeNumber)}
              </p>
              <p className="text-xs text-white/60">
                {status === 'connecting' && 'Connecting…'}
                {status === 'ringing' && 'Ringing…'}
                {status === 'in-call' && (elapsed ?? 'Connected')}
              </p>
            </div>

            {/* Mute */}
            <button
              onClick={toggleMute}
              disabled={status !== 'in-call'}
              title={muted ? 'Unmute' : 'Mute'}
              className={`p-2.5 rounded-full transition-colors disabled:opacity-30 ${muted ? 'bg-yellow-500 text-black' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {muted ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>

            {/* Keypad toggle */}
            <button
              onClick={() => setShowKeypad(v => !v)}
              disabled={status !== 'in-call'}
              title="Keypad"
              className={`p-2.5 rounded-full transition-colors disabled:opacity-30 ${showKeypad ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="6" cy="5" r="1.8" /><circle cx="12" cy="5" r="1.8" /><circle cx="18" cy="5" r="1.8" />
                <circle cx="6" cy="11" r="1.8" /><circle cx="12" cy="11" r="1.8" /><circle cx="18" cy="11" r="1.8" />
                <circle cx="6" cy="17" r="1.8" /><circle cx="12" cy="17" r="1.8" /><circle cx="18" cy="17" r="1.8" />
              </svg>
            </button>

            {/* Hang up */}
            <button
              onClick={hangup}
              title="Hang up"
              className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
            >
              <svg className="w-4 h-4 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
              </svg>
            </button>
          </div>

          {/* DTMF keypad */}
          {showKeypad && status === 'in-call' && (
            <div className="mt-2 bg-[#1a1a1a] rounded-2xl shadow-2xl p-3 grid grid-cols-3 gap-1.5">
              {KEYPAD.map(d => (
                <button
                  key={d}
                  onClick={() => sendDigits(d)}
                  className="w-14 h-11 rounded-xl bg-white/10 hover:bg-white/25 text-white text-base font-medium transition-colors"
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed bottom-5 right-5 z-[100] bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-xs shadow-lg">
          <div className="flex items-start gap-2">
            <p className="text-xs text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm leading-none">✕</button>
          </div>
        </div>
      )}
    </WebPhoneContext.Provider>
  );
}
