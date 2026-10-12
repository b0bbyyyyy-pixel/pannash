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

type DripJob = {
  id: string;
  list_id: string;
  status: string;
  sent_count: number | null;
};

export default function SwitchboardPanel({
  autoCall,
  dialerOpen,
  phoneStatus,
}: {
  autoCall: boolean;
  dialerOpen: boolean;
  phoneStatus: PhoneStatus;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(new SwitchboardEngine());
  const { pulse } = useSync();
  const seenPulse = useRef(new Set<string>());
  const declinedRef = useRef(0);
  const dripRef = useRef({ sent: 0, failed: 0, active: false, listId: '', primed: false });
  const pulsePrimed = useRef(false);
  const countsRef = useRef<SwitchboardCounts>({ funded: 0, offers: 0, docsIn: 0, day: 1, daysInMonth: 31 });
  const actRef = useRef({ autoCall, dialerOpen, phoneStatus, visible: true });
  actRef.current = { autoCall, dialerOpen, phoneStatus, visible: actRef.current.visible };

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

  const loadDrip = useCallback(async () => {
    try {
      const res = await fetch('/api/sms/drip', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { jobs?: DripJob[] };
      const jobs = data.jobs ?? [];
      const active = jobs.find(j => j.status === 'active') ?? null;
      const prev = dripRef.current;
      const wasActive = prev.active;
      if (!prev.primed) {
        dripRef.current = {
          sent: active?.sent_count ?? 0,
          failed: prev.failed,
          active: !!active,
          listId: active?.list_id ?? '',
          primed: true,
        };
        applyActivity();
        if (active) {
          const det = await fetch(`/api/sms/drip?listId=${encodeURIComponent(active.list_id)}`, { cache: 'no-store' });
          if (det.ok) {
            const body = await det.json() as { tally?: { failed?: number } };
            dripRef.current.failed = body.tally?.failed ?? 0;
          }
        }
        return;
      }
      dripRef.current = {
        sent: active?.sent_count ?? 0,
        failed: prev.failed,
        active: !!active,
        listId: active?.list_id ?? '',
        primed: true,
      };
      applyActivity();

      if (wasActive && !active) {
        emit('smsDone', 3);
        dripRef.current.failed = 0;
        return;
      }
      if (!active) return;

      const delta = Math.max(0, (active.sent_count ?? 0) - prev.sent);
      if (delta > 0) emit('sms', Math.min(6, delta));

      const det = await fetch(`/api/sms/drip?listId=${encodeURIComponent(active.list_id)}`, { cache: 'no-store' });
      if (!det.ok) return;
      const body = await det.json() as { tally?: { failed?: number; sent?: number } };
      const failed = body.tally?.failed ?? 0;
      const failDelta = Math.max(0, failed - prev.failed);
      dripRef.current.failed = failed;
      if (failDelta > 0) emit('smsFail', Math.min(4, failDelta));
    } catch {
      /* ignore */
    }
  }, [applyActivity, emit]);

  usePolling(loadCounts, 45_000, true, true);
  usePolling(loadDrip, 8_000, true, true);

  useEffect(() => {
    applyActivity();
  }, [autoCall, dialerOpen, phoneStatus, applyActivity]);

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
    if (!pulsePrimed.current) {
      for (const row of rows) {
        seenPulse.current.add(`${row.lead_id}:${row.last_message_at ?? ''}`);
      }
      pulsePrimed.current = true;
      return;
    }
    for (const row of rows) {
      const key = `${row.lead_id}:${row.last_message_at ?? ''}`;
      if (seenPulse.current.has(key)) continue;
      seenPulse.current.add(key);
      if (row.last_direction === 'inbound') emit('smsReply', 1);
      else emit(campaign ? 'sms' : 'text', 1);
    }
    if (seenPulse.current.size > 400) {
      seenPulse.current = new Set([...seenPulse.current].slice(-200));
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
