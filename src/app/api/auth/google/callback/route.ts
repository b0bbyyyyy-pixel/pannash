import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google/callback?code=...&state=...
 * Google redirects here after the user approves access.
 * Exchanges the code for tokens and stores them in google_connections.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // User denied access
  if (error) {
    return NextResponse.redirect(`${origin}/leads?google_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/leads?google_error=missing_code`);
  }

  // Decode state
  let redirectAfter = '/leads';
  let userId: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    redirectAfter = decoded.redirectAfter || '/leads';
    userId = decoded.userId || null;
  } catch {
    return NextResponse.redirect(`${origin}/leads?google_error=invalid_state`);
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const callbackUrl  = `${origin}/api/auth/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    console.error('Google token exchange failed:', tokens);
    return NextResponse.redirect(`${origin}${redirectAfter}?google_error=token_exchange_failed`);
  }

  // Fetch the user's Google email
  let googleEmail: string | null = null;
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();
    googleEmail = info.email || null;
  } catch { /* non-fatal */ }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Store tokens using the service-role key so we can write regardless of RLS
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    }
  );

  const { error: upsertErr } = await supabase
    .from('google_connections')
    .upsert(
      {
        user_id:       userId,
        google_email:  googleEmail,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at:    expiresAt,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (upsertErr) {
    console.error('google_connections upsert error:', upsertErr);
    return NextResponse.redirect(`${origin}${redirectAfter}?google_error=db_error`);
  }

  return NextResponse.redirect(`${origin}${redirectAfter}?google_connected=1`);
}
