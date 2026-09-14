import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** GET /api/auth/google/status — returns { connected, email } */
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
    .select('google_email, expires_at')
    .eq('user_id', user.id)
    .single();

  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    email: data.google_email,
    expired: new Date(data.expires_at) < new Date(),
  });
}
