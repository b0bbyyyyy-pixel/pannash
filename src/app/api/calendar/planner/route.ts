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

// GET /api/calendar/planner?month=2026-09
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = req.nextUrl.searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

  const { data } = await supabase
    .from('calendar_planner')
    .select('month_notes, habits')
    .eq('user_id', user.id)
    .eq('month_key', month)
    .maybeSingle();

  return NextResponse.json({
    month_notes: data?.month_notes ?? '',
    habits: data?.habits ?? [],
  });
}

// PUT /api/calendar/planner
export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { month, month_notes, habits } = await req.json();
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

  const { error } = await supabase
    .from('calendar_planner')
    .upsert(
      {
        user_id: user.id,
        month_key: month,
        month_notes: month_notes ?? '',
        habits: habits ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,month_key' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
