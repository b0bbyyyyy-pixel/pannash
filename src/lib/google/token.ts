import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns a valid Google access token for the given user,
 * refreshing it automatically if it has expired.
 * Returns null if no Google connection exists.
 */
export async function getGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: conn } = await supabase
    .from('google_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (!conn) return null;

  // Token still valid (with 60-second buffer)
  if (new Date(conn.expires_at).getTime() - 60_000 > Date.now()) {
    return conn.access_token;
  }

  // Try to refresh
  if (!conn.refresh_token) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type:    'refresh_token',
    }),
  });

  const tokens = await res.json();
  if (!res.ok || !tokens.access_token) return null;

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Persist the new access token
  await supabase
    .from('google_connections')
    .update({
      access_token: tokens.access_token,
      expires_at:   expiresAt,
      updated_at:   new Date().toISOString(),
    })
    .eq('user_id', userId);

  return tokens.access_token;
}
