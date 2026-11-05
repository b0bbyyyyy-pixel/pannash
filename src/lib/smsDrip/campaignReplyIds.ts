import { phoneKeys } from '@/lib/leads/phone';
import { chunk } from '@/lib/smsDrip/insightsData';

export type InboundSignals = {
  inboundLeadIds: Set<string>;
  inboundPhones: Set<string>;
};

export function convLooksInbound(c: {
  last_inbound_at?: string | null;
  last_direction?: string | null;
}) {
  return !!(c.last_inbound_at || c.last_direction === 'inbound');
}

/** Campaign-list rows whose own thread, a same-phone copy, or drip status shows a reply. */
export function expandRepliedByPhone(args: {
  leads: { id: string; phone?: string | null; phone_e164?: string | null }[];
  inboundLeadIds: Set<string>;
  inboundPhones: Set<string>;
}): Set<string> {
  const replied = new Set<string>();
  for (const lead of args.leads) {
    if (args.inboundLeadIds.has(lead.id)) {
      replied.add(lead.id);
      continue;
    }
    const keys = phoneKeys(lead.phone).concat(phoneKeys(lead.phone_e164));
    if (keys.some(k => args.inboundPhones.has(k))) replied.add(lead.id);
  }
  return replied;
}

async function loadConversationRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ lead_id: string; last_inbound_at?: string | null; last_direction?: string | null }[]> {
  const rows: { lead_id: string; last_inbound_at?: string | null; last_direction?: string | null }[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    let res = await supabase
      .from('inbox_conversations')
      .select('lead_id, last_inbound_at, last_direction')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(from, from + 999);
    if (res.error) {
      res = await supabase
        .from('inbox_conversations')
        .select('lead_id, last_direction')
        .eq('user_id', userId)
        .range(from, from + 999);
      if (res.error) break;
    }
    const batch = (res.data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

async function loadInboundMessageLeadIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fallbackLeadIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; from < 20_000; from += 1000) {
    const res = await supabase
      .from('inbox_messages')
      .select('lead_id')
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (res.error) {
      for (const slice of chunk(fallbackLeadIds, 150)) {
        if (!slice.length) continue;
        const retry = await supabase
          .from('inbox_messages')
          .select('lead_id')
          .eq('direction', 'inbound')
          .in('lead_id', slice);
        for (const row of retry.data ?? []) {
          if (row?.lead_id) ids.add(row.lead_id);
        }
      }
      return ids;
    }
    const batch = (res.data ?? []) as { lead_id?: string | null }[];
    for (const row of batch) {
      if (row?.lead_id) ids.add(row.lead_id);
    }
    if (batch.length < 1000) break;
  }
  return ids;
}

/** Who actually texted back — not just whose last SMS is still inbound. */
export async function loadInboundSignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<InboundSignals> {
  const inboundLeadIds = new Set<string>();
  const convs = await loadConversationRows(supabase, userId);
  const convLeadIds: string[] = [];
  for (const conv of convs) {
    if (!conv.lead_id) continue;
    convLeadIds.push(conv.lead_id);
    if (convLooksInbound(conv)) inboundLeadIds.add(conv.lead_id);
  }

  const fromMessages = await loadInboundMessageLeadIds(supabase, convLeadIds);
  for (const id of fromMessages) inboundLeadIds.add(id);

  const drip = await supabase
    .from('sms_drip_sends')
    .select('lead_id')
    .eq('user_id', userId)
    .eq('sms_status', 'replied')
    .limit(10000);
  if (!drip.error) {
    for (const row of drip.data ?? []) {
      if (row?.lead_id) inboundLeadIds.add(row.lead_id);
    }
  }

  const inboundPhones = new Set<string>();
  const inboundIds = [...inboundLeadIds];
  for (const slice of chunk(inboundIds, 150)) {
    if (!slice.length) continue;
    let res = await supabase
      .from('leads')
      .select('id, phone, phone_e164')
      .eq('user_id', userId)
      .in('id', slice);
    if (res.error) {
      res = await supabase
        .from('leads')
        .select('id, phone')
        .eq('user_id', userId)
        .in('id', slice);
    }
    for (const lead of res.data ?? []) {
      for (const key of phoneKeys(lead.phone).concat(phoneKeys(lead.phone_e164))) {
        inboundPhones.add(key);
      }
    }
  }

  return { inboundLeadIds, inboundPhones };
}
