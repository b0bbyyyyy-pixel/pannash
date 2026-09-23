/** Campaign lead with no pipeline status → Prospect + pipeline on first reply. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function promoteCampaignLeadOnReply(supabase: any, leadId: string) {
  const { data: lead } = await supabase
    .from('leads')
    .select('list_id, in_pipeline, lead_status')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead?.list_id) return;
  if (lead.in_pipeline) return;
  const status = String(lead.lead_status ?? '').trim();
  if (status && status !== 'New Lead') return;

  await supabase
    .from('leads')
    .update({ lead_status: 'Prospect', in_pipeline: true })
    .eq('id', leadId);
}
