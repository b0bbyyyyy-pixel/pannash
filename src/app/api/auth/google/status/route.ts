import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getGoogleAccessToken } from '@/lib/google/token';

export const dynamic = 'force-dynamic';

/** GET /api/auth/google/status — { connected, email, expired, needsReconnect } */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from('google_connections')
    .select('google_email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return NextResponse.json({ connected: false });

  const token = await getGoogleAccessToken(supabase, user.id);
  if (token) {
    return NextResponse.json({
      connected: true,
      email: data.google_email,
      expired: false,
      needsReconnect: false,
    });
  }

  return NextResponse.json({
    connected: true,
    email: data.google_email,
    expired: true,
    needsReconnect: true,
  });
}
