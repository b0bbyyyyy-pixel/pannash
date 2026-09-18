/**
 * GET /api/telephony/token
 *
 * Issues a Twilio Voice access token for the browser (Twilio Voice JS SDK).
 * Single-agent CRM: identity is always "agent".
 *
 * Required env vars:
 *   TWILIO_API_KEY_SID     — API key SID   (SKxxxx…)
 *   TWILIO_API_KEY_SECRET  — API key secret
 *   TWILIO_TWIML_APP_SID   — TwiML App SID (APxxxx…) whose Voice URL points
 *                            at /api/webhooks/twilio/voice-app
 *
 * Account SID comes from phone_connections (or TWILIO_ACCOUNT_SID fallback).
 */
import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';

export const dynamic = 'force-dynamic';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKeySid    = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const twimlAppSid  = process.env.TWILIO_TWIML_APP_SID;

    if (!apiKeySid || !apiKeySecret || !twimlAppSid) {
      return NextResponse.json(
        { error: 'Missing TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_TWIML_APP_SID env vars' },
        { status: 500 }
      );
    }

    const creds = await getTwilioCreds(supabase, user.id);
    if (!creds) {
      return NextResponse.json({ error: 'No Twilio connection. Connect Twilio in Settings → Phone.' }, { status: 400 });
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant  = AccessToken.VoiceGrant;

    const token = new AccessToken(creds.accountSid, apiKeySid, apiKeySecret, {
      identity: 'agent',
      ttl: 3600, // 1 hour; the SDK fires tokenWillExpire so the client refreshes
    });

    token.addGrant(new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    }));

    return NextResponse.json({ token: token.toJwt(), identity: 'agent' });
  } catch (err) {
    console.error('[telephony/token GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
