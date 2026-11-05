'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebPhone } from '@/components/webphone/WebPhone';
import { callingTimezone, isWithinDialingHours } from '@/lib/dialer/canDial';
import { huntVerdict } from '@/lib/dialer/hunt';
import type { Lead, Campaign } from './DialerClient';

export type DialerState = 'loading' | 'ready' | 'on_call' | 'wrap_up' | 'saving' | 'empty';
export type DispositionKey = 'prospect' | 'new_lead' | 'dnc' | 'no_answer' | 'voicemail' | 'busy';

interface QueuePreview {
  id: string;
  name: string;
  company: string | null;
  phone_e164: string;
  last_disposition: string | null;
}

const LIVE_PHONE = new Set(['connecting', 'ringing', 'in-call']);
const HUNT_SKIP_CAP = 80;

export function useDialerSession() {
  const [state, setState] = useState<DialerState>('loading');
  const [lead, setLead] = useState<Lead | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuePreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [autoCall, setAutoCall] = useState(true);
  const [hunt, setHunt] = useState(false);
  const [huntFlash, setHuntFlash] = useState(false);
  const [showCallCount, setShowCallCount] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const initDone = useRef(false);
  const pendingAutoCallRef = useRef(false);
  const pendingHuntRef = useRef(false);
  const callInFlightRef = useRef(false);
  const handedOffRef = useRef(false);
  const skipInFlightRef = useRef(false);
  const huntOnRef = useRef(false);
  const skipCountRef = useRef(0);
  const leadRef = useRef<Lead | null>(null);
  const callIdRef = useRef<string | null>(null);
  const webphone = useWebPhone();
  const listIdRef = useRef<string | null>(null);

  leadRef.current = lead;
  callIdRef.current = callId;
  huntOnRef.current = hunt;

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
          if (huntOnRef.current) pendingHuntRef.current = true;
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
    try { setTestMode(localStorage.getItem('dialer_test_mode') === '1'); } catch { /* ignore */ }
    try {
      if (localStorage.getItem('dialer_auto_call') === '0') setAutoCall(false);
    } catch { /* ignore */ }
    try {
      if (localStorage.getItem('dialer_hunt') === '1') {
        setHunt(true);
        huntOnRef.current = true;
      }
    } catch { /* ignore */ }
    let saved: Campaign | null = null;
    try {
      const raw = localStorage.getItem('dialer_active_campaign');
      if (raw) saved = JSON.parse(raw) as Campaign;
    } catch { /* ignore */ }
    if (saved?.id) {
      setActiveCampaign(saved);
      listIdRef.current = saved.id;
      loadCurrent(saved.id);
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
        if (huntOnRef.current) pendingHuntRef.current = true;
      } else {
        setLead(null);
        setState('empty');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
      setState('empty');
    }
  };

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
        if (huntOnRef.current) pendingHuntRef.current = true;
      } else if (freshQueue.length > 0) {
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

  const handleLoadCampaign = async (campaign: Campaign) => {
    setShowPicker(false);
    setActiveCampaign(campaign);
    listIdRef.current = campaign.id;
    try { localStorage.setItem('dialer_active_campaign', JSON.stringify(campaign)); } catch { /* ignore */ }
    if (huntOnRef.current) pendingHuntRef.current = true;
    await claimNext(lead?.id ?? null, campaign.id);
  };

  const handleClearCampaign = async () => {
    setActiveCampaign(null);
    listIdRef.current = null;
    try { localStorage.removeItem('dialer_active_campaign'); } catch { /* ignore */ }
    pendingHuntRef.current = false;
    await claimNext(lead?.id ?? null, null);
  };

  const toggleTestMode = () => {
    setTestMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('dialer_test_mode', next ? '1' : '0'); } catch { /* ignore */ }
      if (next) {
        setHunt(false);
        huntOnRef.current = false;
        pendingHuntRef.current = false;
        try { localStorage.setItem('dialer_hunt', '0'); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const toggleAutoCall = () => {
    setAutoCall((prev) => {
      const next = !prev;
      try { localStorage.setItem('dialer_auto_call', next ? '1' : '0'); } catch { /* ignore */ }
      if (!next) pendingAutoCallRef.current = false;
      return next;
    });
  };

  const handleCall = useCallback(async () => {
    const current = leadRef.current;
    if (!current || callInFlightRef.current) return;
    const hunting = huntOnRef.current;
    const tz = callingTimezone(current);
    if (!tz || !isWithinDialingHours(tz)) {
      setError('Outside calling hours for this lead\'s local time (8am–9pm).');
      pendingAutoCallRef.current = false;
      if (hunting) {
        pendingHuntRef.current = true;
        await claimNext(current.id);
      }
      return;
    }
    callInFlightRef.current = true;
    pendingAutoCallRef.current = false;
    pendingHuntRef.current = false;
    handedOffRef.current = false;
    try {
      const res = await fetch('/api/dialer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: current.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start call');
      setCallId(data.callId);
      callIdRef.current = data.callId;
      if (!testMode) {
        try {
          await webphone.connect(current.phone_e164, {
            name: current.name,
            leadId: current.id,
            company: current.company ?? undefined,
            hunt: hunting,
            callDbId: data.callId,
          });
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Could not start call');
          setState('wrap_up');
          return;
        }
      }
      setState(testMode ? 'wrap_up' : 'on_call');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error starting call');
    } finally {
      callInFlightRef.current = false;
    }
  }, [testMode, webphone]);

  const skipHunt = useCallback(async (disposition: 'no_answer' | 'voicemail' | 'busy') => {
    if (skipInFlightRef.current) return;
    skipInFlightRef.current = true;
    const current = leadRef.current;
    const id = callIdRef.current;
    try { webphone.hangup(); } catch { /* ignore */ }
    skipCountRef.current += 1;
    if (skipCountRef.current >= HUNT_SKIP_CAP) {
      setHunt(false);
      huntOnRef.current = false;
      pendingHuntRef.current = false;
      try { localStorage.setItem('dialer_hunt', '0'); } catch { /* ignore */ }
      setError('Hunt paused after 80 tries with no live pickup. Turn Hunt back on when you\'re ready.');
    }
    try {
      if (current && id) {
        await fetch('/api/dialer/disposition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: id, leadId: current.id, disposition }),
        });
        setActiveCampaign((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, called: Math.min(prev.called + 1, prev.total) };
          try { localStorage.setItem('dialer_active_campaign', JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      }
      if (huntOnRef.current) pendingHuntRef.current = true;
      await claimNext(current?.id ?? null);
    } catch (e: unknown) {
      pendingHuntRef.current = false;
      setError(e instanceof Error ? e.message : 'Hunt skip failed');
      setState('wrap_up');
    } finally {
      skipInFlightRef.current = false;
    }
  }, [webphone]);

  const toggleHunt = () => {
    setHunt((prev) => {
      const next = !prev;
      huntOnRef.current = next;
      try { localStorage.setItem('dialer_hunt', next ? '1' : '0'); } catch { /* ignore */ }
      if (next) {
        setTestMode(false);
        try { localStorage.setItem('dialer_test_mode', '0'); } catch { /* ignore */ }
        skipCountRef.current = 0;
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
        } catch { /* ignore */ }
        if (state === 'ready' && leadRef.current) pendingHuntRef.current = true;
      } else {
        pendingHuntRef.current = false;
        if (webphone.waitingForHuman) {
          try { webphone.hangup(); } catch { /* ignore */ }
          setState('ready');
        }
      }
      return next;
    });
  };

  const handleHangup = () => {
    webphone.hangup();
    if (huntOnRef.current && !handedOffRef.current) return;
    setState('wrap_up');
  };

  const wasLiveRef = useRef(false);
  useEffect(() => {
    const live = LIVE_PHONE.has(webphone.status);
    if (live) wasLiveRef.current = true;
    if (state === 'on_call' && wasLiveRef.current && !live) {
      wasLiveRef.current = false;
      if (huntOnRef.current && !handedOffRef.current && !skipInFlightRef.current) {
        void (async () => {
          const id = callIdRef.current;
          let verdict: ReturnType<typeof huntVerdict> = 'no_answer';
          if (id) {
            try {
              const res = await fetch(`/api/dialer/call-status?id=${id}`);
              if (res.ok) {
                const snap = await res.json();
                verdict = huntVerdict(snap);
                if (verdict === 'wait') verdict = snap.answered_at ? 'human' : 'no_answer';
              }
            } catch { /* default no_answer */ }
          }
          if (verdict === 'human' || verdict === 'wait') {
            setState('wrap_up');
            return;
          }
          await skipHunt(verdict);
        })();
        return;
      }
      setState('wrap_up');
    }
    if (state !== 'on_call') wasLiveRef.current = live;
  }, [webphone.status, state, skipHunt]);

  useEffect(() => {
    if (hunt && state === 'on_call' && !webphone.waitingForHuman && webphone.status === 'in-call') {
      handedOffRef.current = true;
    }
  }, [hunt, state, webphone.waitingForHuman, webphone.status]);

  useEffect(() => {
    if (!hunt || state !== 'on_call' || !callId || handedOffRef.current || testMode) return;
    let stop = false;
    const tick = async () => {
      if (stop || handedOffRef.current || skipInFlightRef.current) return;
      try {
        const res = await fetch(`/api/dialer/call-status?id=${callId}`);
        if (!res.ok) return;
        const verdict = huntVerdict(await res.json());
        if (verdict === 'human') {
          handedOffRef.current = true;
          skipCountRef.current = 0;
          webphone.handOffLive();
          setHuntFlash(true);
          window.setTimeout(() => setHuntFlash(false), 3500);
          return;
        }
        if (verdict === 'voicemail' || verdict === 'no_answer' || verdict === 'busy') {
          await skipHunt(verdict);
        }
      } catch { /* next tick */ }
    };
    const t = window.setInterval(() => { void tick(); }, 500);
    void tick();
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [hunt, state, callId, testMode, webphone, skipHunt]);

  const handleDisposition = async (disposition: DispositionKey, notes: string) => {
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setActiveCampaign((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, called: Math.min(prev.called + 1, prev.total) };
        try { localStorage.setItem('dialer_active_campaign', JSON.stringify(updated)); } catch { /* ignore */ }
        return updated;
      });
      pendingAutoCallRef.current = autoCall && !huntOnRef.current;
      pendingHuntRef.current = huntOnRef.current;
      await claimNext(lead.id);
    } catch (e: unknown) {
      pendingAutoCallRef.current = false;
      pendingHuntRef.current = false;
      setError(e instanceof Error ? e.message : 'Error saving disposition');
      setState('wrap_up');
    }
  };

  // After Save & next (or hunt skip), auto-dial the newly claimed lead.
  useEffect(() => {
    if (state !== 'ready' || !lead) return;
    const goHunt = hunt && pendingHuntRef.current;
    const goAuto = autoCall && pendingAutoCallRef.current && !hunt;
    if (!goHunt && !goAuto) return;
    const t = window.setTimeout(() => {
      pendingAutoCallRef.current = false;
      pendingHuntRef.current = false;
      void handleCall();
    }, goHunt ? 600 : 350);
    return () => window.clearTimeout(t);
  }, [state, lead, autoCall, hunt, handleCall]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key.toLowerCase() === 'c' && state === 'ready') handleCall();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, handleCall]);

  const campaignPct = activeCampaign && activeCampaign.total > 0
    ? Math.round((activeCampaign.called / activeCampaign.total) * 100)
    : 0;

  const hunting = hunt && state === 'on_call' && webphone.waitingForHuman && !handedOffRef.current;

  return {
    state, lead, queue, error, setError,
    activeCampaign, showPicker, setShowPicker,
    testMode, toggleTestMode, autoCall, toggleAutoCall,
    hunt, toggleHunt, hunting, huntFlash,
    showCallCount, setShowCallCount,
    showEmailModal, setShowEmailModal,
    webphone, campaignPct, claimNext,
    handleLoadCampaign, handleClearCampaign,
    handleCall, handleHangup, handleDisposition, setLead,
  };
}
