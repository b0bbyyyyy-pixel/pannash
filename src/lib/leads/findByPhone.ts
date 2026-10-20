import { toE164 } from '@/lib/dialer/e164';
import { pickPreferredDuplicate } from '@/lib/inbox/dedupeInboxLeads';

export type LeadByPhone = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  phone_e164?: string | null;
  in_pipeline?: boolean | null;
  lead_status?: string | null;
  last_contact?: string | null;
};

export function last10(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

export function phoneVariants(raw: string): string[] {
  const e164 = toE164(raw);
  const d = last10(raw);
  return [...new Set([raw, e164, d, d ? `+1${d}` : '', d ? `1${d}` : ''].filter(Boolean))] as string[];
}

const LEAD_COLS = 'id, name, company, email, phone, phone_e164, in_pipeline, lead_status, last_contact';
const LEAD_COLS_SLIM = 'id, name, company, email, phone, phone_e164';

function asLeads(data: unknown): LeadByPhone[] {
  return Array.isArray(data) ? data as LeadByPhone[] : [];
}

function mergeById(rows: LeadByPhone[]): LeadByPhone[] {
  const map = new Map<string, LeadByPhone>();
  for (const row of rows) {
    if (row?.id) map.set(row.id, row);
  }
  return [...map.values()];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function selectLeadMatches(supabase: any, build: (cols: string) => any): Promise<LeadByPhone[]> {
  const full = await build(LEAD_COLS);
  if (!full.error) return asLeads(full.data);
  const slim = await build(LEAD_COLS_SLIM);
  return asLeads(slim.data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachInboundFlags(supabase: any, leads: LeadByPhone[]): Promise<LeadByPhone[]> {
  if (!leads.length) return leads;
  const ids = leads.map(l => l.id);
  const { data } = await supabase
    .from('inbox_conversations')
    .select('lead_id, last_inbound_at, last_direction, last_message_at')
    .in('lead_id', ids);
  const byLead = new Map<string, { last_inbound_at?: string | null; last_direction?: string | null; last_message_at?: string | null }>();
  for (const row of data ?? []) {
    if (row?.lead_id) byLead.set(row.lead_id, row);
  }
  return leads.map(l => ({
    ...l,
    conversation: byLead.get(l.id) ?? null,
  })) as LeadByPhone[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findLeadByPhone(
  supabase: any,
  phone: string,
  userId: string,
): Promise<LeadByPhone | null> {
  const variants = phoneVariants(phone);
  const digits = last10(phone);
  if (!variants.length && digits.length !== 10) return null;

  const matches: LeadByPhone[] = [];

  if (variants.length) {
    matches.push(...await selectLeadMatches(supabase, (cols: string) =>
      supabase.from('leads').select(cols).eq('user_id', userId).in('phone_e164', variants).limit(20)
    ));
    matches.push(...await selectLeadMatches(supabase, (cols: string) =>
      supabase.from('leads').select(cols).eq('user_id', userId).in('phone', variants).limit(20)
    ));
  }

  let unique = mergeById(matches);
  if (!unique.length && digits.length === 10) {
    const all = await selectLeadMatches(supabase, (cols: string) =>
      supabase.from('leads').select(cols).eq('user_id', userId).or('phone.not.is.null,phone_e164.not.is.null')
    );
    unique = all.filter(l => last10(l.phone) === digits || last10(l.phone_e164) === digits);
  }

  if (!unique.length) return null;
  if (unique.length === 1) return unique[0];

  const ranked = await attachInboundFlags(supabase, unique);
  return pickPreferredDuplicate(ranked);
}
