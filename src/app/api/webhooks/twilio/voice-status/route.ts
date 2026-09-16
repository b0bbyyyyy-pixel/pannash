/**
 * POST /api/webhooks/twilio/voice-status?callId=<id>&leg=<agent|lead|dial-action>
 *
 * Twilio status callbacks for the voice dialer. Three sources hit this URL:
 *
 *   leg=agent        — lifecycle of the call TO THE DESK PHONE
 *                      (initiated / ringing / answered / completed)
 *   leg=lead         — lifecycle of the call TO THE LEAD
 *   leg=dial-action  — <Dial> action callback after the lead leg finishes
 *                      (carries DialCallStatus + DialCallDuration)
 *
 * Signature-validated. Unsigned requests are rejected with 403.
 * Always answers 200 with empty TwiML afterward so Twilio doesn't retry.
 */
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import {
  serviceClient,
  getTwilioCreds,
  validateTwilioSignature,
  formDataToParams,
  publicAppUrl,
} from '@/lib/telephony/twilio';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function ok() {
  return new NextResponse(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } });
}

export async function POST(req: NextRequest) {
  try {
    const callId = req.nextUrl.searchParams.get('callId');
    const leg = req.nextUrl.searchParams.get('leg') || 'agent';
    if (!callId) return ok();

    const supabase = serviceClient();

    const { data: call } = await supabase
      .from('dialer_calls')
      .select('id, agent_id, status, answered_at, raw_twilio_status')
      .eq('id', callId)
      .single();

    if (!call) return ok();

    const creds = await getTwilioCreds(supabase, call.agent_id);
    if (!creds) return ok();

    // ── Signature check ──────────────────────────────────────────────────────
    const fd = await req.formData();
    const params = formDataToParams(fd);
    const fullUrl = `${publicAppUrl()}/api/webhooks/twilio/voice-status?callId=${callId}&leg=${leg}`;
    const signature = req.headers.get('x-twilio-signature');

    if (!validateTwilioSignature(creds.authToken, signature, fullUrl, params)) {
      console.warn('[twilio/voice-status] Invalid signature — rejecting');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const callStatus = params.CallStatus || '';           // agent/lead leg events
    const dialStatus = params.DialCallStatus || '';       // dial-action only
    const now = new Date().toISOString();

    // Keep a rolling log of raw statuses for debugging
    const rawLog = Array.isArray(call.raw_twilio_status) ? call.raw_twilio_status : [];
    rawLog.push({ leg, at: now, ...params });

    const update: Record<string, unknown> = { raw_twilio_status: rawLog };

    if (leg === 'agent') {
      // Desk phone lifecycle
      if (callStatus === 'ringing' || callStatus === 'initiated') {
        if (call.status === 'created' || call.status === 'ringing_agent') {
          update.status = 'ringing_agent';
        }
      } else if (callStatus === 'completed') {
        // Agent leg ended. If the lead never answered and no terminal status
        // was set by the dial-action, the desk phone was hung up / unanswered.
        if (['created', 'ringing_agent'].includes(call.status)) {
          update.status = 'agent_no_answer';   // desk phone never picked up
          update.ended_at = now;
        } else if (!['completed', 'no_answer', 'busy', 'failed', 'canceled'].includes(call.status)) {
          update.status = 'completed';
          update.ended_at = now;
          if (params.CallDuration) update.duration_seconds = parseInt(params.CallDuration, 10);
        }
      } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
        update.status = 'agent_no_answer';
        update.ended_at = now;
      }
    } else if (leg === 'lead') {
      // Lead leg lifecycle
      if (params.CallSid) update.lead_call_sid = params.CallSid;
      if (callStatus === 'in-progress' || callStatus === 'answered') {
        update.status = 'in_progress';
        if (!call.answered_at) update.answered_at = now;
      }
      // Terminal statuses for the lead leg are handled by dial-action below,
      // which has the authoritative DialCallStatus + duration.
    } else if (leg === 'dial-action') {
      // <Dial> finished — DialCallStatus is authoritative for the lead leg
      const map: Record<string, string> = {
        'completed': 'completed',
        'answered': 'completed',
        'no-answer': 'no_answer',
        'busy': 'busy',
        'failed': 'failed',
        'canceled': 'canceled',
      };
      update.status = map[dialStatus] || 'completed';
      update.ended_at = now;
      if (params.DialCallDuration) {
        update.duration_seconds = parseInt(params.DialCallDuration, 10);
      }
      // Answer TwiML: hang up the agent leg — call is over
      await supabase.from('dialer_calls').update(update).eq('id', callId);
      const vr = new twilio.twiml.VoiceResponse();
      vr.hangup();
      return new NextResponse(vr.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }

    await supabase.from('dialer_calls').update(update).eq('id', callId);
    return ok();
  } catch (err) {
    console.error('[twilio/voice-status]', err);
    return ok();
  }
}
