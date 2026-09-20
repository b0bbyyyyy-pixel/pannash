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

const empty = { top_priorities: '', personal: '', work: '', coming_up: '' };

// GET /api/calendar/week?start=2026-09-29
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start = req.nextUrl.searchParams.get('start');
  if (!start) return NextResponse.json({ error: 'start required' }, { status: 400 });

  const { data } = await supabase
    .from('calendar_week_planner')
    .select('top_priorities, personal, work, coming_up')
    .eq('user_id', user.id)
    .eq('week_start', start)
    .maybeSingle();

  return NextResponse.json(data ?? empty);
}

// PUT /api/calendar/week
export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { start, top_priorities, personal, work, coming_up } = body;
  if (!start) return NextResponse.json({ error: 'start required' }, { status: 400 });

  const { error } = await supabase
    .from('calendar_week_planner')
    .upsert(
      {
        user_id: user.id,
        week_start: start,
        top_priorities: top_priorities ?? '',
        personal: personal ?? '',
        work: work ?? '',
        coming_up: coming_up ?? '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,week_start' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
