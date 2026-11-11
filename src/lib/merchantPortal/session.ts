import { cookies } from 'next/headers';
import { merchantAdmin } from '@/lib/merchantPortal/admin';
import {
  loadPortalById,
  MP_SESSION_COOKIE,
  readPortalSession,
  type MerchantPortalRow,
} from '@/lib/merchantPortal/tokens';

export async function merchantFromCookie(): Promise<MerchantPortalRow | null> {
  const store = await cookies();
  const parsed = readPortalSession(store.get(MP_SESSION_COOKIE)?.value);
  if (!parsed) return null;
  return loadPortalById(parsed.portalId);
}

export async function requireMerchantSession() {
  const portal = await merchantFromCookie();
  if (!portal) return null;
  const supabase = merchantAdmin();
  const { data: lead } = await supabase
    .from('leads')
    .select('id, user_id, name, email, phone, company, lead_status, created_at, underwriting_data')
    .eq('id', portal.lead_id)
    .eq('user_id', portal.user_id)
    .maybeSingle();
  if (!lead) return null;
  return { portal, lead, supabase };
}
