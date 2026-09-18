import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
  const { date, end_date, title, notes, alertEnabled, alertAt, alertPhone, color } = body;

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: user.id,
      date,
      end_date: end_date || null,
      title,
      notes: notes || null,
      alert_enabled: alertEnabled ?? false,
      alert_at: alertAt || null,
      alert_phone: alertPhone || null,
      alert_sent: false,
      color: color || 'blue',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
