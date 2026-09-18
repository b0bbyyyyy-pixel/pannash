/**
 * POST /api/webhooks/twilio/voice-app
 *
 * Voice URL of the TwiML App (browser dialer) AND the inbound Voice webhook
 * for the Twilio number.
 *
 * OUTGOING (browser → PSTN): From = "client:agent"
 *   Destination is the custom `phone` param (NOT Twilio's `To`, which is client:agent).
 *   → <Dial callerId=YOUR_NUMBER><Number>+1…</Number></Dial>
 *
 * INBOUND (PSTN → your number): From = caller's number
 *   → <Dial><Client>agent</Client></Dial>
 */
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import {
  serviceClient,
  validateTwilioSignatureUrls,
  formDataToParams,
  publicAppUrl,
} from '@/lib/telephony/twilio';

function twimlResponse(xml: string, status = 200) {
  return new NextResponse(xml, { status, headers: { 'Content-Type': 'text/xml' } });
}

function hangupTwiml(message?: string) {
  const vr = new twilio.twiml.VoiceResponse();
  if (message) vr.say({ voice: 'Polly.Joanna' }, message);
  vr.hangup();
  return vr.toString();
}

function isE164(v: string | undefined | null): v is string {
  return !!v && /^\+[1-9]\d{6,14}$/.test(v.trim());
}

function destNumber(params: Record<string, string>): string | null {
  for (const key of ['phone', 'Phone', 'To', 'Called', 'tophone']) {
    const v = params[key]?.trim();
    if (isE164(v)) return v;
  }
  return null;
}

/** Candidate URLs Twilio may have signed (ngrok / Vercel / PUBLIC_APP_URL). */
function signedUrlCandidates(req: NextRequest): string[] {
  const path = '/api/webhooks/twilio/voice-app';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  return [
    `${publicAppUrl()}${path}`,
    req.url,
    host ? `${proto}://${host}${path}` : '',
  ].filter(Boolean);
}

/** Single-user lookup: the sole Twilio connection row (or env fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSoleUser(supabase: any): Promise<{
  userId: string | null;
  authToken: string | null;
  fromNumber: string | null;
}> {
  const { data } = await supabase
    .from('phone_connections')
    .select('user_id, auth_token, phone_number')
    .eq('provider', 'twilio')
    .limit(1)
    .maybeSingle();

  if (data?.auth_token) {
    return { userId: data.user_id, authToken: data.auth_token, fromNumber: data.phone_number };
  }
  return {
    userId: null,
    authToken: process.env.TWILIO_AUTH_TOKEN ?? null,
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? null,
  };
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'Twilio should POST here. TwiML App Voice URL must be this path.' });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = serviceClient();
    const { userId, authToken, fromNumber } = await getSoleUser(supabase);
    if (!authToken) {
      console.error('[twilio/voice-app] No Twilio auth token (phone_connections or TWILIO_AUTH_TOKEN)');
      return twimlResponse(hangupTwiml('Phone is not configured.'), 500);
    }

    const fd = await req.formData();
    const params = formDataToParams(fd);
    const signature = req.headers.get('x-twilio-signature');
    const urls = signedUrlCandidates(req);

    if (!validateTwilioSignatureUrls(authToken, signature, urls, params)) {
      console.warn('[twilio/voice-app] Invalid signature. Tried:', urls, 'From:', params.From, 'To:', params.To, 'phone:', params.phone);
      // Do not Hangup-on-fail with empty TwiML only — 31005. Still reject, but log enough to fix URL mismatch.
      return twimlResponse(hangupTwiml('Could not verify this call.'), 403);
    }

    const from = params.From ?? '';
    const callSid = params.CallSid ?? null;
    const base = publicAppUrl();
    const vr = new twilio.twiml.VoiceResponse();
    const isOutgoing = from.startsWith('client:');
    const outboundTo = destNumber(params);

    console.log('[twilio/voice-app]', { isOutgoing, from, To: params.To, phone: params.phone, outboundTo, fromNumber });

    let dbId: string | null = null;
    if (userId) {
      const otherParty = isOutgoing ? (outboundTo ?? params.To ?? '') : from;
      const { data: lead } = await supabase
        .from('leads')
        .select('id, name')
        .eq('user_id', userId)
        .eq('phone_e164', otherParty)
        .limit(1)
        .maybeSingle();

      const { data: row } = await supabase
        .from('dialer_calls')
        .insert({
          lead_id: lead?.id ?? null,
          agent_id: userId,
          lead_name: lead?.name ?? otherParty,
          to_number: isOutgoing ? (outboundTo ?? params.To) : (fromNumber ?? params.To),
          from_number: isOutgoing ? (fromNumber ?? '') : from,
          direction: isOutgoing ? 'outbound' : 'inbound',
          status: 'in_progress',
          twilio_call_sid: callSid,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      dbId = row?.id ?? null;
    }

    const statusCb = dbId
      ? `${base}/api/webhooks/twilio/voice-app-status?dbId=${dbId}`
      : `${base}/api/webhooks/twilio/voice-app-status`;

    if (isOutgoing) {
      if (!outboundTo) {
        console.error('[twilio/voice-app] No E.164 destination. Params:', params);
        return twimlResponse(hangupTwiml('No number to dial.'), 400);
      }
      if (!fromNumber) {
        console.error('[twilio/voice-app] No caller ID (phone_connections.phone_number or TWILIO_FROM_NUMBER)');
        return twimlResponse(hangupTwiml('Caller I D is not set.'), 500);
      }
      const dial = vr.dial({
        callerId: fromNumber,
        answerOnBridge: true,
        timeout: 30,
      });
      dial.number(
        {
          statusCallback: statusCb,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['answered', 'completed'],
        },
        outboundTo
      );
    } else {
      const dial = vr.dial({ timeout: 25, action: statusCb, method: 'POST' });
      dial.client(
        {
          statusCallback: statusCb,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['answered', 'completed'],
        },
        'agent'
      );
    }

    return twimlResponse(vr.toString());
  } catch (err) {
    console.error('[twilio/voice-app]', err);
    return twimlResponse(hangupTwiml('An error occurred.'), 500);
  }
}
