'use client';

/**
 * WebPhone — Twilio Voice JS (WebRTC) in-app dialer.
 *
 * <WebPhoneProvider> mounts once in the root layout:
 *   - registers one Twilio Device when this tab is the live phone session
 *   - exposes useWebPhone() for click-to-dial anywhere in the app
 *   - renders the call bar (mute / keypad / hangup) and incoming-call toast
 *
 * Audio runs through the browser (your headset). No SIP, no desk phone.
 */
import {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Call, Device } from '@twilio/voice-sdk';
import { createRingback, playPickupBeep, voiceErrorMessage } from '@/lib/telephony/ringback';
import {
  WEBPHONE_LOCK_KEY,
  isPhoneBrowser,
  newWebphoneTabId,
  parseWebphoneLock,
  shouldTakeWebphoneLock,
} from '@/lib/telephony/webphoneLock';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { BACK_TO_PIPELINE_MSG, CALL_MSG, LEAD_DELETED_MSG, LEAD_STATE_MSG, postLeadActionToFrame } from '@/lib/pipeline/iframeMessages';
import LeadActionsMenu from '@/components/LeadActionsMenu';
import { applyLeadStateMsg, type LeadMenuState } from '@/lib/leads/menuComplete';

const DocumentsModal = dynamic(() => import('@/components/DocumentsModal'), { ssr: false });
const ScheduleEmailModal = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });
const FollowUpModal = dynamic(() => import('@/components/FollowUpModal'), { ssr: false });

type PhoneStatus = 'offline' | 'ready' | 'connecting' | 'ringing' | 'in-call';

interface WebPhoneContextValue {
  status: PhoneStatus;
  ready: boolean;
  activeNumber: string | null;
  activeName: string | null;
  incomingFrom: string | null;
  muted: boolean;
  waitingForHuman: boolean;
  error: string | null;
  connect: (e164: string, meta?: { name?: string; leadId?: string; company?: string; hunt?: boolean; callDbId?: string }) => Promise<void>;
  hangup: () => void;
  handOffLive: () => void;
  toggleMute: () => void;
  sendDigits: (digits: string) => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  activeLead: { id: string; name: string; company?: string | null } | null;
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

function reportInboundCall(payload: {
  callSid?: string | null;
  from?: string | null;
  to?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  status?: string;
}) {
  void fetch('/api/telephony/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function setIncomingTabTitle(on: boolean) {
  if (typeof document === 'undefined') return;
  if (!on) {
    const orig = document.documentElement.dataset.phoneTitle;
    if (orig != null) document.title = orig;
    delete document.documentElement.dataset.phoneTitle;
    return;
  }
  if (!document.documentElement.dataset.phoneTitle) {
    document.documentElement.dataset.phoneTitle = document.title;
  }
  document.title = 'Incoming call…';
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
  leadName,
  leadCompany,
  inCall,
  onClose,
}: {
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  inCall: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [leadMenuState, setLeadMenuState] = useState<LeadMenuState | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === LEAD_STATE_MSG && typeof d.section === 'string') {
        setLeadMenuState(prev => applyLeadStateMsg(prev, d));
        return;
      }
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
            onAction={id => {
              if (id === 'docs') { setShowDocs(true); return; }
              if (id === 'email') { setShowEmail(true); return; }
              if (id === 'followup') { setShowFollowUp(true); return; }
              postLeadActionToFrame(frameRef.current, id);
            }}
            currentSection={leadMenuState?.section}
            showAppDot
            appComplete={leadMenuState?.appComplete ?? false}
            lendersComplete={leadMenuState?.lendersComplete ?? false}
            docsComplete={leadMenuState?.docsComplete ?? false}
            offersComplete={leadMenuState?.offersComplete ?? false}
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
      {showDocs && (
        <DocumentsModal
          leadId={leadId}
          leadName={leadName}
          leadCompany={leadCompany}
          onClose={() => setShowDocs(false)}
        />
      )}
      {showEmail && (
        <ScheduleEmailModal
          lead={{ id: leadId, name: leadName, company: leadCompany }}
          onClose={() => setShowEmail(false)}
        />
      )}
      {showFollowUp && (
        <FollowUpModal
          leadId={leadId}
          leadName={leadCompany || leadName}
          onClose={() => setShowFollowUp(false)}
        />
      )}
    </>
  );
}

