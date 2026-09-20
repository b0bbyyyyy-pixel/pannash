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

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ image: '', text: '' });

  const { data, error } = await supabase
    .from('calendar_day_notes')
    .select('jot_image, jot_text')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    image: data?.jot_image ?? '',
    text: data?.jot_text ?? '',
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { date, image, text } = await req.json();
  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

  const { error } = await supabase
    .from('calendar_day_notes')
    .upsert({
      user_id: user.id,
      date,
      jot_image: image || null,
      jot_text: typeof text === 'string' ? text : '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
