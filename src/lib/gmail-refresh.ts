import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Refresh Gmail OAuth token and save to database
 */
export async function refreshGmailToken(
  userId: string,
  refreshToken: string,
  supabase: SupabaseClient
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

    // Save new token to database (using provided supabase client with user's auth)
    const { error } = await supabase
      .from('email_connections')
      .update({
        access_token: credentials.access_token,
        expiry_date: new Date(credentials.expiry_date).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'gmail');

    if (error) {
      console.error('Failed to save refreshed token:', error);
      return null;
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
