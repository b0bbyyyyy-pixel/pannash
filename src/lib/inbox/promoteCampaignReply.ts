/** Inbound reply → Prospect + pipeline, and stamp the thread onto the main Inbox. */

const PROMOTE_FROM = new Set(['', 'New Lead', 'Prospect', 'Contacted', 'Callback Scheduled', 'Revisit']);

/** Campaign text threads only keep New Lead / unworked contacts. */
export function isCampaignInboxLead(l: {
  in_pipeline?: boolean | null;
  lead_status?: string | null;
}): boolean {
  if (l.in_pipeline === true) return false;
  const status = String(l.lead_status ?? '').trim();
  if (!status || status === 'New Lead') return true;
  return false;
}

export function isProspectStatus(status: unknown): boolean {
  return String(status ?? '').trim().toLowerCase() === 'prospect';
}

/** Stop remaining drip / campaign queue once a lead is a Prospect (or otherwise in pipeline). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stopCampaignDripForLead(supabase: any, leadId: string) {
  try {
    await supabase
      .from('sms_drip_sends')
      .update({ sms_status: 'replied', error: 'Moved to pipeline' })
      .eq('lead_id', leadId)
      .in('sms_status', ['queued', 'scheduled', 'sending']);
  } catch {
    // Drip tables not created yet
  }
  try {
    await supabase
      .from('campaign_leads')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .in('status', ['queued', 'pending', 'sending', 'scheduled', 'active', 'sent']);
  } catch {
    // Optional table
  }
}

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
  await stopCampaignDripForLead(supabase, leadId);
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
