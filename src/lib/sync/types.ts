export const SYNC_CHANNEL = 'pannash-sync';
export const WORKER_KICK_CHANNEL = 'pannash-worker-kick';
export const WORKER_KICK_EVENT = 'pannash-worker-kick';
export const LEADER_LOCK = 'pannash-leader';
export const LEADER_LS_KEY = 'pannash-leader';

export type InboxChangedRow = {
  lead_id: string;
  last_message_at: string | null;
  last_inbound_at?: string | null;
  last_direction: string | null;
  last_message_preview: string | null;
  unread_count: number;
};

export type ThreadSig = { leadId: string; sig: string };

export type SyncPulse = {
  unreadCount: number;
  serverNow: string;
  inboxChanged: InboxChangedRow[];
  threads: ThreadSig[];
};

export type PresenceMsg = {
  type: 'presence';
  id: string;
  visible: boolean;
  openLeadIds: string[];
  canPulse: boolean;
  ts: number;
};

export type PulseMsg = {
  type: 'pulse';
  pulse: SyncPulse;
};

export type ByeMsg = {
  type: 'bye';
  id: string;
};

export type SyncChannelMsg = PresenceMsg | PulseMsg | ByeMsg | { type: 'worker-kick' };
