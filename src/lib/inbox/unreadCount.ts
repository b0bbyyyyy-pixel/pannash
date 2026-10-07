import { isHiddenInboxThread } from '@/lib/leads/dnc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function countInboxUnread(supabase: any, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('inbox_conversations')
    .select('lead_id, unread_count, last_message_preview, last_inbound_at, last_direction')
    .eq('user_id', userId)
    .gt('unread_count', 0);

  if (error) return 0;

  const ids = [...new Set((data ?? []).map((r: { lead_id: string }) => r.lead_id).filter(Boolean))];
  const { data: leads } = ids.length
    ? await supabase.from('leads').select('id, lead_status, sms_opt_out').eq('user_id', userId).in('id', ids)
    : { data: [] as { id: string; lead_status?: string | null; sms_opt_out?: boolean | null }[] };
  const byId = new Map(
    (leads ?? []).map((l: { id: string; lead_status?: string | null; sms_opt_out?: boolean | null }) => [l.id, l]),
  );

  let count = 0;
  for (const row of data ?? []) {
    const preview = row.last_message_preview;
    if (isHiddenInboxThread(byId.get(row.lead_id) as { lead_status?: string | null; sms_opt_out?: boolean | null } | undefined, preview)) continue;
    if (!row.last_inbound_at && row.last_direction !== 'inbound') continue;
    count += Number(row.unread_count) || 0;
  }
  return count;
}
