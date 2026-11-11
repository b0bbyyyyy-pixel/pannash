import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { publicAppUrl } from '@/lib/telephony/twilio';
import { merchantAdmin } from '@/lib/merchantPortal/admin';

export const MP_SESSION_COOKIE = 'mp_session';
export const MP_SESSION_DAYS = 14;
const HOUR_MS = 60 * 60 * 1000;

export type MerchantPortalRow = {
  id: string;
  user_id: string;
  lead_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  last_link_sent_at: string | null;
  link_sends_last_hour: number | null;
};

export function hashToken(raw: string) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function newRawToken() {
  return randomBytes(32).toString('base64url');
}

export function merchantPortalUrl(raw: string) {
  return `${publicAppUrl()}/merchant/${raw}`;
}

export function merchantLoginUrl() {
  return `${publicAppUrl()}/merchant/login`;
}

function sessionSecret() {
  return String(process.env.PORTAL_SESSION_SECRET || '').trim();
}

function signPayload(payload: string) {
  const secret = sessionSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function equalHex(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signPortalSession(portalId: string, expMs = Date.now() + MP_SESSION_DAYS * 24 * 60 * 60 * 1000) {
  const secret = sessionSecret();
  if (!secret) return '';
  const payload = Buffer.from(JSON.stringify({ pid: portalId, exp: expMs }), 'utf8').toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

export function readPortalSession(cookie: string | undefined | null): { portalId: string } | null {
  if (!cookie || !sessionSecret()) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = signPayload(payload);
  if (!expected || !equalHex(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { pid?: string; exp?: number };
    if (!data?.pid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { portalId: data.pid };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const secure = !publicAppUrl().startsWith('http://localhost');
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MP_SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function createPortal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { userId: string; leadId: string },
): Promise<{ url: string; portalId: string; raw: string }> {
  const raw = newRawToken();
  const tokenHash = hashToken(raw);
  const now = new Date().toISOString();
  await supabase
    .from('merchant_portals')
    .update({ revoked_at: now })
    .eq('lead_id', args.leadId)
    .eq('user_id', args.userId)
    .is('revoked_at', null);

  const { data, error } = await supabase
    .from('merchant_portals')
    .insert({
      user_id: args.userId,
      lead_id: args.leadId,
      token_hash: tokenHash,
    })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('Could not create portal');
  return { url: merchantPortalUrl(raw), portalId: data.id, raw };
}

export async function verifyToken(raw: string): Promise<MerchantPortalRow | null> {
  const tokenHash = hashToken(String(raw || '').trim());
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  const supabase = merchantAdmin();
  const { data } = await supabase
    .from('merchant_portals')
    .select('id, user_id, lead_id, token_hash, created_at, expires_at, revoked_at, last_viewed_at, last_link_sent_at, link_sends_last_hour')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  const row = data as MerchantPortalRow | null;
  if (!row?.id || !equalHex(row.token_hash, tokenHash)) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', row.lead_id)
    .eq('user_id', row.user_id)
    .maybeSingle();
  if (!lead?.id) return null;
  return row;
}

export async function loadPortalById(portalId: string): Promise<MerchantPortalRow | null> {
  const supabase = merchantAdmin();
  const { data } = await supabase
    .from('merchant_portals')
    .select('id, user_id, lead_id, token_hash, created_at, expires_at, revoked_at, last_viewed_at, last_link_sent_at, link_sends_last_hour')
    .eq('id', portalId)
    .maybeSingle();
  const row = data as MerchantPortalRow | null;
  if (!row?.id) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export function sendsInCurrentHour(row: {
  last_link_sent_at?: string | null;
  link_sends_last_hour?: number | null;
}) {
  const last = row.last_link_sent_at ? new Date(row.last_link_sent_at).getTime() : 0;
  if (!last || Date.now() - last > HOUR_MS) return 0;
  return Number(row.link_sends_last_hour) || 0;
}

export async function markLinkSent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  portalId: string,
  prev: { last_link_sent_at?: string | null; link_sends_last_hour?: number | null },
) {
  const count = sendsInCurrentHour(prev) + 1;
  await supabase
    .from('merchant_portals')
    .update({
      last_link_sent_at: new Date().toISOString(),
      link_sends_last_hour: count,
    })
    .eq('id', portalId);
}
