'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CALLBACK_ALARM_EVENT } from '@/lib/lead-follow-up';
import { useWebPhone } from '@/components/webphone/WebPhone';

type Alarm = {
  leadId: string;
  name: string;
  company: string | null;
  phone: string | null;
  dueAt: string;
};

function isIframe() {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

function playBeeps(ctx: AudioContext) {
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i += 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === 1 ? 880 : 740;
    gain.gain.setValueAtTime(0.0001, now);
    const t = now + i * 0.22;
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

export default function CallbackAlarm() {
  const pathname = usePathname();
  const silent = !pathname || ['/portal', '/auth', '/privacy', '/terms', '/contact'].some(
    p => pathname === p || pathname.startsWith(`${p}/`),
  );
  const webphone = useWebPhone();
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const beepTimer = useRef<number>(0);

  const stopBeep = useCallback(() => {
    if (beepTimer.current) {
      window.clearInterval(beepTimer.current);
      beepTimer.current = 0;
    }
  }, []);

  const startBeep = useCallback(() => {
    stopBeep();
    const ring = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioRef.current) audioRef.current = new Ctx();
        if (audioRef.current.state === 'suspended') void audioRef.current.resume();
        playBeeps(audioRef.current);
      } catch { /* ignore */ }
    };
    ring();
    beepTimer.current = window.setInterval(ring, 4000);
  }, [stopBeep]);

  const show = useCallback((next: Alarm) => {
    const key = `${next.leadId}:${next.dueAt}`;
    if (shownRef.current.has(key)) return;
    shownRef.current.add(key);
    setAlarm(next);
    startBeep();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`Time to call ${next.name}`, {
          body: next.company && next.company !== next.name ? next.company : 'Callback alarm',
          tag: key,
        });
      }
    } catch { /* ignore */ }
  }, [startBeep]);

  const ack = useCallback(async (leadId: string) => {
    stopBeep();
    setAlarm(null);
    try {
      await fetch('/api/leads/callback-alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId }),
      });
    } catch { /* ignore */ }
  }, [stopBeep]);

  const waitTimer = useRef<number>(0);
  const waitUntil = useCallback((dueAt: string | null | undefined, pullFn: () => void) => {
    if (waitTimer.current) window.clearTimeout(waitTimer.current);
    waitTimer.current = 0;
    if (!dueAt) return;
    const wait = new Date(dueAt).getTime() - Date.now() - 1000;
    waitTimer.current = window.setTimeout(pullFn, Math.max(0, wait));
  }, []);

  const pull = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/callback-alarms', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const first = Array.isArray(data.alarms) ? data.alarms[0] as Alarm | undefined : undefined;
      if (first?.leadId) show(first);
      else waitUntil(typeof data.nextAt === 'string' ? data.nextAt : null, () => { void pull(); });
    } catch { /* ignore */ }
  }, [show, waitUntil]);

  useEffect(() => {
    if (typeof window === 'undefined' || isIframe() || silent) return;
    void pull();
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent<Alarm>).detail;
      if (detail?.dueAt) waitUntil(detail.dueAt, () => { void pull(); });
    };
    window.addEventListener(CALLBACK_ALARM_EVENT, onSet);
    const onVis = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (waitTimer.current) window.clearTimeout(waitTimer.current);
      window.removeEventListener(CALLBACK_ALARM_EVENT, onSet);
      document.removeEventListener('visibilitychange', onVis);
      stopBeep();
    };
  }, [pull, stopBeep, silent, waitUntil]);

  if (!alarm || silent) return null;

  return (
    <div className="fixed top-5 right-5 z-[115] w-80 rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-xl">
      <p className="mb-0.5 text-xs text-[#9ca3af]">Time to call</p>
      <p className="text-base font-semibold text-[#1a1a1a]">{alarm.name}</p>
      {alarm.company && alarm.company !== alarm.name && (
        <p className="truncate text-[13px] text-[#6b6b6b]">{alarm.company}</p>
      )}
      <p className="mt-0.5 text-xs text-[#9ca3af]">
        {new Date(alarm.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const phone = alarm.phone;
            void ack(alarm.leadId);
            if (phone) webphone.openDialPad(phone);
          }}
          className="flex-1 rounded-xl bg-[#1a1a1a] py-2 text-sm font-medium text-white hover:bg-black"
        >
          Call
        </button>
        <button
          type="button"
          onClick={() => void ack(alarm.leadId)}
          className="flex-1 rounded-xl border border-[#e5e5e5] py-2 text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f5f5]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
