import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPingSettings } from '@/lib/casper/ping';
import {
  applyClientTimes,
  buildPingSchedule,
  decodePingSchedule,
  earliestPingAt,
  encodePingSchedule,
} from '@/lib/casper/calendarPing';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}

// PUT /api/calendar/events/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { title, end_date, notes, alertEnabled, alertOffsets, alertTimes, color, start_time, date } = body;
  const ping = alertEnabled ? await getPingSettings(supabase, user.id) : { phone: '' };

  const { data: existing } = await supabase
    .from('calendar_events')
    .select('date, start_time, alert_schedule, alert_phone, alert_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  const offsets = Array.isArray(alertOffsets) ? alertOffsets.map(Number).filter(Number.isFinite) : [];
  const prev = decodePingSchedule(existing?.alert_schedule, null)
    || decodePingSchedule(existing?.alert_phone, existing?.alert_at);
  const eventDate = date || existing?.date;
  const built = alertEnabled && offsets.length && eventDate
    ? applyClientTimes(buildPingSchedule(eventDate, start_time ?? existing?.start_time, offsets), alertTimes)
    : null;
  const schedule = built
    ? {
        ...built,
        sent: (prev?.sent ?? []).filter(m => prev?.times?.[String(m)] === built.times[String(m)]),
      }
    : null;

  const patch: Record<string, unknown> = {
    title,
    end_date: end_date || null,
    notes: notes || null,
    alert_enabled: Boolean(alertEnabled && schedule),
    alert_at: schedule ? earliestPingAt(schedule) : null,
    alert_phone: schedule ? encodePingSchedule(schedule) : (ping.phone || null),
    alert_schedule: schedule,
    alert_sent: !schedule || !earliestPingAt(schedule),
    color: color || 'black',
    start_time: start_time || null,
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from('calendar_events')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error && /alert_schedule/i.test(error.message || '')) {
    delete patch.alert_schedule;
    ({ data, error } = await supabase
      .from('calendar_events')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

// DELETE /api/calendar/events/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
