export type DripSendTally = {
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  attempted: number;
};

export function tallyDripSends(sends: Array<{ sms_status?: string | null }>): DripSendTally {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  for (const s of sends) {
    const st = String(s.sms_status ?? '');
    if (st === 'sent' || st === 'delivered') sent += 1;
    else if (st === 'failed') failed += 1;
    else if (st.startsWith('skipped') || st === 'replied') skipped += 1;
    else pending += 1;
  }
  return { sent, failed, skipped, pending, attempted: sent + failed };
}

export function formatDripTally(t: DripSendTally): string {
  const parts = [`${t.sent} sent`];
  if (t.failed) parts.push(`${t.failed} failed`);
  if (t.skipped) parts.push(`${t.skipped} skipped`);
  if (t.pending) parts.push(`${t.pending} left`);
  return parts.join(' · ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recountJobSentCount(supabase: any, jobId: string): Promise<number> {
  const { count } = await supabase
    .from('sms_drip_sends')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .in('sms_status', ['sent', 'delivered']);
  const sent = count ?? 0;
  await supabase.from('sms_drip_jobs').update({ sent_count: sent, updated_at: new Date().toISOString() }).eq('id', jobId);
  return sent;
}
