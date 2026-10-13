'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSync } from '@/lib/sync/SyncProvider';
import { usePolling } from '@/lib/sync/usePolling';
import { PIPELINE_LEAD_MSG } from '@/lib/pipeline/iframeMessages';
import { SwitchboardEngine, type BlipKind, type SwitchboardCounts } from '@/lib/switchboard/engine';

type PhoneStatus = 'offline' | 'ready' | 'connecting' | 'ringing' | 'in-call';

const LIVE_PHONE = new Set<PhoneStatus>(['connecting', 'ringing', 'in-call']);
const DECLINE_RE = /declin/i;
const FUNDED_RE = /^funded$/i;
const OFFER_RE = /offer|approv|pre-qualified/i;
const DOCS_RE = /docs in|docs received/i;

type LivePayload = {
  drip?: { active: boolean; sent: number; failed: number };
  inbound?: { leadId: string; at: string | null }[];
};

export default function SwitchboardPanel({
  autoCall,
  dialerOpen,
  phoneStatus,
  aiOn = false,
}: {
  autoCall: boolean;
  dialerOpen: boolean;
  phoneStatus: PhoneStatus;
  aiOn?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(new SwitchboardEngine());
  const { pulse } = useSync();
  const seenEvents = useRef(new Set<string>());
  const declinedRef = useRef(0);
  const dripRef = useRef({ sent: 0, failed: 0, active: false, primed: false });
  const pulsePrimed = useRef(false);
  const countsRef = useRef<SwitchboardCounts>({ funded: 0, offers: 0, docsIn: 0, prospects: 0, submitted: 0, approvals: 0, day: 1, daysInMonth: 31 });
  const actRef = useRef({ autoCall, dialerOpen, phoneStatus, aiOn, visible: true });
  actRef.current = { autoCall, dialerOpen, phoneStatus, aiOn, visible: actRef.current.visible };

  const applyActivity = useCallback(() => {
    const a = actRef.current;
    const visible = a.visible && (typeof document === 'undefined' || !document.hidden);
    const phoneLive = LIVE_PHONE.has(a.phoneStatus);
    const dialerLive = visible && a.dialerOpen && a.autoCall && phoneLive;
    const frozen = !visible;
    engineRef.current.setActivity({
      frozen,
      dialerLive,
      campaignLive: dripRef.current.active && visible,
      aiLive: a.aiOn && visible,
    });
  }, []);

  const emit = useCallback((kind: BlipKind, n = 1) => {
    applyActivity();
    engineRef.current.pulse(kind, n);
  }, [applyActivity]);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/switchboard', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as SwitchboardCounts & { declined?: number };
      countsRef.current = {
        funded: data.funded ?? 0,
        offers: data.offers ?? 0,
        docsIn: data.docsIn ?? 0,
        prospects: data.prospects ?? 0,
        submitted: data.submitted ?? 0,
        approvals: data.approvals ?? 0,
        day: data.day ?? 1,
        daysInMonth: data.daysInMonth ?? 31,
      };
      engineRef.current.setCounts(countsRef.current);
      const declined = data.declined ?? 0;
      if (declinedRef.current && declined > declinedRef.current) {
        emit('declined', Math.min(4, declined - declinedRef.current));
      }
      declinedRef.current = declined;
    } catch {
      /* ignore */
    }
  }, [emit]);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch('/api/switchboard?live=1', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as LivePayload;
      const drip = data.drip ?? { active: false, sent: 0, failed: 0 };
      const prev = dripRef.current;
      const first = !prev.primed;
      dripRef.current = {
        sent: drip.sent,
        failed: drip.failed,
        active: drip.active,
        primed: true,
      };
      applyActivity();

      if (!first) {
        if (prev.active && !drip.active) emit('smsDone', 3);
        const sentDelta = Math.max(0, drip.sent - prev.sent);
        if (drip.active && sentDelta > 0) emit('sms', Math.min(8, sentDelta));
        const failDelta = Math.max(0, drip.failed - prev.failed);
        if (drip.active && failDelta > 0) emit('smsFail', Math.min(4, failDelta));
      }

      const now = Date.now();
      for (const row of data.inbound ?? []) {
        const key = `${row.leadId}:${row.at ?? ''}`;
        if (seenEvents.current.has(key)) continue;
        seenEvents.current.add(key);
        const at = row.at ? new Date(row.at).getTime() : 0;
        if (first && now - at > 20_000) continue;
        if (now - at > 45_000) continue;
        emit('smsReply', 1);
      }
      if (seenEvents.current.size > 400) {
        seenEvents.current = new Set([...seenEvents.current].slice(-200));
      }
    } catch {
      /* ignore */
    }
  }, [applyActivity, emit]);

  usePolling(loadCounts, 45_000, true, true);
  usePolling(loadLive, 15_000, true, true);

  useEffect(() => {
    applyActivity();
  }, [autoCall, dialerOpen, phoneStatus, aiOn, applyActivity]);

  useEffect(() => {
    const onVis = () => {
      actRef.current.visible = !document.hidden;
      applyActivity();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [applyActivity]);

  useEffect(() => {
    const rows = pulse?.inboxChanged ?? [];
    if (!rows.length) return;
    const campaign = dripRef.current.active;
    const now = Date.now();
    for (const row of rows) {
      const key = `${row.lead_id}:${row.last_message_at ?? ''}`;
      if (seenEvents.current.has(key)) continue;
      seenEvents.current.add(key);
      const at = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
      if (!pulsePrimed.current && now - at > 8_000) continue;
      if (now - at > 45_000) continue;
      if (row.last_direction === 'inbound') emit('smsReply', 1);
      else emit(campaign ? 'sms' : 'text', 1);
    }
    pulsePrimed.current = true;
    if (seenEvents.current.size > 400) {
      seenEvents.current = new Set([...seenEvents.current].slice(-200));
    }
  }, [pulse, emit]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; patch?: Record<string, unknown> } | null;
      if (!d || d.type !== PIPELINE_LEAD_MSG) return;
      const status = String(d.patch?.lead_status ?? '');
      if (!status) return;
      if (DECLINE_RE.test(status)) emit('declined', 1);
      if (FUNDED_RE.test(status) || OFFER_RE.test(status) || DOCS_RE.test(status) || DECLINE_RE.test(status)) {
        void loadCounts();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [emit, loadCounts]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const engine = engineRef.current;
    let raf = 0;
    let dead = false;

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.setSize(w, h);
      engine.setCounts(countsRef.current);
    };

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();

    const loop = (t: number) => {
      if (dead) return;
      const ctx = canvas.getContext('2d');
      if (ctx && !document.hidden) engine.tick(t, ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative flex-1 min-h-0 w-full overflow-hidden bg-[#fafafa]"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block"
        role="img"
        aria-label="Monthly switchboard"
      />
    </div>
  );
}
