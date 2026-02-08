import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // user ID
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(
      new URL('/dashboard?error=gmail_auth_failed', req.url)
    );
  }

  const userId = state;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const userEmail = data.email;

    if (!userEmail) {
      throw new Error('Could not get user email from Google');
    }

    // Store in Supabase
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

    const expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString();

    const { error: dbError } = await supabase.from('email_connections').upsert({
      user_id: userId,
      provider: 'gmail',
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || null,
      expiry_date: expiryDate,
      email: userEmail,
      updated_at: new Date().toISOString(),
    });

    if (dbError) {
      console.error('Supabase error:', dbError);
      return NextResponse.redirect(
        new URL('/dashboard?error=storage_failed', req.url)
      );
    }

    // Success
    return NextResponse.redirect(
      new URL('/dashboard?connected=gmail', req.url)
    );
  } catch (err: any) {
    console.error('Gmail OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/dashboard?error=gmail_auth_failed', req.url)
    );
  }
}
