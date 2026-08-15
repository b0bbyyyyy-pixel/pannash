import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// POST /api/portal/expire-old — deactivates all portals for a lead except the newest one
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId, keepToken } = await req.json();
    if (!leadId || !keepToken) return NextResponse.json({ error: 'Missing leadId or keepToken' }, { status: 400 });

    // Deactivate all portals for this lead except the one we want to keep
    const { data: deactivated, error } = await supabase
      .from('client_offer_portals')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('lead_id', leadId)
      .neq('token', keepToken)
      .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deactivated: deactivated?.length ?? 0 });
  } catch (err) {
    console.error('[portal/expire-old]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
