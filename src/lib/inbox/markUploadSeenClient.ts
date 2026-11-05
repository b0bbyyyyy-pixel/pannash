import type { UploadUnreadKind } from '@/lib/inbox/uploadUnread';

export const UPLOAD_UNREAD_EVENT = 'pannash-upload-unread';

export function pingUploadUnreadListeners() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(UPLOAD_UNREAD_EVENT));
  try {
    window.parent?.postMessage({ type: UPLOAD_UNREAD_EVENT }, window.location.origin);
  } catch {
    /* ignore */
  }
}

export function markUploadSeenClient(leadId: string, kind: UploadUnreadKind | 'all' = 'all') {
  if (!leadId) return Promise.resolve({ docsIn: false });
  return fetch('/api/inbox/upload-unread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ leadId, kind: 'all' }),
  })
    .then(async res => {
      const data = await res.json().catch(() => ({})) as { docsIn?: boolean };
      return { docsIn: Boolean(data.docsIn) };
    })
    .catch(() => ({ docsIn: false }))
    .finally(() => pingUploadUnreadListeners());
}
