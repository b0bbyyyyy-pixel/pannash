const CHUNK = 80;

type AttachmentClient = {
  from: (table: string) => any;
};

export async function countAttachmentsForLead(
  supabase: AttachmentClient,
  leadId: string,
): Promise<number> {
  const { count } = await supabase
    .from('lead_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId);
  return typeof count === 'number' ? count : 0;
}

export async function countAttachmentsByLead(
  supabase: AttachmentClient,
  leadIds: string[],
): Promise<Record<string, number>> {
  const docCountByLead: Record<string, number> = {};
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const slice = leadIds.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const { data: attRows } = await supabase
      .from('lead_attachments')
      .select('lead_id')
      .in('lead_id', slice);
    for (const row of attRows ?? []) {
      const id = String((row as { lead_id: string }).lead_id);
      docCountByLead[id] = (docCountByLead[id] ?? 0) + 1;
    }
  }
  return docCountByLead;
}
