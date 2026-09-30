'use client';

import { useEffect, useRef } from 'react';

export default function FollowUpProcessor() {
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
          const res = await fetch('/api/followups/due', { method: 'POST' });
          if (res.status === 401) {
            stopped.current = true;
          }
        } catch {
          // next tick
        } finally {
          inFlight.current = false;
        }
      };

      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (locks?.request) {
        try {
          await locks.request('pannash-follow-up-due', { ifAvailable: true }, async lock => {
            if (!lock) return;
            await run();
          });
          return;
        } catch {
          // fall through
        }
      }
      await run();
    };

    tick();
    const interval = window.setInterval(tick, 20000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stopped.current = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return null;
}
