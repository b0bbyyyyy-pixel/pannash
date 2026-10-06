import { stopCampaignDripForLead } from '@/lib/inbox/promoteCampaignReply';

const DOCS_IN_FROM = new Set([
  '',
  'New Lead',
  'Prospect',
  'Contacted',
  'Callback Scheduled',
  'Revisit',
  'App Out',
  'Application Acknowledgement',
  'Documents Acknowledgment',
  'Docs Requested',
  'Missing Docs/info',
  'Needs More Docs',
]);

const DOCS_IN_MIN = 4;

/** After an upload: if this lead now has 4+ files, move early-stage statuses to Docs In. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function maybeMarkDocsIn(
  supabase: any,
  opts: { leadId: string; userId: string },
): Promise<boolean> {
  const { count } = await supabase
    .from('lead_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', opts.leadId);

  if ((count ?? 0) < DOCS_IN_MIN) return false;

  const { data: lead } = await supabase
    .from('leads')
    .select('lead_status, stage')
    .eq('id', opts.leadId)
    .eq('user_id', opts.userId)
    .maybeSingle();

  const current = String(lead?.lead_status || lead?.stage || '').trim();
  if (!DOCS_IN_FROM.has(current)) return false;

  await supabase
    .from('leads')
    .update({
      lead_status: 'Docs In',
      in_pipeline: true,
      last_contact: new Date().toISOString(),
    })
    .eq('id', opts.leadId)
    .eq('user_id', opts.userId);

  await stopCampaignDripForLead(supabase, opts.leadId);
  return true;
}
