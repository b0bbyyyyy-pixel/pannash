'use client';

import { useEffect } from 'react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enableAlerts(ask = true) {
  const res = await fetch('/api/m/settings');
  if (!res.ok) return;
  const settings = await res.json();
  document.cookie = `gostwrk_m_landing=${settings.phoneLanding ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
  if (!settings.webPush || !settings.vapidPublicKey) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' });
  if (Notification.permission === 'default' && ask) await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
  });
  await fetch('/api/m/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
}

export default function MobilePush() {
  useEffect(() => {
    enableAlerts(false).catch(() => {});
  }, []);

  return null;
}
