import { getPingSettings, sendCasperPing } from '@/lib/casper/ping';
import {
  decodePingSchedule,
  earliestPingAt,
  encodePingSchedule,
  pingLeadLabel,
} from '@/lib/casper/calendarPingSchedule';

export {
  PING_BEFORE_OPTIONS,
  applyClientTimes,
  buildPingSchedule,
  decodePingSchedule,
  earliestPingAt,
  encodePingSchedule,
  offsetsFromEvent,
  pingLeadLabel,
} from '@/lib/casper/calendarPingSchedule';
export type { PingSchedule } from '@/lib/casper/calendarPingSchedule';

export async function fireDueCalendarPings(
  supabase: { from: (table: string) => any },
  userId?: string,
): Promise<number> {
  const now = new Date().toISOString();
  const load = async (cols: string) => {
    let query = supabase
      .from('calendar_events')
      .select(cols)
      .eq('alert_enabled', true)
      .eq('alert_sent', false)
      .lte('alert_at', now)
      .limit(40);
    if (userId) query = query.eq('user_id', userId);
    return query;
  };

  let { data: due, error } = await load(
    'id, user_id, title, notes, date, start_time, alert_phone, alert_schedule, alert_at',
  );
  if (error && /alert_schedule/i.test(error.message || '')) {
    ({ data: due, error } = await load(
      'id, user_id, title, notes, date, start_time, alert_phone, alert_at',
    ));
  }
  if (error || !due?.length) return 0;

  let sentCount = 0;
  for (const event of due) {
    const settings = await getPingSettings(supabase, event.user_id);
    const to = settings.phone;
    const schedule = decodePingSchedule(event.alert_schedule, null)
      || decodePingSchedule(event.alert_phone, event.alert_at);

    if (!schedule || !schedule.offsets.length) {
      if (!to) {
        await supabase.from('calendar_events').update({ alert_sent: true }).eq('id', event.id);
        continue;
      }
      const dateStr = new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
      const result = await sendCasperPing(supabase, {
        userId: event.user_id,
        body: `Casper reminder: "${event.title}" on ${dateStr}${event.notes ? `\n${event.notes}` : ''}`,
        kind: 'calendar',
        toPhone: to,
        requireEnabled: false,
      });
      if (result.sent) sentCount += 1;
      await supabase.from('calendar_events').update({ alert_sent: true }).eq('id', event.id);
      continue;
    }

    const dueOffsets = schedule.offsets.filter(o => {
      const at = schedule.times[String(o)];
      return at && at <= now && !schedule.sent.includes(o);
    });

    for (const minutes of dueOffsets) {
      if (!to) break;
      const when = event.start_time
        ? ` at ${formatStart(event.start_time)}`
        : '';
      const result = await sendCasperPing(supabase, {
        userId: event.user_id,
        body: `Casper reminder: "${event.title}"${when} — in ${pingLeadLabel(minutes)}`,
        kind: 'calendar',
        toPhone: to,
        requireEnabled: false,
      });
      if (result.sent) sentCount += 1;
      schedule.sent.push(minutes);
    }

    const nextAt = earliestPingAt(schedule);
    const patch: Record<string, unknown> = {
      alert_sent: !nextAt,
      alert_at: nextAt,
      alert_phone: encodePingSchedule(schedule),
      alert_schedule: schedule,
    };
    const { error: upErr } = await supabase.from('calendar_events').update(patch).eq('id', event.id);
    if (upErr && /alert_schedule/i.test(upErr.message || '')) {
      delete patch.alert_schedule;
      await supabase.from('calendar_events').update(patch).eq('id', event.id);
    }
  }
  return sentCount;
}

function formatStart(startTime: string) {
  const [h, m] = startTime.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h)) return startTime;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}
