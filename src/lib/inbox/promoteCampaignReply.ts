/** Inbound reply → Prospect + pipeline, and stamp the thread onto the main Inbox. */

const PROMOTE_FROM = new Set(['', 'New Lead', 'Prospect', 'Contacted', 'Callback Scheduled', 'Revisit']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function promoteCampaignLeadOnReply(supabase: any, leadId: string) {
  const { data: lead } = await supabase
    .from('leads')
    .select('lead_status, sms_opt_out')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) return;
  if (lead.sms_opt_out) return;
  const status = String(lead.lead_status ?? '').trim();
  if (status.toUpperCase() === 'DNC') return;

  const patch: Record<string, unknown> = {
    in_pipeline: true,
    last_contact: new Date().toISOString(),
  };
  if (!status || PROMOTE_FROM.has(status)) patch.lead_status = 'Prospect';

  await supabase.from('leads').update(patch).eq('id', leadId);
}

/** Make sure a real (non-STOP) reply appears on the main Inbox rail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stampInboxInbound(
  supabase: any,
  args: { userId: string; leadId: string; preview: string; stopped?: boolean },
) {
  const now = new Date().toISOString();
  const preview = args.preview.slice(0, 100);

  const { data: conv } = await supabase
    .from('inbox_conversations')
    .select('id, unread_count')
    .eq('user_id', args.userId)
    .eq('lead_id', args.leadId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    last_message_at: now,
    last_message_preview: preview,
    last_direction: 'inbound',
  };
  if (args.stopped) {
    patch.last_inbound_at = null;
    patch.unread_count = 0;
  } else {
    patch.last_inbound_at = now;
  }

  if (conv?.id) {
    const { error } = await supabase.from('inbox_conversations').update(patch).eq('id', conv.id);
    if (error && /last_inbound_at/i.test(error.message || '')) {
      delete patch.last_inbound_at;
      await supabase.from('inbox_conversations').update(patch).eq('id', conv.id);
    }
  } else if (!args.stopped) {
    await supabase.from('inbox_conversations').insert({
      user_id: args.userId,
      lead_id: args.leadId,
      unread_count: 1,
      ...patch,
    });
  }

  if (!args.stopped) {
    await supabase.from('leads').update({ last_contact: now, in_pipeline: true }).eq('id', args.leadId);
  }
}
