'use client';

import { useEffect, useRef } from 'react';

/**
 * Global SMS drip worker. One in-flight request, and only one browser tab
 * runs a tick at a time (Web Locks). The server also claims each send so
 * extra tabs cannot double-text a lead.
 */
export default function SmsDripProcessor() {
  const stopped = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    stopped.current = false;

    const tick = async () => {
      if (stopped.current || inFlight.current) return;

      const run = async () => {
        if (stopped.current || inFlight.current) return;
        inFlight.current = true;
        try {
          const res = await fetch('/api/sms/drip/process', { method: 'POST' });
          if (res.status === 401) {
            stopped.current = true;
            return;
          }
          const data = await res.json().catch(() => null);
          const sent = (data?.results ?? []).filter((r: { status?: string }) => r.status === 'sent').length;
          if (sent > 0) console.log(`[SMS Drip] Sent ${sent} message${sent > 1 ? 's' : ''}`);
        } catch {
          // Network hiccup — try again on the next interval
        } finally {
          inFlight.current = false;
        }
      };

      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (locks?.request) {
        try {
          await locks.request('pannash-sms-drip', { ifAvailable: true }, async lock => {
            if (!lock) return;
            await run();
          });
          return;
        } catch {
          // Locks API unavailable / aborted — fall through
        }
      }
      await run();
    };

    tick();
    const interval = setInterval(tick, 15000);
    return () => {
      stopped.current = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
