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
    query = query.gte('date', `${month}-01`).lte('date', `${month}-31`);
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
  const { date, title, notes, alertEnabled, alertAt, alertPhone, color } = body;

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: user.id,
      date,
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
