'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  LEADER_LOCK,
  LEADER_LS_KEY,
  SYNC_CHANNEL,
  WORKER_KICK_CHANNEL,
  WORKER_KICK_EVENT,
  type PresenceMsg,
  type SyncChannelMsg,
  type SyncPulse,
} from './types';
import { kickSyncWorker } from './kick';

const SKIP_PREFIXES = ['/portal', '/auth', '/privacy', '/terms', '/contact'];
const PRESENCE_TTL_MS = 45_000;
const PULSE_VISIBLE_MS = 8_000;
const PULSE_HIDDEN_MS = 60_000;
const LS_HEARTBEAT_MS = 10_000;
const LS_STALE_MS = 30_000;

const ICON_DEFAULT = '/icon.png';
const ICON_UNREAD = '/icon-unread.png';
const LINK_ID = 'gostwrk-tab-icon';

function setFavicon(href: string) {
  if (typeof document === 'undefined') return;
  let ours = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!ours) {
    ours = document.createElement('link');
    ours.id = LINK_ID;
    ours.rel = 'icon';
    ours.type = 'image/png';
    document.head.appendChild(ours);
  }
  if (ours.getAttribute('href') !== href) ours.href = href;
}

function isIframe() {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

function skipPath(pathname: string | null) {
  if (!pathname) return false;
  return SKIP_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

type PresenceEntry = {
  visible: boolean;
  openLeadIds: string[];
  canPulse: boolean;
  ts: number;
};

type SyncCtx = {
  pulse: SyncPulse | null;
  setOpenLeadIds: (ids: string[]) => void;
  registerOpenLead: (key: string, id: string | null) => void;
  kickWorker: () => void;
};

const Ctx = createContext<SyncCtx>({
  pulse: null,
  setOpenLeadIds: () => {},
  registerOpenLead: () => {},
  kickWorker: kickSyncWorker,
});

export function useSync() {
  return useContext(Ctx);
}

export default function SyncProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pulse, setPulse] = useState<SyncPulse | null>(null);
  const pulseRef = useRef<SyncPulse | null>(null);
  const openLeadIdsRef = useRef<string[]>([]);
  const openSourcesRef = useRef<Map<string, string>>(new Map());
  const idRef = useRef('');
  const leaderRef = useRef(false);
  const sinceRef = useRef('');
  const presenceRef = useRef<Map<string, PresenceEntry>>(new Map());
  const pulseInFlight = useRef(false);
  const workerInFlight = useRef(false);
  const pendingKickRef = useRef(false);
  const workerTimer = useRef<number>(0);
  const pulseTimer = useRef<number>(0);
  const presenceHb = useRef<number>(0);
  const stopped = useRef(false);
  const lastUnread = useRef<boolean | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const silentRef = useRef(skipPath(pathname));
  const iframeRef = useRef(false);
  const startActiveRef = useRef<() => void>(() => {});
  const stopActiveRef = useRef<() => void>(() => {});
  const requestLockRef = useRef<() => void>(() => {});
  const broadcastPresenceRef = useRef<() => void>(() => {});
  const lockResolveRef = useRef<(() => void) | null>(null);
  const lockRequestedRef = useRef(false);
  const lockAbortRef = useRef<AbortController | null>(null);
  const lsCleanupRef = useRef<(() => void) | null>(null);

  const applyPulse = useCallback((p: SyncPulse) => {
    pulseRef.current = p;
    setPulse(p);
    if (iframeRef.current || silentRef.current) return;
    const unread = (p.unreadCount || 0) > 0;
    if (lastUnread.current === unread) return;
    lastUnread.current = unread;
    setFavicon(unread ? `${ICON_UNREAD}?v=unread` : `${ICON_DEFAULT}?v=default`);
  }, []);

  const publishOpenLeads = useCallback((ids: string[]) => {
    const next = [...new Set(ids.filter(Boolean))].slice(0, 5);
    const prev = openLeadIdsRef.current.join(',');
    if (next.join(',') === prev) return;
    openLeadIdsRef.current = next;
    broadcastPresenceRef.current();
  }, []);

  const setOpenLeadIds = useCallback((ids: string[]) => {
    openSourcesRef.current.set('default', ids.filter(Boolean).join(','));
    const all: string[] = [];
    for (const v of openSourcesRef.current.values()) {
      for (const id of v.split(',')) {
        if (id && !all.includes(id)) all.push(id);
      }
    }
    publishOpenLeads(all);
  }, [publishOpenLeads]);

  const registerOpenLead = useCallback((key: string, id: string | null) => {
    if (id) openSourcesRef.current.set(key, id);
    else openSourcesRef.current.delete(key);
    const all: string[] = [];
    for (const v of openSourcesRef.current.values()) {
      for (const part of v.split(',')) {
        if (part && !all.includes(part)) all.push(part);
      }
    }
    publishOpenLeads(all);
  }, [publishOpenLeads]);

  useEffect(() => {
    stopped.current = false;
    iframeRef.current = isIframe();
    idRef.current = crypto.randomUUID();
    const iframe = iframeRef.current;

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(SYNC_CHANNEL);
      channelRef.current = ch;
    } catch {
      channelRef.current = null;
    }

    function canPulseSelf() {
      return !iframeRef.current && !silentRef.current;
    }

    function broadcastPresence() {
      const chan = channelRef.current;
      if (!chan || !idRef.current) return;
      const msg: PresenceMsg = {
        type: 'presence',
        id: idRef.current,
        visible: typeof document !== 'undefined' && !document.hidden,
        openLeadIds: openLeadIdsRef.current,
        canPulse: canPulseSelf(),
        ts: Date.now(),
      };
      try { chan.postMessage(msg); } catch { /* ignore */ }
      presenceRef.current.set(msg.id, {
        visible: msg.visible,
        openLeadIds: msg.openLeadIds,
        canPulse: msg.canPulse,
        ts: msg.ts,
      });
    }
    broadcastPresenceRef.current = broadcastPresence;

    function collectedOpenIds() {
      const now = Date.now();
      const ids: string[] = [];
      for (const [k, v] of presenceRef.current) {
        if (now - v.ts > PRESENCE_TTL_MS) {
          presenceRef.current.delete(k);
          continue;
        }
        for (const id of v.openLeadIds) {
          if (!ids.includes(id)) ids.push(id);
          if (ids.length >= 5) return ids;
        }
      }
      return ids;
    }

    function shouldRunPulse(): boolean {
      if (!canPulseSelf()) return false;
      const now = Date.now();
      const mine = idRef.current;
      const visible: string[] = [];
      for (const [id, v] of presenceRef.current) {
        if (now - v.ts > PRESENCE_TTL_MS) {
          presenceRef.current.delete(id);
          continue;
        }
        if (v.canPulse && v.visible) visible.push(id);
      }
      if (!visible.includes(mine) && typeof document !== 'undefined' && !document.hidden && canPulseSelf()) {
        visible.push(mine);
      }
      if (visible.length) {
        visible.sort();
        return visible[0] === mine;
      }
      return leaderRef.current && canPulseSelf();
    }

    async function runPulse() {
      if (stopped.current || pulseInFlight.current) return;
      if (!shouldRunPulse()) return;
      pulseInFlight.current = true;
      try {
        const params = new URLSearchParams();
        if (sinceRef.current) params.set('since', sinceRef.current);
        const open = collectedOpenIds();
        if (open.length) params.set('open', open.join(','));
        const qs = params.toString() ? `?${params}` : '';
        const res = await fetch(`/api/sync/pulse${qs}`);
        if (res.status === 401) {
          stopped.current = true;
          return;
        }
        const data = await res.json().catch(() => null);
        if (!data || typeof data.serverNow !== 'string') return;
        const next: SyncPulse = {
          unreadCount: Number(data.unreadCount) || 0,
          serverNow: data.serverNow,
          inboxChanged: Array.isArray(data.inboxChanged) ? data.inboxChanged : [],
          threads: Array.isArray(data.threads) ? data.threads : [],
        };
        sinceRef.current = next.serverNow;
        applyPulse(next);
        try { channelRef.current?.postMessage({ type: 'pulse', pulse: next } satisfies SyncChannelMsg); } catch { /* ignore */ }
      } catch {
        /* next tick */
      } finally {
        pulseInFlight.current = false;
      }
    }

    function schedulePulse() {
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      if (stopped.current || !canPulseSelf()) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      const ms = hidden && leaderRef.current ? PULSE_HIDDEN_MS : PULSE_VISIBLE_MS;
      pulseTimer.current = window.setTimeout(() => {
        void runPulse();
        schedulePulse();
      }, ms);
    }

    async function runWorker() {
      if (stopped.current || !leaderRef.current || !canPulseSelf()) return;
      if (workerInFlight.current) {
        pendingKickRef.current = true;
        return;
      }
      if (workerTimer.current) window.clearTimeout(workerTimer.current);
      workerInFlight.current = true;
      try {
        const res = await fetch('/api/sync/worker', { method: 'POST' });
        if (res.status === 401) {
          stopped.current = true;
          return;
        }
        const data = await res.json().catch(() => null);
        const nextDue = data?.nextDueAt ? new Date(data.nextDueAt).getTime() : Date.now() + 60_000;
        const delay = Math.min(60_000, Math.max(5_000, nextDue - Date.now()));
        if (workerTimer.current) window.clearTimeout(workerTimer.current);
        workerTimer.current = window.setTimeout(() => { void runWorker(); }, delay);
      } catch {
        if (workerTimer.current) window.clearTimeout(workerTimer.current);
        workerTimer.current = window.setTimeout(() => { void runWorker(); }, 15_000);
      } finally {
        workerInFlight.current = false;
        if (pendingKickRef.current) {
          pendingKickRef.current = false;
          if (workerTimer.current) window.clearTimeout(workerTimer.current);
          void runWorker();
        }
      }
    }

    function releaseLock() {
      lockResolveRef.current?.();
      lockResolveRef.current = null;
      leaderRef.current = false;
      lockRequestedRef.current = false;
      lockAbortRef.current?.abort();
      lockAbortRef.current = null;
      lsCleanupRef.current?.();
      lsCleanupRef.current = null;
    }

    function startActive() {
      stopped.current = false;
      if (!canPulseSelf()) return;
      requestLock();
      broadcastPresence();
      void runPulse();
      schedulePulse();
      if (leaderRef.current) void runWorker();
    }

    function stopActive() {
      stopped.current = true;
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      pulseTimer.current = 0;
      if (workerTimer.current) window.clearTimeout(workerTimer.current);
      workerTimer.current = 0;
      releaseLock();
      broadcastPresence();
    }

    startActiveRef.current = startActive;
    stopActiveRef.current = stopActive;

    function takeLeader() {
      if (leaderRef.current) return;
      leaderRef.current = true;
      if (canPulseSelf() && !stopped.current) void runWorker();
    }

    function requestLock() {
      if (iframe || lockRequestedRef.current) return;
      lockRequestedRef.current = true;
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (locks?.request) {
        const ac = new AbortController();
        lockAbortRef.current = ac;
        locks.request(LEADER_LOCK, { signal: ac.signal }, () => {
          lockAbortRef.current = null;
          takeLeader();
          return new Promise<void>((resolve) => {
            lockResolveRef.current = resolve;
          });
        }).catch(() => { /* aborted or unavailable */ });
      } else {
        const beat = () => {
          try {
            const raw = localStorage.getItem(LEADER_LS_KEY);
            const parsed = raw ? JSON.parse(raw) as { id?: string; ts?: number } : null;
            const stale = !parsed?.ts || Date.now() - parsed.ts > LS_STALE_MS;
            if (stale || parsed?.id === idRef.current) {
              localStorage.setItem(LEADER_LS_KEY, JSON.stringify({ id: idRef.current, ts: Date.now() }));
              takeLeader();
            }
          } catch {
            takeLeader();
          }
        };
        beat();
        const lsHb = window.setInterval(beat, LS_HEARTBEAT_MS);
        const onStorage = (e: StorageEvent) => {
          if (e.key !== LEADER_LS_KEY) return;
          try {
            const parsed = e.newValue ? JSON.parse(e.newValue) as { id?: string } : null;
            if (parsed?.id && parsed.id !== idRef.current) leaderRef.current = false;
          } catch { /* ignore */ }
        };
        window.addEventListener('storage', onStorage);
        lsCleanupRef.current = () => {
          window.clearInterval(lsHb);
          window.removeEventListener('storage', onStorage);
        };
      }
    }
    requestLockRef.current = requestLock;

    const onMsg = (e: MessageEvent<SyncChannelMsg>) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'pulse' && d.pulse) applyPulse(d.pulse);
      if (d.type === 'presence' && d.id && d.id !== idRef.current) {
        presenceRef.current.set(d.id, {
          visible: !!d.visible,
          openLeadIds: d.openLeadIds ?? [],
          canPulse: !!d.canPulse,
          ts: d.ts || Date.now(),
        });
      }
      if (d.type === 'bye' && d.id) {
        presenceRef.current.delete(d.id);
      }
      if (d.type === 'worker-kick' && leaderRef.current && canPulseSelf()) {
        void runWorker();
      }
    };
    ch?.addEventListener('message', onMsg);

    const onVis = () => {
      broadcastPresence();
      if (!document.hidden && canPulseSelf() && !stopped.current) {
        void runPulse();
        schedulePulse();
      }
    };
    const onFocus = () => {
      if (canPulseSelf() && !stopped.current) void runPulse();
    };
    const onBye = () => {
      try { channelRef.current?.postMessage({ type: 'bye', id: idRef.current } satisfies SyncChannelMsg); } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onBye);

    const onKick = () => {
      if (leaderRef.current && canPulseSelf()) void runWorker();
    };
    window.addEventListener(WORKER_KICK_EVENT, onKick);
    let kickCh: BroadcastChannel | null = null;
    try {
      kickCh = new BroadcastChannel(WORKER_KICK_CHANNEL);
      kickCh.onmessage = () => onKick();
    } catch { /* ignore */ }

    broadcastPresence();
    presenceHb.current = window.setInterval(broadcastPresence, 20_000);
    if (!iframe && !silentRef.current) {
      requestLock();
      startActive();
    }

    return () => {
      stopped.current = true;
      onBye();
      lockResolveRef.current?.();
      lockResolveRef.current = null;
      leaderRef.current = false;
      lockRequestedRef.current = false;
      lockAbortRef.current?.abort();
      lockAbortRef.current = null;
      lsCleanupRef.current?.();
      lsCleanupRef.current = null;
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      if (workerTimer.current) window.clearTimeout(workerTimer.current);
      if (presenceHb.current) window.clearInterval(presenceHb.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onBye);
      window.removeEventListener(WORKER_KICK_EVENT, onKick);
      kickCh?.close();
      ch?.removeEventListener('message', onMsg);
      ch?.close();
      channelRef.current = null;
    };
  // mount once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = skipPath(pathname);
    const prev = silentRef.current;
    silentRef.current = next;
    if (prev && !next) {
      requestLockRef.current();
      startActiveRef.current();
    } else if (!prev && next) {
      stopActiveRef.current();
    } else {
      broadcastPresenceRef.current();
    }
  }, [pathname]);

  const value = useMemo<SyncCtx>(() => ({
    pulse,
    setOpenLeadIds,
    registerOpenLead,
    kickWorker: kickSyncWorker,
  }), [pulse, setOpenLeadIds, registerOpenLead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
