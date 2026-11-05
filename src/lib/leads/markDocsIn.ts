import { classifyDoc } from '@/lib/casper/docs';
import { stopCampaignDripForLead } from '@/lib/inbox/promoteCampaignReply';
import { appendStatusHistory } from '@/lib/leads/fileActivity';

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
const OUTSIDE_CRM_FILE = /one[_ ]funding[_ ]application/i;

export function fileLooksOutsideCrm(fileName?: string | null) {
  return OUTSIDE_CRM_FILE.test(String(fileName || ''));
}

export function docsPackageReady(
  files: { file_name?: string | null; column_field?: string | null }[],
  opts?: { fromOutside?: boolean; submittedPackage?: boolean },
) {
  if (opts?.fromOutside || opts?.submittedPackage) return files.length > 0;
  if (files.some((file) => fileLooksOutsideCrm(file.file_name))) return true;
  let apps = 0;
  let banks = 0;
  for (const file of files) {
    const kind = classifyDoc(file.file_name, file.column_field);
    if (kind === 'application') apps += 1;
    else if (kind === 'bank') banks += 1;
  }
  if (apps >= 1 && banks >= 1) return true;
  return files.length >= DOCS_IN_MIN;
}

function udFromOutside(ud: unknown) {
  const rec = ud && typeof ud === 'object' ? (ud as Record<string, unknown>) : {};
  return rec.docsFromOutside === true;
}

/** After an upload: outside-CRM files (or app + statements / 4+ files) → Docs In. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function maybeMarkDocsIn(
  supabase: any,
  opts: { leadId: string; userId: string; fromOutside?: boolean; submittedPackage?: boolean },
): Promise<boolean> {
  const [{ data: files }, { data: lead }] = await Promise.all([
    supabase.from('lead_attachments').select('file_name, column_field').eq('lead_id', opts.leadId),
    supabase
      .from('leads')
      .select('lead_status, stage, underwriting_data')
      .eq('id', opts.leadId)
      .eq('user_id', opts.userId)
      .maybeSingle(),
  ]);

  const rows = Array.isArray(files) ? files : [];
  const fromOutside =
    opts.fromOutside || opts.submittedPackage || udFromOutside(lead?.underwriting_data);
  if (!docsPackageReady(rows, { fromOutside })) return false;

  const current = String(lead?.lead_status || lead?.stage || '').trim();
  if (!DOCS_IN_FROM.has(current)) return false;

  await appendStatusHistory(supabase, {
    userId: opts.userId,
    leadId: opts.leadId,
    status: 'Docs In',
    prev: lead?.lead_status,
    underwritingData: lead?.underwriting_data,
  });

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
