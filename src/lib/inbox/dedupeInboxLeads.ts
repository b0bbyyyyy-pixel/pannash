import { isCampaignInboxLead } from '@/lib/inbox/promoteCampaignReply';
import { inboxActivityMs } from '@/lib/inbox/sortInboxLeads';

function last10(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

type DupLead = {
  id?: string;
  phone?: string | null;
  in_pipeline?: boolean | null;
  lead_status?: string | null;
  last_contact?: string | null;
  conversation?: {
    last_inbound_at?: string | null;
    last_direction?: string | null;
    last_message_at?: string | null;
  } | null;
};

function hasInbound(lead: DupLead) {
  const c = lead.conversation;
  return !!(c?.last_inbound_at || c?.last_direction === 'inbound');
}

export function preferredDuplicateScore(lead: DupLead): number {
  let s = 0;
  if (hasInbound(lead)) s += 1_000_000;
  if (lead.conversation?.last_message_at) s += 100_000;
  if (!isCampaignInboxLead(lead)) s += 10_000;
  if (lead.in_pipeline) s += 1_000;
  return s;
}

export function pickPreferredDuplicate<T extends DupLead>(leads: T[]): T {
  return [...leads].sort((a, b) => {
    const d = preferredDuplicateScore(b) - preferredDuplicateScore(a);
    if (d) return d;
    return inboxActivityMs(b) - inboxActivityMs(a);
  })[0];
}

/** One row per phone — keep the copy that actually has the thread / is in pipeline. */
export function dedupeInboxLeadsByPhone<T extends DupLead>(leads: T[]): T[] {
  const groups = new Map<string, T[]>();
  const leftover: T[] = [];
  for (const lead of leads) {
    const key = last10(lead.phone);
    if (key.length !== 10) {
      leftover.push(lead);
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(lead);
    groups.set(key, group);
  }
  const picked: T[] = [];
  for (const group of groups.values()) {
    picked.push(group.length === 1 ? group[0] : pickPreferredDuplicate(group));
  }
  return [...picked, ...leftover];
}
