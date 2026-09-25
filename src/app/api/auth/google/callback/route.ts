import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function safeRedirect(raw: unknown, fallback: string) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

function incomingRefreshToken(tokens: { refresh_token?: unknown }): string | null {
  return typeof tokens.refresh_token === 'string' && tokens.refresh_token.trim()
    ? tokens.refresh_token.trim()
    : null;
}

/**
 * GET /api/auth/google/callback?code=...&state=...
 * Sheets connect (google_connections) and Gmail send (email_connections)
 * share this callback URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${origin}/settings/connections?gmail_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/settings/connections?gmail_error=missing_code`);
  }

  let redirectAfter = '/leads';
  let userId: string | null = null;
  let purpose: string = 'sheets';
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    redirectAfter = safeRedirect(decoded.redirectAfter, '/leads');
    userId = decoded.userId || null;
    purpose = decoded.purpose || 'sheets';
  } catch {
    return NextResponse.redirect(`${origin}/settings/connections?gmail_error=invalid_state`);
  }

  if (!userId) {
    return NextResponse.redirect(`${origin}${redirectAfter}?gmail_error=invalid_state`);
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const callbackUrl  = `${origin}/api/auth/google/callback`;

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
    return NextResponse.redirect(`${origin}${redirectAfter}?gmail_error=token_exchange_failed`);
  }

  let googleEmail: string | null = null;
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();
    googleEmail = info.email || null;
  } catch { /* non-fatal */ }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

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

  if (purpose === 'gmail') {
    if (!googleEmail) {
      return NextResponse.redirect(`${origin}${redirectAfter}?gmail_error=no_email`);
    }
    const { data: existingGmail } = await supabase
      .from('email_connections')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .maybeSingle();
    const gmailRefresh = incomingRefreshToken(tokens) ?? existingGmail?.refresh_token ?? null;

    const gmailRow = {
      user_id: userId,
      provider: 'gmail',
      email: googleEmail,
      from_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: gmailRefresh,
      expiry_date: expiresAt,
      updated_at: new Date().toISOString(),
    };
    let { error: upsertErr } = await supabase
      .from('email_connections')
      .upsert(gmailRow, { onConflict: 'user_id,provider' });

    if (upsertErr) {
      const fallback = await supabase.from('email_connections').upsert(
        {
          user_id: userId,
          provider: 'gmail',
          email_address: googleEmail,
          access_token: tokens.access_token,
          refresh_token: gmailRefresh,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );
      upsertErr = fallback.error;
    }

    if (upsertErr) {
      console.error('email_connections upsert error:', upsertErr);
      return NextResponse.redirect(`${origin}${redirectAfter}?gmail_error=db_error`);
    }

    return NextResponse.redirect(`${origin}${redirectAfter}?gmail_connected=1`);
  }

  const { data: existingSheets } = await supabase
    .from('google_connections')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();
  const sheetsRefresh = incomingRefreshToken(tokens) ?? existingSheets?.refresh_token ?? null;

  const { error: upsertErr } = await supabase
    .from('google_connections')
    .upsert(
      {
        user_id:       userId,
        google_email:  googleEmail,
        access_token:  tokens.access_token,
        refresh_token: sheetsRefresh,
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
