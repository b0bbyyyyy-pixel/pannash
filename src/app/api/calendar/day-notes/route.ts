import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

// GET /api/calendar/day-notes?date=2026-08-15
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ notes: '' });

  const { data } = await supabase
    .from('calendar_day_notes')
    .select('notes')
    .eq('user_id', user.id)
    .eq('date', date)
    .single();

  return NextResponse.json({ notes: data?.notes ?? '' });
}

// PUT /api/calendar/day-notes
export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { date, notes } = await req.json();
  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

  const { error } = await supabase
    .from('calendar_day_notes')
    .upsert(
      { user_id: user.id, date, notes: notes ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
