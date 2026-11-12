import { publicAppUrl } from '@/lib/telephony/twilio';

export function normalizePortalDomain(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  const s = String(raw).trim();
  if (!s) return { ok: true, value: null };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, error: 'Enter a full https origin, with no trailing slash' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Portal domain must start with https://' };
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash || url.username || url.password) {
    return { ok: false, error: 'Enter the origin only, with no path' };
  }
  if (!url.hostname) {
    return { ok: false, error: 'Enter a full https origin, with no trailing slash' };
  }
  return { ok: true, value: url.origin };
}

export async function portalOriginForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('portal_domain')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error) {
      const parsed = normalizePortalDomain(data?.portal_domain);
      if (parsed.ok && parsed.value) return parsed.value;
    }
  } catch {
    /* column may not exist until SQL is run */
  }
  return publicAppUrl();
}
