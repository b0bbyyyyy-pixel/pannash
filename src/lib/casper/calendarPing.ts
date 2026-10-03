import { getPingSettings, sendCasperPing } from '@/lib/casper/ping';

export async function fireDueCalendarPings(
  supabase: { from: (table: string) => any },
  userId?: string,
): Promise<number> {
  const now = new Date().toISOString();
  let query = supabase
    .from('calendar_events')
    .select('id, user_id, title, notes, date, alert_phone')
    .eq('alert_enabled', true)
    .eq('alert_sent', false)
    .lte('alert_at', now)
    .limit(40);

  if (userId) query = query.eq('user_id', userId);

  const { data: due, error } = await query;
  if (error || !due?.length) return 0;

  let sent = 0;
  for (const event of due) {
    const settings = await getPingSettings(supabase, event.user_id);
    const to = event.alert_phone || settings.phone;
    const dateStr = new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const body = `Casper reminder: "${event.title}" on ${dateStr}${event.notes ? `\n${event.notes}` : ''}`;

    const result = await sendCasperPing(supabase, {
      userId: event.user_id,
      body,
      kind: 'calendar',
      toPhone: to,
      requireEnabled: false,
    });
    if (result.sent) sent += 1;

    await supabase.from('calendar_events').update({ alert_sent: true }).eq('id', event.id);
  }
  return sent;
}
