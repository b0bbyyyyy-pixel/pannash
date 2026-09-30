'use client';

import { useEffect, useRef } from 'react';

const ICON_DEFAULT = '/icon.png';
const ICON_UNREAD = '/icon-unread.png';

function setFavicon(href: string) {
  const old = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
  old.forEach(el => el.parentNode?.removeChild(el));

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = href;
  document.head.appendChild(link);

  const shortcut = document.createElement('link');
  shortcut.rel = 'shortcut icon';
  shortcut.type = 'image/png';
  shortcut.href = href;
  document.head.appendChild(shortcut);
}

export default function TabUnreadBadge() {
  const stopped = useRef(false);
  const lastUnread = useRef<boolean | null>(null);

  useEffect(() => {
    stopped.current = false;

    const apply = (count: number) => {
      const unread = count > 0;
      if (lastUnread.current === unread) return;
      lastUnread.current = unread;
      // Distinct paths so Windows Chrome does not reuse a cached tab icon.
      setFavicon(unread ? `${ICON_UNREAD}?v=unread` : `${ICON_DEFAULT}?v=default`);
    };

    const tick = async () => {
      if (stopped.current) return;
      try {
        const res = await fetch('/api/inbox/unread-count');
        if (res.status === 401) {
          stopped.current = true;
          apply(0);
          return;
        }
        const data = await res.json().catch(() => ({ count: 0 }));
        apply(Number(data.count) || 0);
      } catch {
        // ignore network blips
      }
    };

    tick();
    const interval = window.setInterval(tick, 8000);
    const onFocus = () => { void tick(); };
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stopped.current = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      lastUnread.current = null;
      setFavicon(ICON_DEFAULT);
    };
  }, []);

  return null;
}
