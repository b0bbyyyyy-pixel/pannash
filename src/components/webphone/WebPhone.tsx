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
import { usePathname, useRouter } from 'next/navigation';
import { BACK_TO_PIPELINE_MSG, CALL_MSG, LEAD_DELETED_MSG, postLeadActionToFrame } from '@/lib/pipeline/iframeMessages';
import LeadActionsMenu from '@/components/LeadActionsMenu';

type PhoneStatus = 'offline' | 'ready' | 'connecting' | 'ringing' | 'in-call';

interface WebPhoneContextValue {
  status: PhoneStatus;
  ready: boolean;
  activeNumber: string | null;
  activeName: string | null;
  incomingFrom: string | null;
  muted: boolean;
  error: string | null;
  connect: (e164: string, meta?: { name?: string; leadId?: string; company?: string }) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  sendDigits: (digits: string) => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  dialPadOpen: boolean;
  dialPadNumber: string;
  fromNumber: string | null;
  openDialPad: (number?: string) => void;
  closeDialPad: () => void;
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

type MatchedLead = { id: string; name: string; company?: string | null };

function customParam(call: Call, key: string): string | null {
  const cp = call.customParameters as Map<string, string> | Record<string, string> | undefined;
  if (!cp) return null;
  if (typeof (cp as Map<string, string>).get === 'function') {
    const v = (cp as Map<string, string>).get(key);
    return v?.trim() ? v : null;
  }
  const v = (cp as Record<string, string>)[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function LeadCardOverlay({
  leadId,
  inCall,
  onClose,
}: {
  leadId: string;
  inCall: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === BACK_TO_PIPELINE_MSG) onClose();
      if (d.type === LEAD_DELETED_MSG) {
        onClose();
        router.refresh();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onClose, router]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[90]" onClick={onClose} />
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[91] flex flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          width: 'min(92vw, 1200px)',
          top: '1rem',
          bottom: inCall ? '5.75rem' : '1rem',
        }}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-4 py-2.5">
          <LeadActionsMenu
            align="left"
            onAction={id => postLeadActionToFrame(frameRef.current, id)}
          />
          <div className="flex items-center gap-3">
            <a
              href={`/pipeline/${leadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-[#6b6b6b] transition-colors hover:text-[#1a1a1a]"
              title="Open in full page"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Full page
            </a>
            <button
              onClick={onClose}
              className="rounded p-1 text-[#6b6b6b] transition-colors hover:bg-[#f5f5f5] hover:text-[#1a1a1a]"
              title="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <iframe
          ref={frameRef}
          src={`/pipeline/${leadId}?modal=1&from=dialer`}
          className="w-full flex-1 border-0 bg-white"
          title="Lead workspace"
        />
      </div>
    </>
  );
}

export default function WebPhoneProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const onMobileText = pathname.startsWith('/m');
  const [status, setStatus] = useState<PhoneStatus>('offline');
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [matchedLead, setMatchedLead] = useState<MatchedLead | null>(null);
  const [showLeadCard, setShowLeadCard] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dialPadOpen, setDialPadOpen] = useState(false);
  const [dialPadNumber, setDialPadNumber] = useState('');
  const [fromNumber, setFromNumber] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const incomingRef = useRef<Call | null>(null);
  const initStarted = useRef(false);
  const showLeadCardRef = useRef(false);
  showLeadCardRef.current = showLeadCard;

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
    if (onMobileText) {
      deviceRef.current?.destroy();
      deviceRef.current = null;
      initStarted.current = false;
      setStatus('offline');
      return;
    }
    if (initStarted.current) return;
    initStarted.current = true;

    // Iframes (lead overlay, settings preview) must not steal the "agent" registration.
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      initStarted.current = false;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/telephony/token');
        if (!res.ok) return; // not logged in / not configured — stay offline quietly
        const { token, fromNumber: from } = await res.json();
        if (from) setFromNumber(from);
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
          const from = call.parameters.From ?? 'Unknown';
          setIncomingFrom(from);
          const paramId = customParam(call, 'leadId');
          const paramName = customParam(call, 'leadName');
          const paramCompany = customParam(call, 'leadCompany');
          if (paramId) {
            setMatchedLead({
              id: paramId,
              name: paramName || from,
              company: paramCompany,
            });
            setActiveName(paramName);
          } else {
            setMatchedLead(null);
            setActiveName(null);
            void (async () => {
              try {
                const res = await fetch(`/api/telephony/lookup?phone=${encodeURIComponent(from)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!incomingRef.current && !callRef.current) return;
                if (data.lead?.id) {
                  setMatchedLead({
                    id: data.lead.id,
                    name: data.lead.name || from,
                    company: data.lead.company,
                  });
                  setActiveName(data.lead.name || null);
                }
              } catch { /* unknown caller */ }
            })();
          }
          call.on('cancel', () => {
            incomingRef.current = null;
            setIncomingFrom(null);
            if (!showLeadCardRef.current) setMatchedLead(null);
          });
          call.on('disconnect', () => { incomingRef.current = null; setIncomingFrom(null); resetCallState(); });
        });

        await device.register();
      } catch (e) {
        console.warn('[WebPhone] init failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [resetCallState, onMobileText]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const connect = useCallback(async (e164: string, meta?: { name?: string; leadId?: string; company?: string }) => {
    const device = deviceRef.current;
    if (!device) {
      const msg = 'Phone not ready — check Twilio setup in Settings.';
      setError(msg);
      throw new Error(msg);
    }
    if (callRef.current) {
      const msg = 'Already on a call.';
      setError(msg);
      throw new Error(msg);
    }
    setError(null);
    setActiveNumber(e164);
    setActiveName(meta?.name ?? null);
    setMatchedLead(meta?.leadId ? { id: meta.leadId, name: meta.name || e164, company: meta.company } : null);
    setStatus('connecting');
    // Use `phone` not `To` — Twilio's own `To` on Client calls is client:agent, not the PSTN number.
    const call = await device.connect({ params: { phone: e164 } });
    wireCall(call);
    call.on('ringing', () => setStatus('ringing'));
  }, [wireCall]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || d.type !== CALL_MSG) return;
      if (typeof d.e164 !== 'string' || !d.e164) return;
      void connect(d.e164, { name: d.name, leadId: d.leadId, company: d.company }).catch(() => {});
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [connect]);

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
    const from = call.parameters.From ?? null;
    setActiveNumber(from);
    setActiveName(prev => prev || customParam(call, 'leadName'));
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
    if (!showLeadCardRef.current) {
      setMatchedLead(null);
      setActiveName(null);
    }
  }, []);

  const openDialPad = useCallback((number?: string) => {
    setDialPadNumber(number ? number.replace(/[^\d+*#]/g, '') : '');
    setDialPadOpen(true);
  }, []);

  const closeDialPad = useCallback(() => {
    setDialPadOpen(false);
    setDialPadNumber('');
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
    dialPadOpen, dialPadNumber, fromNumber, openDialPad, closeDialPad,
  };

  const inCall = status === 'connecting' || status === 'ringing' || status === 'in-call';

  return (
    <WebPhoneContext.Provider value={value}>
      {children}

      {/* ── Incoming call toast ── */}
      {incomingFrom && !onMobileText && (
        <div className="fixed top-5 right-5 z-[110] w-80 rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-xl">
          <p className="mb-0.5 text-xs text-[#9ca3af]">Incoming call</p>
          <p className="text-base font-semibold text-[#1a1a1a]">
            {matchedLead?.name || activeName || fmtNumber(incomingFrom)}
          </p>
          {matchedLead?.company && (
            <p className="truncate text-[13px] text-[#6b6b6b]">{matchedLead.company}</p>
          )}
          {(matchedLead || activeName) && (
            <p className="mt-0.5 text-xs text-[#9ca3af]">{fmtNumber(incomingFrom)}</p>
          )}
          {!matchedLead && !activeName && (
            <p className="mt-0.5 text-xs text-[#9ca3af]">Not in your leads</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={acceptIncoming}
              className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              Answer
            </button>
            <button
              onClick={rejectIncoming}
              className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Reject
            </button>
          </div>
          {matchedLead && (
            <button
              type="button"
              onClick={() => setShowLeadCard(true)}
              className="mt-2 w-full rounded-xl border border-[#e5e5e5] py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#f5f5f5]"
            >
              Open lead card
            </button>
          )}
        </div>
      )}

      {showLeadCard && matchedLead && !onMobileText && (
        <LeadCardOverlay
          leadId={matchedLead.id}
          inCall={inCall}
          onClose={() => setShowLeadCard(false)}
        />
      )}

      {/* ── Call bar ── */}
      {inCall && !onMobileText && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-[#1a1a1a] text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
            <div className="min-w-0">
              <p className="max-w-[180px] truncate text-sm font-semibold">
                {matchedLead?.name || activeName || fmtNumber(activeNumber)}
              </p>
              <p className="text-xs text-white/60">
                {status === 'connecting' && 'Connecting…'}
                {status === 'ringing' && 'Ringing…'}
                {status === 'in-call' && (elapsed ?? 'Connected')}
                {matchedLead?.company ? ` · ${matchedLead.company}` : ''}
              </p>
            </div>

            {matchedLead && (
              <button
                onClick={() => setShowLeadCard(true)}
                title="Open lead card"
                className={`rounded-full p-2.5 transition-colors ${showLeadCard ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
            )}

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
      {error && !onMobileText && (
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
