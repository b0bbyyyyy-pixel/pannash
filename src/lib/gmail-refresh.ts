import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Refresh Gmail OAuth token and save to database
 */
export async function refreshGmailToken(
  userId: string,
  refreshToken: string,
  supabase: SupabaseClient,
  opts?: { table?: 'email_connections' | 'email_read_connections' },
): Promise<{ access_token: string; expiry_date: number } | null> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
    );

    // Set only the refresh token
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Get new access token
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token || !credentials.expiry_date) {
      console.error('Failed to refresh token: no access token returned');
      return null;
    }

    const table = opts?.table ?? 'email_connections';
    const expiry = new Date(credentials.expiry_date).toISOString();
    const patch = {
      access_token: credentials.access_token,
      expiry_date: expiry,
      expires_at: expiry,
      updated_at: new Date().toISOString(),
    };
    let query = supabase.from(table).update(patch).eq('user_id', userId);
    if (table === 'email_connections') query = query.eq('provider', 'gmail');
    const { error } = await query;

    if (error) {
      const slim = {
        access_token: credentials.access_token,
        expiry_date: expiry,
        updated_at: new Date().toISOString(),
      };
      let retry = supabase.from(table).update(slim).eq('user_id', userId);
      if (table === 'email_connections') retry = retry.eq('provider', 'gmail');
      const again = await retry;
      if (again.error) {
        console.error('Failed to save refreshed token:', again.error);
        return null;
      }
    }

    console.log(`✓ Refreshed Gmail token for user ${userId}`);

    return {
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
    };
  } catch (err: any) {
    console.error('Token refresh error:', err);
    return null;
  }
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return true;
  
  const expiry = new Date(expiryDate).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  return expiry - now < fiveMinutes;
}
