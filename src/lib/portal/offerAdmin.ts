import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Service-role client for token-gated offer reads. Never use the anon key here. */
export function offerPortalAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfiguration');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
