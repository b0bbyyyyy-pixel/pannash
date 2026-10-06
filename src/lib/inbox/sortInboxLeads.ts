/** Newest inbox activity — used so a fresh text always wins the rail order. */
export function inboxActivityMs(row: {
  last_contact?: string | null;
  conversation?: {
    last_message_at?: string | null;
    last_inbound_at?: string | null;
  } | null;
}): number {
  const c = row.conversation;
  let max = 0;
  for (const v of [c?.last_message_at, c?.last_inbound_at, row.last_contact]) {
    if (!v) continue;
    const n = Date.parse(String(v));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

export function sortInboxLeads<T extends {
  id?: string;
  last_contact?: string | null;
  conversation?: {
    last_message_at?: string | null;
    last_inbound_at?: string | null;
  } | null;
}>(leads: T[], pinLeadId?: string | null): T[] {
  return [...leads].sort((a, b) => {
    if (pinLeadId) {
      if (a.id === pinLeadId) return -1;
      if (b.id === pinLeadId) return 1;
    }
    return inboxActivityMs(b) - inboxActivityMs(a);
  });
}
