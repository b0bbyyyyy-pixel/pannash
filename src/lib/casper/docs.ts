import { logCasperRun, upsertCasperLeadState } from '@/lib/casper/runs';
import type { CasperPhase } from '@/lib/casper/defaults';

export type DocKind = 'application' | 'bank' | 'other';

export function classifyDoc(fileName?: string | null, columnField?: string | null): DocKind {
  const s = `${fileName ?? ''} ${columnField ?? ''}`.toLowerCase();
  if (/(bank|statement|p&l|pnl|deposit)/.test(s)) return 'bank';
  if (/(application|app\b|funding.?app|credit.?app|abf)/.test(s)) return 'application';
  if (columnField === 'documents' || columnField === 'bank_statements') {
    return columnField === 'bank_statements' ? 'bank' : 'application';
  }
  return 'other';
}

function nextPhase(current: string | null | undefined, kind: DocKind): CasperPhase {
  if (kind === 'application') return 'app_received';
  if (kind === 'bank') return 'banks_received';
  if (current === 'app_received' || current === 'banks_received' || current === 'handed_off') {
    return current as CasperPhase;
  }
  return 'handed_off';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onCasperDocsReceived(
  supabase: any,
  args: {
    userId: string;
    leadId: string;
    fileName?: string | null;
    columnField?: string | null;
    filePath?: string | null;
    attachmentId?: string | null;
  },
) {
  const kind = classifyDoc(args.fileName, args.columnField);
  if (kind === 'other') return null;

  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, company, user_id')
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) return null;

  const { data: state } = await supabase
    .from('casper_lead_state')
    .select('phase')
    .eq('lead_id', args.leadId)
    .maybeSingle();

  const phase = nextPhase(state?.phase, kind);
  const fileLabel = args.fileName || kind;
  const thinking = kind === 'application'
    ? `Application landed in CRM (${fileLabel}). Stopping auto-replies for this lead.`
    : `Bank statements landed in CRM (${fileLabel}). Stopping auto-replies for this lead.`;

  const runId = await logCasperRun(supabase, {
    userId: args.userId,
    leadId: args.leadId,
    trigger: 'docs_detected',
    thinking,
    actions: [{
      type: 'docs_detected',
      kind,
      file_name: args.fileName,
      file_path: args.filePath,
      attachment_id: args.attachmentId,
    }],
    inputSummary: fileLabel,
    outputSummary: `phase=${phase}`,
  });

  await upsertCasperLeadState(supabase, {
    leadId: args.leadId,
    userId: args.userId,
    phase,
    lastRunId: runId,
    pausedReason: kind === 'application' ? 'app_received' : 'banks_received',
  });

  const type = kind === 'application' ? 'casper_docs_received' : 'casper_docs_received';
  await supabase.from('agent_decisions').insert({
    user_id: args.userId,
    lead_id: args.leadId,
    lead_name: lead.name || 'Lead',
    company: lead.company ?? null,
    type,
    status: 'pending',
    priority: 'urgent',
    proposal: kind === 'application'
      ? `${lead.name || 'Lead'} sent the funding application. Casper stopped auto-replies.`
      : `${lead.name || 'Lead'} sent bank statements. Casper stopped auto-replies.`,
    draft_content: null,
    draft_type: null,
    metadata: {
      kind,
      file_name: args.fileName,
      file_path: args.filePath,
      attachment_id: args.attachmentId,
      phase,
      run_id: runId,
    },
  });

  return { phase, runId, kind };
}
