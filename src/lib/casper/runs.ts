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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logCasperRun(supabase: any, row: CasperRunInsert): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('casper_runs')
      .insert({
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
      })
      .select('id')
      .single();
    if (error) {
      console.error('[casper] log run', error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error('[casper] log run', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertCasperLeadState(
  supabase: any,
  args: {
    leadId: string;
    userId: string;
    phase: string;
    lastRunId?: string | null;
    pausedReason?: string | null;
  },
) {
  try {
    await supabase.from('casper_lead_state').upsert({
      lead_id: args.leadId,
      user_id: args.userId,
      phase: args.phase,
      last_run_id: args.lastRunId ?? null,
      paused_reason: args.pausedReason ?? null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[casper] upsert lead state', err);
  }
}
