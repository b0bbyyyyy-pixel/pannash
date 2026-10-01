'use client';

import { useEffect, useRef } from 'react';

const ICON_DEFAULT = '/icon.png';
const ICON_UNREAD = '/icon-unread.png';
const LINK_ID = 'gostwrk-tab-icon';

/** Swap the tab icon without removing Next-managed <link> tags (that crashes React). */
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
  if (ours.getAttribute('href') !== href) {
    ours.href = href;
  }
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
    };
  }, []);

  return null;
}
