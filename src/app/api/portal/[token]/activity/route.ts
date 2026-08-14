import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify portal belongs to this user
  const { data: portal } = await supabase
    .from('client_offer_portals')
    .select('id')
    .eq('token', token)
    .eq('user_id', user.id)
    .single();

  if (!portal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: logs } = await supabase
    .from('portal_activity_logs')
    .select('*')
    .eq('portal_id', portal.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json({ logs: logs || [] });
}
