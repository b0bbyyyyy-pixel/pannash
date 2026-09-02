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

// GET — load portal defaults for the logged-in user
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('automation_settings')
      .select('portal_defaults')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({ defaults: data?.portal_defaults ?? null });
  } catch (err) {
    console.error('[portal/defaults GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — save portal defaults for the logged-in user
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    const { error } = await supabase
      .from('automation_settings')
      .upsert(
        { user_id: user.id, portal_defaults: body, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[portal/defaults POST]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[portal/defaults POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
