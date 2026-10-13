const FULL_PACKS_RE = /ai\s*full\s*packs?/i;

export function isAiFullPacksName(name: unknown): boolean {
  return FULL_PACKS_RE.test(String(name || '').trim());
}

/** Skip Casper on leads sitting in an "AI Full Packs" campaign or list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leadInAiFullPacks(
  supabase: any,
  args: { userId: string; leadId: string; listId?: string | null },
): Promise<boolean> {
  try {
    const { data: rows } = await supabase
      .from('campaign_leads')
      .select('campaigns(name)')
      .eq('lead_id', args.leadId);
    for (const row of rows ?? []) {
      const camp = row.campaigns as { name?: string } | { name?: string }[] | null;
      const name = Array.isArray(camp) ? camp[0]?.name : camp?.name;
      if (isAiFullPacksName(name)) return true;
    }
  } catch {
    /* join shape may vary */
  }

  if (!args.listId) return false;
  try {
    const { data: list } = await supabase
      .from('lead_lists')
      .select('name')
      .eq('id', args.listId)
      .eq('user_id', args.userId)
      .maybeSingle();
    if (isAiFullPacksName(list?.name)) return true;
  } catch {
    /* ignore */
  }

  try {
    const { data: camps } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('user_id', args.userId);
    for (const c of camps ?? []) {
      if (isAiFullPacksName(c.name)) {
        const { count } = await supabase
          .from('campaign_leads')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', args.leadId)
          .eq('campaign_id', c.id);
        if ((count ?? 0) > 0) return true;
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}
