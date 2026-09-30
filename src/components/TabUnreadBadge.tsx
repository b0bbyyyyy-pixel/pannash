'use client';

import { useEffect, useRef } from 'react';

const ICON_HREF = '/icon.png';
const RED = '#e11d48';

function setFavicon(href: string) {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]'));
  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    links.push(link);
  }
  for (const link of links) {
    link.type = 'image/png';
    link.href = href;
  }
}

function tintRed(img: HTMLImageElement): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return ICON_HREF;
  ctx.drawImage(img, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
}

export default function TabUnreadBadge() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const redRef = useRef<string | null>(null);
  const countRef = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      apply(countRef.current);
    };
    img.src = ICON_HREF;

    const apply = (count: number) => {
      countRef.current = count;
      if (count <= 0) {
        setFavicon(`${ICON_HREF}?v=default`);
        return;
      }
      if (redRef.current) {
        setFavicon(redRef.current);
        return;
      }
      if (!imgRef.current) return;
      redRef.current = tintRed(imgRef.current);
      setFavicon(redRef.current);
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
      setFavicon(ICON_HREF);
    };
  }, []);

  return null;
}
