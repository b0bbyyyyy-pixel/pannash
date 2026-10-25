import { last10, phoneVariants } from '@/lib/leads/phone';

export const DNC_STATUS = {
  name: 'DNC',
  color: '#7f1d1d',
  bg_color: '#fee2e2',
} as const;

const STOP_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END']);

export function isSmsStopBody(body: string | null | undefined) {
  const t = String(body ?? '').trim();
  if (!t) return false;
  if (STOP_WORDS.has(t.toUpperCase())) return true;
  const letters = t.replace(/[^A-Za-z]/g, '').toUpperCase();
  return STOP_WORDS.has(letters);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDncStatus(supabase: any, userId: string) {
  const { data: existing } = await supabase
    .from('lead_statuses')
    .select('id')
    .eq('user_id', userId)
    .eq('name', DNC_STATUS.name)
    .maybeSingle();
  if (existing) return;

  const { data: maxRow } = await supabase
    .from('lead_statuses')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from('lead_statuses').insert({
    user_id: userId,
    name: DNC_STATUS.name,
    color: DNC_STATUS.color,
    bg_color: DNC_STATUS.bg_color,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  });
}

export function isDncLead(lead?: {
  lead_status?: string | null;
  sms_opt_out?: boolean | null;
  dnc?: boolean | null;
} | null) {
  if (!lead) return false;
  if (lead.sms_opt_out || lead.dnc) return true;
  return String(lead.lead_status ?? '').trim().toUpperCase() === 'DNC';
}

/** Hide STOP replies and DNC leads from inbox / mobile thread lists. */
export function isHiddenInboxThread(
  lead: Parameters<typeof isDncLead>[0],
  preview?: string | null,
) {
  if (isSmsStopBody(preview)) return true;
  return isDncLead(lead);
}

/** STOP / DNC: pipeline status DNC, no SMS, no dialer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function markLeadDnc(supabase: any, leadId: string, userId?: string | null) {
  if (userId) await ensureDncStatus(supabase, userId);

  const full = {
    sms_opt_out: true,
    lead_status: DNC_STATUS.name,
    dnc: true,
    next_eligible_at: null,
  };
  const { error } = await supabase.from('leads').update(full).eq('id', leadId);
  if (!error) return;
  await supabase.from('leads').update({
    sms_opt_out: true,
    lead_status: DNC_STATUS.name,
  }).eq('id', leadId);
}

export function isTwilioOptOutError(
  errorCode?: number | string | null,
  message?: string | null,
) {
  if (Number(errorCode) === 21610) return true;
  const t = String(message ?? '');
  return /\b21610\b/.test(t) || /recipient opted out/i.test(t);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findLeadIdsByPhone(supabase: any, phone: string, userId: string): Promise<string[]> {
  const variants = phoneVariants(phone);
  const digits = last10(phone);
  const ids = new Set<string>();
  if (variants.length) {
    const { data: byPhone } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .in('phone', variants)
      .limit(40);
    for (const row of byPhone ?? []) if (row?.id) ids.add(row.id);
    const { data: byE164 } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .in('phone_e164', variants)
      .limit(40);
    for (const row of byE164 ?? []) if (row?.id) ids.add(row.id);
  }
  if (digits.length === 10 && ids.size === 0) {
    const { data: loose } = await supabase
      .from('leads')
      .select('id, phone, phone_e164')
      .eq('user_id', userId)
      .or(`phone.ilike.%${digits}%,phone_e164.ilike.%${digits}%`)
      .limit(40);
    for (const row of loose ?? []) {
      if (last10(row.phone) === digits || last10(row.phone_e164) === digits) ids.add(row.id);
    }
  }
  return [...ids];
}

/** Mark every lead on this phone so drip/inbox cannot text a duplicate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function markPhoneDnc(
  supabase: any,
  args: { userId?: string | null; phone?: string | null; leadId?: string | null },
) {
  let userId = args.userId ?? null;
  let phone = args.phone ?? null;
  if (args.leadId && (!userId || !phone)) {
    const { data } = await supabase
      .from('leads')
      .select('id, user_id, phone, phone_e164')
      .eq('id', args.leadId)
      .maybeSingle();
    if (data) {
      userId = userId || data.user_id || null;
      phone = phone || data.phone || data.phone_e164 || null;
    }
  }
  const ids = new Set<string>();
  if (args.leadId) ids.add(args.leadId);
  if (userId && phone) {
    for (const id of await findLeadIdsByPhone(supabase, phone, userId)) ids.add(id);
  }
  if (!ids.size) return;
  if (userId) await ensureDncStatus(supabase, userId);
  for (const id of ids) await markLeadDnc(supabase, id, userId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lastInboundWasStop(supabase: any, leadId: string) {
  const { data } = await supabase
    .from('inbox_messages')
    .select('body')
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return isSmsStopBody(data?.body);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function smsSendBlockReason(
  supabase: any,
  lead: { id: string; sms_opt_out?: boolean | null; lead_status?: string | null; dnc?: boolean | null },
) {
  if (isDncLead(lead)) return 'Lead has opted out of SMS';
  if (await lastInboundWasStop(supabase, lead.id)) return 'Lead replied STOP';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applySmsOptOutFromFailure(
  supabase: any,
  args: {
    userId?: string | null;
    phone?: string | null;
    leadId?: string | null;
    errorCode?: number | string | null;
    error?: string | null;
  },
) {
  if (!isTwilioOptOutError(args.errorCode, args.error)) return false;
  await markPhoneDnc(supabase, args);
  return true;
}
