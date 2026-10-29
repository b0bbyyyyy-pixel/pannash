import { isCampaignInboxLead } from '@/lib/inbox/promoteCampaignReply';
import { inboxActivityMs } from '@/lib/inbox/sortInboxLeads';
import { isSamePersonLead, normPersonName, phoneKeys } from '@/lib/leads/phone';

type DupLead = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  in_pipeline?: boolean | null;
  lead_status?: string | null;
  last_contact?: string | null;
  doc_count?: number | null;
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

function workedStatusScore(lead: DupLead): number {
  const status = String(lead.lead_status ?? '').trim().toLowerCase();
  if (!status) return 0;
  if (status.includes('fund') || status.includes('contract')) return 50;
  if (status.includes('submit') || status.includes('docs')) return 40;
  if (status.includes('approved') || status.includes('conditional')) return 40;
  return 0;
}

function docsScore(lead: DupLead): number {
  const n = Number(lead.doc_count) || 0;
  return n > 0 ? 10_000_000 + Math.min(n, 99) : 0;
}

/** Who the user is actually working — files / Submitted first, leftover campaign last. */
export function displayDuplicateScore(lead: DupLead): number {
  let s = docsScore(lead);
  s += workedStatusScore(lead) * 100;
  if (lead.in_pipeline) s += 100;
  if (!isCampaignInboxLead(lead)) s += 10;
  if (lead.conversation?.last_message_at) s += 1;
  return s;
}

export function preferredDuplicateScore(lead: DupLead): number {
  let s = docsScore(lead);
  if (hasInbound(lead)) s += 1_000_000;
  if (lead.conversation?.last_message_at) s += 100_000;
  if (!isCampaignInboxLead(lead)) s += 10_000;
  if (lead.in_pipeline) s += 1_000;
  s += workedStatusScore(lead);
  return s;
}

export function pickDisplayDuplicate<T extends DupLead>(leads: T[]): T {
  return [...leads].sort((a, b) => {
    const d = displayDuplicateScore(b) - displayDuplicateScore(a);
    if (d) return d;
    const t = preferredDuplicateScore(b) - preferredDuplicateScore(a);
    if (t) return t;
    return inboxActivityMs(b) - inboxActivityMs(a);
  })[0];
}

export function mergeBestConversation<T extends DupLead>(winner: T, group: T[]): T {
  const convs = group.map(l => l.conversation).filter(Boolean);
  if (!convs.length) return winner;
  const best = [...convs].sort((a, b) => {
    const ai = (a?.last_inbound_at || a?.last_direction === 'inbound') ? 1 : 0;
    const bi = (b?.last_inbound_at || b?.last_direction === 'inbound') ? 1 : 0;
    if (bi !== ai) return bi - ai;
    return inboxActivityMs({ conversation: b }) - inboxActivityMs({ conversation: a });
  })[0];
  return { ...winner, conversation: best };
}

export function pickPreferredDuplicate<T extends DupLead>(leads: T[]): T {
  return [...leads].sort((a, b) => {
    const d = preferredDuplicateScore(b) - preferredDuplicateScore(a);
    if (d) return d;
    return inboxActivityMs(b) - inboxActivityMs(a);
  })[0];
}

/** Same person: overlapping phone digits, or the same first+last name. */
export function groupDuplicateLeads<T extends DupLead>(leads: T[]): T[][] {
  if (leads.length < 2) return leads.length ? [leads] : [];
  const parent = leads.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  const byPhone = new Map<string, number>();
  const byName = new Map<string, number>();
  leads.forEach((lead, i) => {
    for (const key of phoneKeys(lead.phone)) {
      const prev = byPhone.get(key);
      if (prev !== undefined) unite(prev, i);
      byPhone.set(key, i);
    }
    const name = normPersonName(lead.name);
    if (name.length >= 10) {
      const prev = byName.get(name);
      if (prev !== undefined && isSamePersonLead(leads[prev], lead)) unite(prev, i);
      byName.set(name, i);
    }
  });
  const grouped = new Map<number, T[]>();
  leads.forEach((lead, i) => {
    const root = find(i);
    const group = grouped.get(root) ?? [];
    group.push(lead);
    grouped.set(root, group);
  });
  return [...grouped.values()];
}

/** One row per person — keep the copy with files / Submitted. */
export function dedupeInboxLeadsByPhone<T extends DupLead>(leads: T[]): T[] {
  const picked: T[] = [];
  for (const group of groupDuplicateLeads(leads)) {
    const winner = group.length === 1 ? group[0] : pickDisplayDuplicate(group);
    picked.push(mergeBestConversation(winner, group));
  }
  return picked;
}
