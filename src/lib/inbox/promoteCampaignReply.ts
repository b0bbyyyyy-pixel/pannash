/** Inbound reply → Prospect (and into pipeline) unless they already have a real status or opted out. */

const STARTER_STATUSES = new Set(['', 'New Lead']);

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
  if (status === 'DNC') return;
  if (status && !STARTER_STATUSES.has(status)) return;

  await supabase
    .from('leads')
    .update({ lead_status: 'Prospect', in_pipeline: true })
    .eq('id', leadId);
}
