'use client';

import { useEffect, useRef } from 'react';

/**
 * Global SMS drip worker poller. Mounted in the root layout so drips keep
 * sending no matter which tab is open. Hits /api/sms/drip/process every 15s;
 * the route cheap-exits when there are no active jobs, and pacing is enforced
 * server-side via next_send_at, so extra ticks are harmless.
 */
export default function SmsDripProcessor() {
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;

    const tick = async () => {
      if (stopped.current) return;
      try {
        const res = await fetch('/api/sms/drip/process', { method: 'POST' });
        if (res.status === 401) {
          // Not signed in — stop polling until next page load
          stopped.current = true;
          return;
        }
        const data = await res.json().catch(() => null);
        const sent = (data?.results ?? []).filter((r: { status?: string }) => r.status === 'sent').length;
        if (sent > 0) console.log(`[SMS Drip] Sent ${sent} message${sent > 1 ? 's' : ''}`);
      } catch {
        // Network hiccup — try again on the next interval
      }
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
