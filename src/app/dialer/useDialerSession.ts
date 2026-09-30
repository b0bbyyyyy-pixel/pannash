'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebPhone } from '@/components/webphone/WebPhone';
import type { Lead, Campaign } from './DialerClient';

export type DialerState = 'loading' | 'ready' | 'on_call' | 'wrap_up' | 'saving' | 'empty';
export type DispositionKey = 'prospect' | 'new_lead' | 'dnc' | 'no_answer';

interface QueuePreview {
  id: string;
  name: string;
  company: string | null;
  phone_e164: string;
  last_disposition: string | null;
}

const LIVE_PHONE = new Set(['connecting', 'ringing', 'in-call']);

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
  const [showCallCount, setShowCallCount] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const initDone = useRef(false);
  const pendingAutoCallRef = useRef(false);
  const callInFlightRef = useRef(false);
  const webphone = useWebPhone();
  const listIdRef = useRef<string | null>(null);

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
    try { setTestMode(localStorage.getItem('dialer_test_mode') === '1'); } catch { /* ignore */ }
    try {
      if (localStorage.getItem('dialer_auto_call') === '0') setAutoCall(false);
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
    await claimNext(lead?.id ?? null, campaign.id);
  };

  const handleClearCampaign = async () => {
    setActiveCampaign(null);
    listIdRef.current = null;
    try { localStorage.removeItem('dialer_active_campaign'); } catch { /* ignore */ }
    await claimNext(lead?.id ?? null, null);
  };

  const toggleTestMode = () => {
    setTestMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('dialer_test_mode', next ? '1' : '0'); } catch { /* ignore */ }
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
    if (!lead || callInFlightRef.current) return;
    callInFlightRef.current = true;
    pendingAutoCallRef.current = false;
    try {
      if (!testMode) {
        try {
          await webphone.connect(lead.phone_e164, { name: lead.name, leadId: lead.id, company: lead.company ?? undefined });
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Could not start call');
          return;
        }
      }
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
    } finally {
      callInFlightRef.current = false;
    }
  }, [lead, testMode, webphone]);

  const handleHangup = () => {
    webphone.hangup();
    setState('wrap_up');
  };

  const wasLiveRef = useRef(false);
  useEffect(() => {
    const live = LIVE_PHONE.has(webphone.status);
    if (live) wasLiveRef.current = true;
    if (state === 'on_call' && wasLiveRef.current && !live) {
      wasLiveRef.current = false;
      setState('wrap_up');
    }
    if (state !== 'on_call') wasLiveRef.current = live;
  }, [webphone.status, state]);

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
      pendingAutoCallRef.current = autoCall;
      await claimNext(lead.id);
    } catch (e: unknown) {
      pendingAutoCallRef.current = false;
      setError(e instanceof Error ? e.message : 'Error saving disposition');
      setState('wrap_up');
    }
  };

  // After Save & next, auto-dial the newly claimed lead (not on first load / campaign switch).
  useEffect(() => {
    if (state !== 'ready' || !lead || !autoCall || !pendingAutoCallRef.current) return;
    const t = window.setTimeout(() => {
      pendingAutoCallRef.current = false;
      void handleCall();
    }, 350);
    return () => window.clearTimeout(t);
  }, [state, lead, autoCall, handleCall]);

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

  return {
    state, lead, queue, error, setError,
    activeCampaign, showPicker, setShowPicker,
    testMode, toggleTestMode, autoCall, toggleAutoCall, showCallCount, setShowCallCount,
    showEmailModal, setShowEmailModal,
    webphone, campaignPct, claimNext,
    handleLoadCampaign, handleClearCampaign,
    handleCall, handleHangup, handleDisposition, setLead,
  };
}
