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

export async function enableAlerts(ask = true): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  // iOS only honors the permission prompt if it is the first await inside the tap.
  let permission = Notification.permission;
  if (permission === 'default' && ask) permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const res = await fetch('/api/m/settings');
  if (!res.ok) return { ok: false, reason: 'settings' };
  const settings = await res.json();
  document.cookie = `gostwrk_m_landing=${settings.phoneLanding ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
  if (!settings.webPush) return { ok: false, reason: 'off' };
  if (!settings.vapidPublicKey) return { ok: false, reason: 'no-vapid' };

  const reg = await navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' });
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
  });
  const saved = await fetch('/api/m/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!saved.ok) return { ok: false, reason: 'save' };
  return { ok: true };
}

export default function MobilePush() {
  useEffect(() => {
    enableAlerts(false).catch(() => {});
  }, []);

  return null;
}
