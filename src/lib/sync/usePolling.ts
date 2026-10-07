'use client';

import { useEffect } from 'react';

/** Run fn at visibleMs while the document is visible; pause when hidden; refire on visible. */
export function usePolling(fn: () => void, visibleMs: number, enabled = true, fireImmediately = true) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fn();
    };
    if (fireImmediately) run();
    const id = window.setInterval(run, visibleMs);
    const onVis = () => {
      if (!document.hidden) fn();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fn, visibleMs, enabled, fireImmediately]);
}
