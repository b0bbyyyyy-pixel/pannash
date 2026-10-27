import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';

export type CasperRunInsert = {
  userId: string;
  leadId?: string | null;
  trigger: string;
  status?: string;
  thinking?: string | null;
  actions?: unknown[];
  model?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  error?: string | null;
  stage?: string | null;
  guardResults?: unknown;
  contextSnapshot?: string | null;
  planNote?: string | null;
};

function baseRunRow(row: CasperRunInsert) {
  return {
    user_id: row.userId,
    lead_id: row.leadId ?? null,
    trigger: row.trigger,
    status: row.status ?? 'ok',
    thinking: row.thinking ?? null,
    actions: row.actions ?? [],
    model: row.model ?? null,
    input_summary: row.inputSummary ?? null,
    output_summary: row.outputSummary ?? null,
    error: row.error ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logCasperRun(supabase: any, row: CasperRunInsert): Promise<string | null> {
  const extra = {
    stage: row.stage ?? null,
    guard_results: row.guardResults ?? [],
    context_snapshot: row.contextSnapshot ?? null,
    plan_note: row.planNote ?? null,
  };
  try {
    const { data, error } = await supabase
      .from('casper_runs')
      .insert({ ...baseRunRow(row), ...extra })
      .select('id')
      .single();
    if (!error) return data?.id ?? null;
    if (isMissingSchema(error)) {
      warnMissingSchema('casper_runs.stage', error);
      const retry = await supabase.from('casper_runs').insert(baseRunRow(row)).select('id').single();
      if (retry.error) {
        console.error('[casper] log run', retry.error);
        return null;
      }
      return retry.data?.id ?? null;
    }
    console.error('[casper] log run', error);
    return null;
  } catch (err) {
    console.error('[casper] log run', err);
    return null;
  }
}

export type UpsertCasperLeadStateArgs = {
  leadId: string;
  userId: string;
  phase: string;
  lastRunId?: string | null;
  pausedReason?: string | null;
  planNote?: string | null;
  lastGuardResult?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertCasperLeadState(
  supabase: any,
  args: UpsertCasperLeadStateArgs,
) {
  const patch: Record<string, unknown> = {
    lead_id: args.leadId,
    user_id: args.userId,
    phase: args.phase,
    updated_at: new Date().toISOString(),
  };
  if ('lastRunId' in args) patch.last_run_id = args.lastRunId ?? null;
  if ('pausedReason' in args) patch.paused_reason = args.pausedReason ?? null;
  if ('planNote' in args) {
    patch.plan_note = args.planNote ?? null;
    patch.plan_updated_at = new Date().toISOString();
  }
  if ('lastGuardResult' in args) patch.last_guard_result = args.lastGuardResult ?? null;

  try {
    const { error } = await supabase.from('casper_lead_state').upsert(patch);
    if (error && isMissingSchema(error)) {
      warnMissingSchema('casper_lead_state.plan_note', error);
      const slim = {
        lead_id: args.leadId,
        user_id: args.userId,
        phase: args.phase,
        updated_at: patch.updated_at,
      } as Record<string, unknown>;
      if ('lastRunId' in args) slim.last_run_id = args.lastRunId ?? null;
      if ('pausedReason' in args) slim.paused_reason = args.pausedReason ?? null;
      await supabase.from('casper_lead_state').upsert(slim);
    } else if (error) {
      console.error('[casper] upsert lead state', error);
    }
  } catch (err) {
    console.error('[casper] upsert lead state', err);
  }
}
