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
