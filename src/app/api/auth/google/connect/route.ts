import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * GET /api/auth/google/connect?redirect=/leads
 * Redirects the user to Google's OAuth consent screen.
 */
export async function GET(request: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID is not set. See setup instructions.' },
      { status: 500 }
    );
  }

  // Where to send the user after Google OAuth
  const redirectAfter = request.nextUrl.searchParams.get('redirect') || '/leads';

  // Build the callback URL (must match what you register in Google Cloud Console)
  const origin = request.nextUrl.origin;
  const callbackUrl = `${origin}/api/auth/google/callback`;

  // Encode state so callback knows where to redirect and which Supabase user
  const state = Buffer.from(JSON.stringify({ redirectAfter, userId: user.id })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',   // get refresh_token
    prompt: 'consent',        // always show consent so we always get refresh_token
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
