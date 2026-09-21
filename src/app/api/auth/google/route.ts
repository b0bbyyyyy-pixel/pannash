import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

function safeRedirect(raw: string | null, fallback: string) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

/**
 * GET /api/auth/google?redirect=/settings/connections
 * Gmail send OAuth. Shares the Google Cloud callback URL with Sheets connect,
 * but stores tokens in email_connections so Sheets tokens are not overwritten.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }

  const origin = req.nextUrl.origin;
  const callbackUrl = `${origin}/api/auth/google/callback`;
  const redirectAfter = safeRedirect(
    req.nextUrl.searchParams.get('redirect'),
    '/settings/connections'
  );

  const state = Buffer.from(
    JSON.stringify({ redirectAfter, userId: user.id, purpose: 'gmail' })
  ).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
