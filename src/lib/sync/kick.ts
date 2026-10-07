import { SYNC_CHANNEL, WORKER_KICK_CHANNEL, WORKER_KICK_EVENT } from './types';

export function kickSyncWorker() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(WORKER_KICK_EVENT));
  } catch { /* ignore */ }
  try {
    const ch = new BroadcastChannel(WORKER_KICK_CHANNEL);
    ch.postMessage({ type: 'worker-kick' });
    ch.close();
  } catch { /* ignore */ }
  try {
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.postMessage({ type: 'worker-kick' });
    ch.close();
  } catch { /* ignore */ }
}
