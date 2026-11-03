import {
  inInsightsRange,
  isAttemptedDripStatus,
  isSuccessfulDripStatus,
  type InsightsRange,
} from './insightsRange';

export type InsightLead = {
  id: string;
  list_id?: string | null;
  phone?: string | null;
  company?: string | null;
  name?: string | null;
  sms_sent_at?: string | null;
  sms_opt_out?: boolean | null;
  in_pipeline?: boolean | null;
  lead_status?: string | null;
  underwriting_data?: unknown;
};

export type InsightSend = {
  lead_id: string;
  job_id?: string | null;
  sms_status: string;
  template_index?: number | null;
  error?: string | null;
  sent_at?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

export type InsightConv = {
  lead_id: string;
  last_inbound_at?: string | null;
  last_direction?: string | null;
  last_message_preview?: string | null;
};

export type InsightOutbound = {
  lead_id: string;
  phone: string;
  company: string;
  sentAt: string;
  replied: boolean;
};

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, size + i));
  return out;
}

function sendWhen(send: InsightSend) {
  return send.sent_at || send.created_at || '';
}

export function sendInRange(send: InsightSend, range: Pick<InsightsRange, 'since' | 'until'>) {
  if (!range.since && !range.until) return true;
  const when = sendWhen(send);
  if (when) return inInsightsRange(when, range);
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadDripSendsInRange(
  supabase: any,
  userId: string,
  range: Pick<InsightsRange, 'since' | 'until'>,
) {
  const sends: InsightSend[] = [];
  const selectFull = 'lead_id, job_id, sms_status, template_index, error, sent_at, phone, created_at';
  const selectSlim = 'lead_id, job_id, sms_status, error, sent_at';

  for (let from = 0; from < 40_000; from += 1000) {
    let q = supabase
      .from('sms_drip_sends')
      .select(selectFull)
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .range(from, from + 999);
    if (range.since) q = q.gte('sent_at', range.since);
    if (range.until) q = q.lt('sent_at', range.until);
    const full = await q;
    if (full.error) {
      let q2 = supabase
        .from('sms_drip_sends')
        .select(selectSlim)
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .range(from, from + 999);
      if (range.since) q2 = q2.gte('sent_at', range.since);
      if (range.until) q2 = q2.lt('sent_at', range.until);
      const slim = await q2;
      if (slim.error) break;
      const rows = asRows<InsightSend>(slim.data);
      sends.push(...rows);
      if (rows.length < 1000) break;
      continue;
    }
    const rows = asRows<InsightSend>(full.data);
    sends.push(...rows);
    if (rows.length < 1000) break;
  }

  return sends.filter(s => sendInRange(s, range));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadDripSendsForJobs(
  supabase: any,
  jobIds: string[],
) {
  const sends: InsightSend[] = [];
  for (const slice of chunk(jobIds, 25)) {
    if (!slice.length) continue;
    for (let from = 0; from < 8000; from += 1000) {
      const sendFull = await supabase
        .from('sms_drip_sends')
        .select('lead_id, job_id, sms_status, template_index, error, sent_at, phone, created_at')
        .in('job_id', slice)
        .range(from, from + 999);
      const sendSlim = sendFull.error
        ? await supabase
            .from('sms_drip_sends')
            .select('lead_id, job_id, sms_status, error, sent_at')
            .in('job_id', slice)
            .range(from, from + 999)
        : null;
      if ((sendSlim ?? sendFull).error) break;
      const rows = asRows<InsightSend>((sendSlim ?? sendFull).data);
      sends.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  return sends;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLeadsByIds(
  supabase: any,
  userId: string,
  ids: string[],
) {
  const leads: InsightLead[] = [];
  const unique = [...new Set(ids.filter(Boolean))];
  const selectFull = 'id, list_id, phone, company, name, sms_sent_at, sms_opt_out, in_pipeline, lead_status, underwriting_data';
  const selectSlim = 'id, list_id, phone, company, name, sms_sent_at, sms_opt_out, lead_status';
  for (const slice of chunk(unique, 150)) {
    const full = await supabase
      .from('leads')
      .select(selectFull)
      .eq('user_id', userId)
      .in('id', slice);
    if (full.error) {
      const slim = await supabase
        .from('leads')
        .select(selectSlim)
        .eq('user_id', userId)
        .in('id', slice);
      leads.push(...asRows<InsightLead>(slim.data));
      continue;
    }
    leads.push(...asRows<InsightLead>(full.data));
  }
  return leads;
}

export function successfulSendLeadIds(sends: InsightSend[]) {
  const ids = new Set<string>();
  for (const s of sends) {
    if (s.lead_id && isSuccessfulDripStatus(s.sms_status)) ids.add(s.lead_id);
  }
  return ids;
}

export function csvEscape(value: string | number | boolean | null | undefined) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildOutboundCsv(rows: InsightOutbound[]) {
  const header = ['phone', 'business_name', 'date_sent', 'replied'];
  const lines = [
    header.join(','),
    ...rows.map(row => [
      csvEscape(row.phone),
      csvEscape(row.company),
      csvEscape(row.sentAt),
      csvEscape(row.replied ? 'yes' : 'no'),
    ].join(',')),
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}

export function formatSentAt(iso: string, tz: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString('en-US');
  }
}

export function outboundRowsFromSends(args: {
  sends: InsightSend[];
  leads: InsightLead[];
  repliedIds: Set<string>;
  tz: string;
}): InsightOutbound[] {
  const byLead = new Map(args.leads.map(l => [l.id, l]));
  const rows: { row: InsightOutbound; iso: string }[] = [];
  for (const send of args.sends) {
    if (!isAttemptedDripStatus(send.sms_status)) continue;
    const when = sendWhen(send);
    if (!when) continue;
    const lead = byLead.get(send.lead_id);
    rows.push({
      iso: when,
      row: {
        lead_id: send.lead_id,
        phone: send.phone || lead?.phone || '',
        company: lead?.company || lead?.name || '',
        sentAt: formatSentAt(when, args.tz),
        replied: args.repliedIds.has(send.lead_id) || send.sms_status === 'replied',
      },
    });
  }
  rows.sort((a, b) => b.iso.localeCompare(a.iso));
  return rows.map(r => r.row);
}