export default function WebPhoneProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const onMobileText = pathname.startsWith('/m');
  const [status, setStatus] = useState<PhoneStatus>('offline');
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [matchedLead, setMatchedLead] = useState<MatchedLead | null>(null);
  const [showLeadCard, setShowLeadCard] = useState(false);
  const [muted, setMuted] = useState(false);
  const [waitingForHuman, setWaitingForHuman] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dialPadOpen, setDialPadOpen] = useState(false);
  const [dialPadNumber, setDialPadNumber] = useState('');
  const [fromNumber, setFromNumber] = useState<string | null>(null);
  const [callDock, setCallDock] = useState<HTMLElement | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [missedBanner, setMissedBanner] = useState<{
    from: string;
    name: string | null;
    company: string | null;
    leadId: string | null;
  } | null>(null);
  const [, setTick] = useState(0);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const incomingRef = useRef<Call | null>(null);
  const matchedLeadRef = useRef<MatchedLead | null>(null);
  matchedLeadRef.current = matchedLead;
  const incomingSessionRef = useRef(false);
  const tabIdRef = useRef(newWebphoneTabId());
  const startingDeviceRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLeadCardRef = useRef(false);
  showLeadCardRef.current = showLeadCard;
  const ringbackRef = useRef<ReturnType<typeof createRingback> | null>(null);
  const ringWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const huntRef = useRef(false);

  const showMissedBanner = useCallback((row: {
    from: string;
    name: string | null;
    company: string | null;
    leadId: string | null;
  }) => {
    if (missedTimerRef.current) clearTimeout(missedTimerRef.current);
    setMissedBanner(row);
    missedTimerRef.current = setTimeout(() => setMissedBanner(null), 15000);
  }, []);

  const stopRingback = useCallback(() => {
    if (ringWaitRef.current) {
      clearTimeout(ringWaitRef.current);
      ringWaitRef.current = null;
    }
    ringbackRef.current?.stop();
    ringbackRef.current = null;
  }, []);

  const startRingback = useCallback(() => {
    if (ringbackRef.current) return;
    const rb = createRingback();
    ringbackRef.current = rb;
    void rb.start();
  }, []);

  // Re-render every second while a call is live (for the timer)
  useEffect(() => {
    if (!callStartedAt) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [callStartedAt]);

  const resetCallState = useCallback(() => {
    stopRingback();
    huntRef.current = false;
    setWaitingForHuman(false);
    callRef.current = null;
    if (incomingRef.current) {
      setActiveNumber(null);
      setMuted(false);
      setShowKeypad(false);
      setCallStartedAt(null);
      setStatus(deviceRef.current ? 'ready' : 'offline');
      return;
    }
    incomingSessionRef.current = false;
    setIncomingFrom(null);
    setIncomingTabTitle(false);
    setActiveNumber(null);
    setActiveName(null);
    setMuted(false);
    setShowKeypad(false);
    setCallStartedAt(null);
    setStatus(deviceRef.current ? 'ready' : 'offline');
  }, [stopRingback]);

  const wireCall = useCallback((call: Call) => {
    callRef.current = call;
    call.on('ringing', (hasEarlyMedia?: boolean) => {
      setStatus('ringing');
      if (huntRef.current) {
        stopRingback();
        return;
      }
      // Carrier is already playing ringback — don't stack a second tone.
      if (hasEarlyMedia) stopRingback();
      else startRingback();
    });
    call.on('accept', () => {
      stopRingback();
      setStatus('in-call');
      setCallStartedAt(Date.now());
    });
    call.on('disconnect', resetCallState);
    call.on('cancel', () => { incomingRef.current = null; setIncomingFrom(null); resetCallState(); });
    call.on('reject', resetCallState);
    call.on('error', (e: Error) => { setError(voiceErrorMessage(e)); resetCallState(); });
  }, [resetCallState, stopRingback, startRingback]);

  const writeLock = useCallback((busy: boolean) => {
    try {
      localStorage.setItem(WEBPHONE_LOCK_KEY, JSON.stringify({
        id: tabIdRef.current,
        at: Date.now(),
        busy,
      }));
    } catch { /* private mode */ }
  }, []);

  const weOwnLock = useCallback(() => {
    try {
      return parseWebphoneLock(localStorage.getItem(WEBPHONE_LOCK_KEY))?.id === tabIdRef.current;
    } catch {
      return true;
    }
  }, []);

  const takeLock = useCallback((steal: boolean) => {
    try {
      const existing = parseWebphoneLock(localStorage.getItem(WEBPHONE_LOCK_KEY));
      if (existing?.busy && existing.id !== tabIdRef.current && Date.now() - existing.at < 15_000) {
        return false;
      }
      if (!shouldTakeWebphoneLock({
        mine: tabIdRef.current,
        existing,
        now: Date.now(),
        steal,
      })) return false;
      writeLock(!!incomingRef.current || !!callRef.current);
      return true;
    } catch {
      return true;
    }
  }, [writeLock]);

  const destroyDevice = useCallback(() => {
    const device = deviceRef.current;
    deviceRef.current = null;
    startingDeviceRef.current = false;
    if (incomingRef.current) {
      try { incomingRef.current.reject(); } catch { /* already gone */ }
      incomingRef.current = null;
    }
    if (callRef.current) {
      try { callRef.current.removeAllListeners(); } catch { /* older SDK */ }
      try { callRef.current.disconnect(); } catch { /* already gone */ }
      callRef.current = null;
    }
    if (device) {
      try { device.removeAllListeners(); } catch { /* older SDK */ }
      try { void device.unregister(); } catch { /* already gone */ }
      try { device.destroy(); } catch { /* already gone */ }
    }
    incomingSessionRef.current = false;
    stopRingback();
    setIncomingFrom(null);
    setIncomingTabTitle(false);
    setActiveNumber(null);
    setStatus('offline');
  }, [stopRingback]);

  const attachIncoming = useCallback((call: Call) => {
    incomingRef.current = call;
    incomingSessionRef.current = true;
    const from = call.parameters.From ?? 'Unknown';
    const callSid = call.parameters.CallSid ?? null;
    setMissedBanner(null);
    setIncomingFrom(from);
    setIncomingTabTitle(true);
    writeLock(true);
    const paramId = customParam(call, 'leadId');
    const paramName = customParam(call, 'leadName');
    const paramCompany = customParam(call, 'leadCompany');
    reportInboundCall({
      callSid,
      from,
      leadId: paramId,
      leadName: paramName,
      status: 'ringing_agent',
    });
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') void Notification.requestPermission();
        if (Notification.permission === 'granted') {
          new Notification('Incoming call', {
            body: paramName || from,
            tag: 'gostwrk-incoming-call',
          });
        }
      }
    } catch { /* no notifications */ }
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
            reportInboundCall({
              callSid,
              from,
              leadId: data.lead.id,
              leadName: data.lead.name,
              status: 'ringing_agent',
            });
          }
        } catch { /* unknown caller */ }
      })();
    }
    call.on('cancel', () => {
      incomingRef.current = null;
      incomingSessionRef.current = false;
      setIncomingFrom(null);
      setIncomingTabTitle(false);
      writeLock(!!callRef.current);
      showMissedBanner({
        from,
        name: paramName || matchedLeadRef.current?.name || null,
        company: paramCompany || matchedLeadRef.current?.company || null,
        leadId: paramId || matchedLeadRef.current?.id || null,
      });
      reportInboundCall({ callSid, from, status: 'no_answer' });
      if (!showLeadCardRef.current) setMatchedLead(null);
    });
    call.on('disconnect', () => {
      incomingRef.current = null;
      setIncomingFrom(null);
      setIncomingTabTitle(false);
      writeLock(!!callRef.current);
      resetCallState();
    });
  }, [resetCallState, showMissedBanner, writeLock]);

  const startDevice = useCallback(async () => {
    if (deviceRef.current || startingDeviceRef.current) return;
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) return;
    startingDeviceRef.current = true;
    try {
      const res = await fetch('/api/telephony/token');
      if (!res.ok) return;
      const { token, fromNumber: from } = await res.json();
      if (from) setFromNumber(from);
      if (!weOwnLock()) return;

      const { Device } = await import('@twilio/voice-sdk');
      if (!weOwnLock()) return;
      const device = new Device(token, {
        logLevel: 'error',
        codecPreferences: ['opus', 'pcmu'] as Call.Codec[],
        closeProtection: true,
        dscp: true,
        edge: 'roaming',
        allowIncomingWhileBusy: true,
      });
      deviceRef.current = device;

      device.on('registered', () => setStatus('ready'));
      device.on('unregistered', () => {
        if (deviceRef.current === device) setStatus('offline');
      });
      device.on('error', (e: Error) => setError(voiceErrorMessage(e)));

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
        const live = callRef.current;
        const liveStatus = live?.status?.();
        if (live && liveStatus === 'closed') {
          try { live.removeAllListeners(); } catch { /* older SDK */ }
          callRef.current = null;
        }
        attachIncoming(call);
      });

      await device.register();
      try { device.audio?.outgoing(false); } catch { /* older SDK */ }
      if (!weOwnLock()) {
        destroyDevice();
      }
    } catch (e) {
      console.warn('[WebPhone] init failed:', e);
    } finally {
      startingDeviceRef.current = false;
    }
  }, [attachIncoming, destroyDevice, weOwnLock]);

  // One Twilio Device per browser. Phone browsers unregister as soon as the
  // tab is backgrounded so you don't hear a ring with no incoming card.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) return;

    const phone = isPhoneBrowser(navigator.userAgent);

    const goLive = (steal: boolean) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (takeLock(steal)) void startDevice();
      else destroyDevice();
    };

    const onHidden = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      const delay = phone ? 400 : 45_000;
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        if (document.hidden) destroyDevice();
      }, delay);
    };

    const onVisible = () => goLive(true);

    if (document.hidden) onHidden();
    else goLive(true);

    const heartbeat = window.setInterval(() => {
      if (document.hidden) return;
      if (weOwnLock()) {
        writeLock(!!incomingRef.current || !!callRef.current);
        const device = deviceRef.current;
        if (device && device.state !== 'registered' && device.state !== 'registering') {
          void device.register().catch(() => {});
        }
      } else if (takeLock(false)) {
        void startDevice();
      }
    }, 3000);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== WEBPHONE_LOCK_KEY) return;
      const lock = parseWebphoneLock(e.newValue);
      if (lock && lock.id !== tabIdRef.current) destroyDevice();
    };

    const onPageHide = () => {
      if (weOwnLock()) {
        try { localStorage.removeItem(WEBPHONE_LOCK_KEY); } catch { /* private mode */ }
      }
      destroyDevice();
    };

    const onVisibility = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };

    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(heartbeat);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);
      if (weOwnLock()) {
        try { localStorage.removeItem(WEBPHONE_LOCK_KEY); } catch { /* private mode */ }
      }
      destroyDevice();
    };
  }, [destroyDevice, startDevice, takeLock, weOwnLock, writeLock]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const connect = useCallback(async (e164: string, meta?: { name?: string; leadId?: string; company?: string; hunt?: boolean; callDbId?: string }) => {
    if (!deviceRef.current) {
      if (!takeLock(true)) {
        const msg = 'Phone is active in another tab — click that window, then dial.';
        setError(msg);
        throw new Error(msg);
      }
      await startDevice();
    }
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

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
    } catch {
      const msg = 'Microphone access is required to place calls.';
      setError(msg);
      resetCallState();
      throw new Error(msg);
    }

    try {
      if (device.state !== 'registered') {
        await device.register();
      }
    } catch (e) {
      const msg = voiceErrorMessage(e);
      setError(msg);
      resetCallState();
      throw new Error(msg);
    }

    huntRef.current = !!meta?.hunt;
    setWaitingForHuman(!!meta?.hunt);
    stopRingback();
    if (!meta?.hunt) {
      ringWaitRef.current = setTimeout(() => {
        if (callRef.current) startRingback();
      }, 900);
    }

    try {
      // `phone` not `To` — Twilio's own `To` on Client calls is client:agent, not the PSTN number.
      const call = await device.connect({
        params: {
          phone: e164,
          ...(meta?.hunt ? { hunt: '1' } : {}),
          ...(meta?.callDbId ? { callDbId: meta.callDbId } : {}),
        },
        rtcConstraints: { audio: true },
      });
      wireCall(call);
    } catch (e) {
      const msg = voiceErrorMessage(e);
      setError(msg);
      resetCallState();
      const dev = deviceRef.current;
      if (dev && (dev.state === 'unregistered' || dev.state === 'destroyed')) {
        try { await dev.register(); } catch { /* next dial will retry */ }
      }
      throw new Error(msg);
    }
  }, [wireCall, resetCallState, stopRingback, startRingback, takeLock, startDevice]);

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
    stopRingback();
    callRef.current?.disconnect();
    deviceRef.current?.disconnectAll();
  }, [stopRingback]);

  const handOffLive = useCallback(() => {
    huntRef.current = false;
    setWaitingForHuman(false);
    playPickupBeep();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Person answered', {
          body: activeName || activeNumber || 'Talk now',
          tag: 'gostwrk-hunt-live',
        });
      }
    } catch { /* no notifications */ }
    if (typeof document !== 'undefined') {
      if (!document.documentElement.dataset.phoneTitle) {
        document.documentElement.dataset.phoneTitle = document.title;
      }
      document.title = 'Person answered — talk now';
      window.setTimeout(() => {
        const orig = document.documentElement.dataset.phoneTitle;
        if (orig != null) document.title = orig;
        delete document.documentElement.dataset.phoneTitle;
      }, 4000);
    }
  }, [activeName, activeNumber]);

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
    const live = callRef.current;
    if (live && live !== call) {
      try { live.removeAllListeners(); } catch { /* older SDK */ }
      try { live.disconnect(); } catch { /* already gone */ }
      callRef.current = null;
    }
    incomingRef.current = null;
    incomingSessionRef.current = true;
    const from = call.parameters.From ?? null;
    setActiveNumber(from);
    setActiveName(prev => prev || customParam(call, 'leadName'));
    setIncomingFrom(null);
    setIncomingTabTitle(false);
    const sid = call.parameters.CallSid ?? null;
    reportInboundCall({
      callSid: sid,
      from,
      leadId: matchedLeadRef.current?.id,
      leadName: matchedLeadRef.current?.name,
      status: 'in_progress',
    });
    wireCall(call);
    call.accept();
    setStatus('in-call');
    setCallStartedAt(Date.now());
  }, [wireCall]);

  const rejectIncoming = useCallback(() => {
    const call = incomingRef.current;
    const from = call?.parameters.From ?? incomingFrom;
    const sid = call?.parameters.CallSid ?? null;
    call?.reject();
    incomingRef.current = null;
    incomingSessionRef.current = false;
    setIncomingFrom(null);
    setIncomingTabTitle(false);
    if (from) {
      showMissedBanner({
        from,
        name: matchedLeadRef.current?.name || null,
        company: matchedLeadRef.current?.company || null,
        leadId: matchedLeadRef.current?.id || null,
      });
    }
    reportInboundCall({ callSid: sid, from, status: 'no_answer' });
    if (!showLeadCardRef.current) {
      setMatchedLead(null);
      setActiveName(null);
    }
  }, [incomingFrom, showMissedBanner]);

  const blockIncoming = useCallback(async () => {
    const call = incomingRef.current;
    const from = call?.parameters.From ?? incomingFrom ?? missedBanner?.from ?? null;
    const sid = call?.parameters.CallSid ?? null;
    const leadId = matchedLeadRef.current?.id || missedBanner?.leadId || null;
    call?.reject();
    incomingRef.current = null;
    incomingSessionRef.current = false;
    setIncomingFrom(null);
    setMissedBanner(null);
    setIncomingTabTitle(false);
    if (from) {
      reportInboundCall({ callSid: sid, from, leadId, status: 'blocked' });
      try {
        await fetch('/api/telephony/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone: from, leadId }),
        });
      } catch { /* still hang up */ }
    }
    if (!showLeadCardRef.current) {
      setMatchedLead(null);
      setActiveName(null);
    }
  }, [incomingFrom, missedBanner]);

  // Incoming caller (ring or after Answer) → Inbox so you can text and edit notes.
  useEffect(() => {
    if (onMobileText || !matchedLead?.id) return;
    const ringing = !!incomingFrom;
    const liveIncoming = status === 'in-call' && incomingSessionRef.current;
    if (!ringing && !liveIncoming) return;
    const target = `/inbox?leadId=${encodeURIComponent(matchedLead.id)}`;
    if (typeof window !== 'undefined') {
      const here = window.location.pathname === '/inbox'
        && new URLSearchParams(window.location.search).get('leadId') === matchedLead.id;
      if (here) return;
    }
    router.push(target);
  }, [matchedLead?.id, incomingFrom, status, onMobileText, router]);

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
    activeNumber, activeName, incomingFrom, muted, waitingForHuman, error,
    connect, hangup, handOffLive, toggleMute, sendDigits, acceptIncoming, rejectIncoming,
    activeLead: matchedLead,
    dialPadOpen, dialPadNumber, fromNumber, openDialPad, closeDialPad,
  };

  const inCall = status === 'connecting' || status === 'ringing' || status === 'in-call';

  useEffect(() => {
    if (!inCall) {
      setCallDock(null);
      return;
    }
    const find = () => setCallDock(document.getElementById('webphone-call-dock'));
    find();
    const t = window.setTimeout(find, 50);
    return () => window.clearTimeout(t);
  }, [inCall, pathname]);

  return (
    <WebPhoneContext.Provider value={value}>
      {children}

      {/* ── Incoming / missed call toast ── */}
      {(incomingFrom || missedBanner) && (
        <div className="fixed top-5 right-5 z-[110] w-80 rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-xl">
          <p className="mb-0.5 text-xs text-[#9ca3af]">
            {incomingFrom ? 'Incoming call' : 'Missed call'}
          </p>
          <p className="text-base font-semibold text-[#1a1a1a]">
            {incomingFrom
              ? (matchedLead?.name || activeName || fmtNumber(incomingFrom))
              : (missedBanner?.name || fmtNumber(missedBanner?.from || ''))}
          </p>
          {(incomingFrom ? matchedLead?.company : missedBanner?.company) && (
            <p className="truncate text-[13px] text-[#6b6b6b]">
              {incomingFrom ? matchedLead?.company : missedBanner?.company}
            </p>
          )}
          <p className="mt-0.5 text-xs text-[#9ca3af]">
            {fmtNumber(incomingFrom || missedBanner?.from || '')}
          </p>
          {incomingFrom ? (
            <>
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
              <button
                type="button"
                onClick={() => void blockIncoming()}
                className="mt-2 w-full rounded-xl border border-[#e5e5e5] py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#f5f5f5]"
              >
                Block this number
              </button>
              {matchedLead && (
                <button
                  type="button"
                  onClick={() => setShowLeadCard(true)}
                  className="mt-2 w-full rounded-xl border border-[#e5e5e5] py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#f5f5f5]"
                >
                  Open lead card
                </button>
              )}
            </>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const n = missedBanner?.from;
                    setMissedBanner(null);
                    if (n) void connect(n, {
                      name: missedBanner?.name || undefined,
                      leadId: missedBanner?.leadId || undefined,
                      company: missedBanner?.company || undefined,
                    }).catch(() => {});
                  }}
                  className="flex-1 rounded-xl bg-[#1a1a1a] py-2 text-sm font-medium text-white hover:bg-black"
                >
                  Call back
                </button>
                <button
                  type="button"
                  onClick={() => void blockIncoming()}
                  className="flex-1 rounded-xl border border-[#e5e5e5] py-2 text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f5f5]"
                >
                  Block
                </button>
              </div>
              {missedBanner?.leadId && (
                <button
                  type="button"
                  onClick={() => {
                    setShowLeadCard(true);
                    if (missedBanner.leadId) {
                      setMatchedLead({
                        id: missedBanner.leadId,
                        name: missedBanner.name || missedBanner.from,
                        company: missedBanner.company,
                      });
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-[#e5e5e5] py-2 text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f5f5]"
                >
                  Open lead card
                </button>
              )}
            </>
          )}
        </div>
      )}

      {showLeadCard && matchedLead && !onMobileText && (
        <LeadCardOverlay
          leadId={matchedLead.id}
          leadName={matchedLead.name}
          leadCompany={matchedLead.company}
          inCall={inCall}
          onClose={() => setShowLeadCard(false)}
        />
      )}

      {/* ── Call bar ── */}
      {inCall && !incomingFrom && (() => {
        const bar = (
          <div className={callDock ? 'w-full' : 'fixed bottom-0 right-0 z-[100] w-80'}>
            {showKeypad && status === 'in-call' && (
              <div className="bg-[#1a1a1a] p-3 grid grid-cols-3 gap-1.5">
                {KEYPAD.map(d => (
                  <button
                    key={d}
                    onClick={() => sendDigits(d)}
                    className="h-11 bg-white/10 hover:bg-white/25 text-white text-base font-medium transition-colors"
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-[#1a1a1a] text-white px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {matchedLead?.name || activeName || fmtNumber(activeNumber)}
                </p>
                {matchedLead?.company && (
                  <p className="truncate text-xs text-white/80">{matchedLead.company}</p>
                )}
                <p className="text-xs text-white/60">
                  {status === 'connecting' && 'Connecting…'}
                  {status === 'ringing' && 'Ringing…'}
                  {status === 'in-call' && (elapsed ?? 'Connected')}
                  {(matchedLead || activeName) && activeNumber ? ` · ${fmtNumber(activeNumber)}` : ''}
                </p>
              </div>

              {matchedLead && (
                <button
                  onClick={() => setShowLeadCard(true)}
                  title="Open lead card"
                  className={`shrink-0 rounded-full p-2.5 transition-colors ${showLeadCard ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
              )}

              <button
                onClick={toggleMute}
                disabled={status !== 'in-call'}
                title={muted ? 'Unmute' : 'Mute'}
                className={`shrink-0 p-2.5 rounded-full transition-colors disabled:opacity-30 ${muted ? 'bg-yellow-500 text-black' : 'bg-white/10 hover:bg-white/20'}`}
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

              <button
                onClick={() => setShowKeypad(v => !v)}
                disabled={status !== 'in-call'}
                title="Keypad"
                className={`shrink-0 p-2.5 rounded-full transition-colors disabled:opacity-30 ${showKeypad ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="6" cy="5" r="1.8" /><circle cx="12" cy="5" r="1.8" /><circle cx="18" cy="5" r="1.8" />
                  <circle cx="6" cy="11" r="1.8" /><circle cx="12" cy="11" r="1.8" /><circle cx="18" cy="11" r="1.8" />
                  <circle cx="6" cy="17" r="1.8" /><circle cx="12" cy="17" r="1.8" /><circle cx="18" cy="17" r="1.8" />
                </svg>
              </button>

              <button
                onClick={hangup}
                title="Hang up"
                className="shrink-0 p-2.5 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
              >
                <svg className="w-4 h-4 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
                </svg>
              </button>
            </div>
          </div>
        );
        if (callDock) return createPortal(bar, callDock);
        return bar;
      })()}

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
