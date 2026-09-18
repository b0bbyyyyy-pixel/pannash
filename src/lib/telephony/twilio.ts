/**
 * Twilio helpers for the voice dialer.
 *
 * Credentials live in the existing `phone_connections` table
 * (same place SMS uses them), with env-var fallback:
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
 *
 * Behavior settings (SIP URI, dry-run, recording…) live in
 * `telephony_settings` (one row per user).
 */
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

// ── Service-role client (webhooks have no user cookie) ────────────────────────
export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface TwilioCreds {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

/**
 * Look up Twilio credentials for a user.
 * DB first (phone_connections), env fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTwilioCreds(supabase: any, userId: string): Promise<TwilioCreds | null> {
  const { data } = await supabase
    .from('phone_connections')
    .select('account_sid, auth_token, phone_number')
    .eq('user_id', userId)
    .eq('provider', 'twilio')
    .limit(1)
    .maybeSingle();

  if (data?.account_sid && data?.auth_token && data?.phone_number) {
    return {
      accountSid: data.account_sid,
      authToken: data.auth_token,
      fromNumber: data.phone_number,
    };
  }

  // Env fallback
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    };
  }

  return null;
}

export interface TelephonySettings {
  user_id: string;
  sip_uri: string | null;
  wrap_seconds: number;
  record_calls: boolean;
  dry_run: boolean;
  calling_window_start: string;
  calling_window_end: string;
  max_attempts_per_day: number;
  compliance_ack: boolean;
}

export const DEFAULT_SETTINGS: Omit<TelephonySettings, 'user_id'> = {
  sip_uri: null,
  wrap_seconds: 2,
  record_calls: false,
  dry_run: true,
  calling_window_start: '09:00',
  calling_window_end: '20:00',
  max_attempts_per_day: 3,
  compliance_ack: false,
};

/** Fetch telephony settings for a user, applying defaults if no row exists. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTelephonySettings(supabase: any, userId: string): Promise<TelephonySettings> {
  const { data } = await supabase
    .from('telephony_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (data) return data as TelephonySettings;
  return { user_id: userId, ...DEFAULT_SETTINGS };
}

/** The base URL Twilio uses to reach our webhooks (must be publicly reachable). */
export function publicAppUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/**
 * Validate an incoming Twilio webhook using the official signature check.
 * - `url` must be the EXACT URL Twilio requested (including query string).
 * - `params` is the POST body as a flat object.
 * Returns true if valid. Set TWILIO_VALIDATE_WEBHOOKS=false to skip in local dev.
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  if (process.env.TWILIO_VALIDATE_WEBHOOKS === 'false') return true;
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

/** Try several URL shapes — Twilio signs the exact URL it requested (proto/host/path). */
export function validateTwilioSignatureUrls(
  authToken: string,
  signature: string | null,
  urls: string[],
  params: Record<string, string>
): boolean {
  if (process.env.TWILIO_VALIDATE_WEBHOOKS === 'false') return true;
  if (!signature) return false;
  const seen = new Set<string>();
  for (const url of urls) {
    const u = url.replace(/\/$/, '');
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (twilio.validateRequest(authToken, signature, u, params)) return true;
    if (twilio.validateRequest(authToken, signature, u + '/', params)) return true;
  }
  return false;
}

/** Turn a Next.js request formData into the flat object Twilio signature check needs. */
export function formDataToParams(fd: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  fd.forEach((v, k) => { params[k] = String(v); });
  return params;
}
