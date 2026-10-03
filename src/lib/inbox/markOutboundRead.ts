/** After an inbound reply, prior outbound texts were seen. */
export async function markOutboundReadAfterReply(
  supabase: { from: (table: string) => any },
  leadId: string,
) {
  const { error } = await supabase
    .from('inbox_messages')
    .update({ status: 'read' })
    .eq('lead_id', leadId)
    .eq('direction', 'outbound')
    .in('status', ['queued', 'sent', 'delivered']);
  if (error) console.warn('[inbox] mark read', error.message);
}
