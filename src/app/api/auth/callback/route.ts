import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateStr = searchParams.get('state');

  if (!code || !stateStr) {
    return NextResponse.redirect(
      new URL('/dashboard?error=oauth_failed', req.url)
    );
  }

  let state: { provider: string; userId: string };
  try {
    state = JSON.parse(stateStr);
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard?error=invalid_state', req.url)
    );
  }

  const { provider, userId } = state;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/auth/callback`;

  try {
    let tokenResponse: any;
    let userEmail: string;

    if (provider === 'gmail') {
      // Exchange code for Google tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      tokenResponse = await tokenRes.json();

      // Get user email from Google
      const userInfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        }
      );
      const userInfo = await userInfoRes.json();
      userEmail = userInfo.email;
    } else if (provider === 'outlook') {
      // Exchange code for Microsoft tokens
      const tokenRes = await fetch(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.MICROSOFT_CLIENT_ID!,
            client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        }
      );

      tokenResponse = await tokenRes.json();

      // Get user email from Microsoft Graph
      const userInfoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      const userInfo = await userInfoRes.json();
      userEmail = userInfo.userPrincipalName || userInfo.mail;
    } else {
      throw new Error('Invalid provider');
    }

    // Store tokens in Supabase
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

    // Upsert the email connection
    const { error } = await supabase.from('email_connections').upsert({
      user_id: userId,
      provider,
      email_address: userEmail,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || null,
      expires_at: new Date(
        Date.now() + (tokenResponse.expires_in || 3600) * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.redirect(
        new URL('/dashboard?error=storage_failed', req.url)
      );
    }

    // Success - redirect to dashboard
    return NextResponse.redirect(
      new URL(`/dashboard?connected=${provider}`, req.url)
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/dashboard?error=oauth_failed', req.url)
    );
  }
}
