import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPingSettings } from '@/lib/casper/ping';
import {
  applyClientTimes,
  buildPingSchedule,
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

// GET /api/calendar/events?month=2026-08
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = req.nextUrl.searchParams.get('month'); // e.g. "2026-08"
  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (month) {
    // Compute the real last day of the month so the filter is always valid
    // (e.g. September has 30 days, not 31 — Postgres would error on an invalid DATE)
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
    const lastDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    query = query.gte('date', `${month}-01`).lte('date', lastDate);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

// POST /api/calendar/events
export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { date, end_date, title, notes, alertEnabled, alertOffsets, alertTimes, color, start_time } = body;
  const ping = alertEnabled ? await getPingSettings(supabase, user.id) : { phone: '' };
  const offsets = Array.isArray(alertOffsets) ? alertOffsets.map(Number).filter(Number.isFinite) : [];
  const schedule = alertEnabled && offsets.length
    ? applyClientTimes(buildPingSchedule(date, start_time, offsets), alertTimes)
    : null;

  const row: Record<string, unknown> = {
    user_id: user.id,
    date,
    end_date: end_date || null,
    title,
    notes: notes || null,
    alert_enabled: Boolean(alertEnabled && schedule),
    alert_at: schedule ? earliestPingAt(schedule) : null,
    alert_phone: schedule ? encodePingSchedule(schedule) : (ping.phone || null),
    alert_schedule: schedule,
    alert_sent: false,
    color: color || 'black',
    start_time: start_time || null,
  };

  let { data, error } = await supabase.from('calendar_events').insert(row).select().single();
  if (error && /alert_schedule/i.test(error.message || '')) {
    delete row.alert_schedule;
    ({ data, error } = await supabase.from('calendar_events').insert(row).select().single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
