/**
 * POST /api/webhooks/twilio/voice?callId=<dialer_calls.id>
 *
 * Twilio fetches this when the OWNER'S DESK PHONE ANSWERS the agent leg.
 * We answer with TwiML that immediately dials the lead:
 *
 *   <Response>
 *     <Dial callerId="+1OWNER" record="..." timeout="25" action="...">
 *       <Number statusCallback="...">+1LEAD</Number>
 *     </Dial>
 *   </Response>
 *
 * No <Say> — the owner hears the lead's line ringing right away.
 * Signature-validated. Unsigned requests are rejected.
 */
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import {
  serviceClient,
  getTwilioCreds,
  getTelephonySettings,
  validateTwilioSignature,
  formDataToParams,
  publicAppUrl,
} from '@/lib/telephony/twilio';

function twimlResponse(xml: string, status = 200) {
  return new NextResponse(xml, { status, headers: { 'Content-Type': 'text/xml' } });
}

/** TwiML that just hangs up (used on errors so Twilio doesn't retry forever) */
function hangupTwiml() {
  const vr = new twilio.twiml.VoiceResponse();
  vr.hangup();
  return vr.toString();
}

export async function POST(req: NextRequest) {
  try {
    const callId = req.nextUrl.searchParams.get('callId');
    if (!callId) return twimlResponse(hangupTwiml(), 400);

    const supabase = serviceClient();

    // Look up our call row → owner → creds/settings
    const { data: call } = await supabase
      .from('dialer_calls')
      .select('id, agent_id, to_number, from_number, status')
      .eq('id', callId)
      .single();

    if (!call) return twimlResponse(hangupTwiml(), 404);

    const creds = await getTwilioCreds(supabase, call.agent_id);
    if (!creds) return twimlResponse(hangupTwiml(), 500);

    // ── Validate the Twilio signature ────────────────────────────────────────
    const fd = await req.formData();
    const params = formDataToParams(fd);
    const fullUrl = `${publicAppUrl()}/api/webhooks/twilio/voice?callId=${callId}`;
    const signature = req.headers.get('x-twilio-signature');

    if (!validateTwilioSignature(creds.authToken, signature, fullUrl, params)) {
      console.warn('[twilio/voice] Invalid signature — rejecting');
      return twimlResponse(hangupTwiml(), 403);
    }

    // Agent picked up — record it, then dial the lead
    await supabase
      .from('dialer_calls')
      .update({ status: 'agent_answered' })
      .eq('id', callId);

    const settings = await getTelephonySettings(supabase, call.agent_id);
    const base = publicAppUrl();

    const vr = new twilio.twiml.VoiceResponse();
    const dial = vr.dial({
      callerId: call.from_number || creds.fromNumber,
      timeout: 25,
      // After the lead leg ends, Twilio POSTs DialCallStatus here
      action: `${base}/api/webhooks/twilio/voice-status?callId=${callId}&leg=dial-action`,
      method: 'POST',
      // Record both sides from the moment the lead answers (if enabled)
      ...(settings.record_calls
        ? {
            record: 'record-from-answer-dual' as const,
            recordingStatusCallback: `${base}/api/webhooks/twilio/recording?callId=${callId}`,
            recordingStatusCallbackMethod: 'POST' as const,
          }
        : {}),
    });

    dial.number(
      {
        // Per-leg status events for the LEAD leg
        statusCallback: `${base}/api/webhooks/twilio/voice-status?callId=${callId}&leg=lead`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      },
      call.to_number
    );

    return twimlResponse(vr.toString());
  } catch (err) {
    console.error('[twilio/voice]', err);
    return twimlResponse(hangupTwiml(), 500);
  }
}
