'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSync } from '@/lib/sync/SyncProvider';
import { usePolling } from '@/lib/sync/usePolling';
import { PIPELINE_LEAD_MSG } from '@/lib/pipeline/iframeMessages';
import { SwitchboardEngine, type BlipKind, type SwitchboardCounts } from '@/lib/switchboard/engine';
import {
  readFlashIntensity,
  writeFlashIntensity,
  SWITCHBOARD_PREFS_EVENT,
  type FlashIntensity,
} from '@/lib/switchboard/prefs';

type PhoneStatus = 'offline' | 'ready' | 'connecting' | 'ringing' | 'in-call';

const DECLINE_RE = /declin/i;
const EXTREME_RE = /declin|funded|docs in|docs received|approv|pre-qualified|submitted/i;
const BOARD_EVENT = 'gostwrk-board';

type LivePayload = {
  drip?: { active: boolean; sent: number; failed: number };
  inbound?: { leadId: string; at: string | null }[];
  composing?: boolean;
  emails?: { at: string }[];
};

export function emitBoardEvent(kind: 'email' | 'status') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BOARD_EVENT, { detail: { kind } }));
}

export default function SwitchboardPanel({
  autoCall: _autoCall,
  dialerOpen: _dialerOpen,
  phoneStatus: _phoneStatus,
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
  const kickRef = useRef<() => void>(() => {});
  const { pulse } = useSync();
  const seenEvents = useRef(new Set<string>());
  const declinedRef = useRef(0);
  const countsPrimed = useRef(false);
  const countsRef = useRef<SwitchboardCounts>({ funded: 0, offers: 0, docsIn: 0, prospects: 0, submitted: 0, approvals: 0, day: 1, daysInMonth: 31 });
  const dripRef = useRef({ sent: 0, failed: 0, active: false, primed: false });
  const pulsePrimed = useRef(false);
  const visibleRef = useRef(true);
  const aiOnRef = useRef(aiOn);
  aiOnRef.current = aiOn;

  const applyFrozen = useCallback(() => {
    const visible = visibleRef.current && (typeof document === 'undefined' || !document.hidden);
    engineRef.current.setActivity({
      frozen: !visible,
      campaignLive: visible && dripRef.current.active,
      aiLive: visible && aiOnRef.current,
    });
    if (visible && (aiOnRef.current || dripRef.current.active)) kickRef.current();
  }, []);

  const kick = useCallback(() => {
    kickRef.current();
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) engineRef.current.drawNow(ctx);
  }, []);

  const applyIntensity = useCallback((next: FlashIntensity) => {
    engineRef.current.setIntensity(next);
    if (next === 'off') paint();
  }, [paint]);

  const emit = useCallback((kind: BlipKind, n = 1) => {
    applyFrozen();
    engineRef.current.pulse(kind, n);
    kick();
  }, [applyFrozen, kick]);

  const burst = useCallback((ms = 1500) => {
    applyFrozen();
    engineRef.current.burst(ms);
    kick();
  }, [applyFrozen, kick]);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/switchboard', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as SwitchboardCounts & { declined?: number };
      const next: SwitchboardCounts = {
        funded: data.funded ?? 0,
        offers: data.offers ?? 0,
        docsIn: data.docsIn ?? 0,
        prospects: data.prospects ?? 0,
        submitted: data.submitted ?? 0,
        approvals: data.approvals ?? 0,
        day: data.day ?? 1,
        daysInMonth: data.daysInMonth ?? 31,
      };
      const prev = countsRef.current;
      countsRef.current = next;
      engineRef.current.setCounts(next);
      paint();
      const declined = data.declined ?? 0;
      if (countsPrimed.current) {
        const jumped =
          next.funded > prev.funded ||
          next.docsIn > prev.docsIn ||
          next.approvals > prev.approvals ||
          next.submitted > prev.submitted ||
          declined > declinedRef.current;
        if (jumped) burst(1600);
      }
      declinedRef.current = declined;
      countsPrimed.current = true;
    } catch {
      /* ignore */
    }
  }, [burst, paint]);

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
      applyFrozen();
      engineRef.current.setComposing(!!data.composing);
      if (data.composing || drip.active) kick();

      if (!first) {
        const sentDelta = Math.max(0, drip.sent - prev.sent);
        if (sentDelta > 0) emit('text', Math.min(2, sentDelta));
      }

      const now = Date.now();
      for (const row of data.inbound ?? []) {
        const key = `in:${row.leadId}:${row.at ?? ''}`;
        if (seenEvents.current.has(key)) continue;
        seenEvents.current.add(key);
        const at = row.at ? new Date(row.at).getTime() : 0;
        if (first && now - at > 20_000) continue;
        if (now - at > 45_000) continue;
        emit('smsReply', 1 + (Math.floor(now / 1000) % 2));
      }
      for (const row of data.emails ?? []) {
        const key = `em:${row.at}`;
        if (seenEvents.current.has(key)) continue;
        seenEvents.current.add(key);
        const at = row.at ? new Date(row.at).getTime() : 0;
        if (first && now - at > 20_000) continue;
        if (now - at > 45_000) continue;
        burst(1600);
      }
      if (seenEvents.current.size > 400) {
        seenEvents.current = new Set([...seenEvents.current].slice(-200));
      }
    } catch {
      /* ignore */
    }
  }, [applyFrozen, burst, emit, kick]);

  usePolling(loadCounts, 45_000, true, true);
  usePolling(loadLive, 5_000, true, true);

  useEffect(() => {
    applyFrozen();
  }, [aiOn, applyFrozen]);

  useEffect(() => {
    applyFrozen();
    applyIntensity(readFlashIntensity());
    fetch('/api/settings/casper')
      .then(r => r.json())
      .then(d => {
        const next = typeof d.switchboard_flash_intensity === 'string'
          ? d.switchboard_flash_intensity as FlashIntensity
          : null;
        if (!next) return;
        writeFlashIntensity(next);
        applyIntensity(next);
      })
      .catch(() => { /* local pref stands */ });
  }, [applyFrozen, applyIntensity]);

  useEffect(() => {
    const onPrefs = (e: Event) => {
      const next = (e as CustomEvent<{ intensity?: FlashIntensity }>).detail?.intensity;
      if (next) applyIntensity(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'gostwrk-switchboard') return;
      applyIntensity(readFlashIntensity());
    };
    window.addEventListener(SWITCHBOARD_PREFS_EVENT, onPrefs);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SWITCHBOARD_PREFS_EVENT, onPrefs);
      window.removeEventListener('storage', onStorage);
    };
  }, [applyIntensity]);

  useEffect(() => {
    const onVis = () => {
      visibleRef.current = !document.hidden;
      applyFrozen();
      if (!document.hidden) kick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [applyFrozen, kick]);

  useEffect(() => {
    const rows = pulse?.inboxChanged ?? [];
    if (!rows.length) return;
    const now = Date.now();
    for (const row of rows) {
      const key = `in:${row.lead_id}:${row.last_message_at ?? ''}`;
      if (seenEvents.current.has(key)) continue;
      seenEvents.current.add(key);
      const at = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
      if (!pulsePrimed.current && now - at > 8_000) continue;
      if (now - at > 45_000) continue;
      if (row.last_direction === 'inbound') emit('smsReply', 1 + (hashStr(key) & 1));
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
      if (EXTREME_RE.test(status) || DECLINE_RE.test(status)) burst(1600);
      if (EXTREME_RE.test(status)) void loadCounts();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [burst, loadCounts]);

  useEffect(() => {
    const onBoard = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === 'email' || kind === 'status') burst(1600);
    };
    window.addEventListener(BOARD_EVENT, onBoard);
    return () => window.removeEventListener(BOARD_EVENT, onBoard);
  }, [burst]);

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
      engine.drawNow(ctx);
    };

    const loop = (t: number) => {
      raf = 0;
      if (dead) return;
      const ctx = canvas.getContext('2d');
      if (!ctx || document.hidden) return;
      const more = engine.tick(t, ctx);
      if (more) raf = requestAnimationFrame(loop);
    };

    kickRef.current = () => {
      if (dead || raf) return;
      raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();

    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
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

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
