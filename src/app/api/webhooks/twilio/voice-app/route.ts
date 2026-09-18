/**
 * POST /api/webhooks/twilio/voice-app
 *
 * Voice URL of the TwiML App (browser dialer) AND the inbound Voice webhook
 * for the Twilio number. One endpoint, two directions:
 *
 *  OUTGOING (browser → PSTN): From = "client:agent", To = "+1…"
 *    → <Dial callerId=YOUR_NUMBER><Number>To</Number></Dial>
 *
 *  INBOUND (PSTN → your number): From = caller's number
 *    → <Dial><Client>agent</Client></Dial>  (rings the browser)
 *
 * Both directions log a dialer_calls row and match the lead by phone_e164.
 * Single-user CRM: creds/user come from the sole phone_connections row
 * (env fallback for creds).
 */
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import {
  serviceClient,
  validateTwilioSignature,
  formDataToParams,
  publicAppUrl,
} from '@/lib/telephony/twilio';

function twimlResponse(xml: string, status = 200) {
  return new NextResponse(xml, { status, headers: { 'Content-Type': 'text/xml' } });
}

function hangupTwiml() {
  const vr = new twilio.twiml.VoiceResponse();
  vr.hangup();
  return vr.toString();
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

export async function POST(req: NextRequest) {
  try {
    const supabase = serviceClient();
    const { userId, authToken, fromNumber } = await getSoleUser(supabase);
    if (!authToken) return twimlResponse(hangupTwiml(), 500);

    // ── Validate signature ────────────────────────────────────────────────────
    const fd = await req.formData();
    const params = formDataToParams(fd);
    const fullUrl = `${publicAppUrl()}/api/webhooks/twilio/voice-app`;
    const signature = req.headers.get('x-twilio-signature');
    if (!validateTwilioSignature(authToken, signature, fullUrl, params)) {
      console.warn('[twilio/voice-app] Invalid signature — rejecting');
      return twimlResponse(hangupTwiml(), 403);
    }

    const from    = params.From ?? '';
    const to      = params.To ?? '';
    const callSid = params.CallSid ?? null;
    const base    = publicAppUrl();
    const vr      = new twilio.twiml.VoiceResponse();

    const isOutgoing = from.startsWith('client:');

    // ── Log the call + match the lead by phone ───────────────────────────────
    let dbId: string | null = null;
    if (userId) {
      const otherParty = isOutgoing ? to : from;
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
          to_number: isOutgoing ? to : (fromNumber ?? to),
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
      // Browser dialing out — bridge to the PSTN number with our caller ID
      if (!to) return twimlResponse(hangupTwiml(), 400);
      const dial = vr.dial({
        callerId: fromNumber ?? undefined,
        answerOnBridge: true,
        timeout: 30,
      });
      dial.number(
        {
          statusCallback: statusCb,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['answered', 'completed'],
        },
        to
      );
    } else {
      // Inbound call — ring the browser client
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
    return twimlResponse(hangupTwiml(), 500);
  }
}
