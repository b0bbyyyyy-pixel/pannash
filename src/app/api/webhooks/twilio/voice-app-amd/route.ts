/**
 * POST /api/webhooks/twilio/voice-app-amd?dbId=<dialer_calls.id>
 *
 * Twilio Answering Machine Detection callback for hunt-mode outbound calls.
 * Human → stamp answering_machine=false (browser beeps; audio is already live).
 * Machine/fax → stamp answering_machine=true and hang up this one call
 * so hunt can dial the next number (still one at a time).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  serviceClient,
  getTwilioCreds,
  validateTwilioSignatureUrls,
  formDataToParams,
  publicAppUrl,
} from '@/lib/telephony/twilio';
import { makeProvider } from '@/lib/telephony/provider';
import { isMachineAnsweredBy, isHumanAnsweredBy } from '@/lib/dialer/hunt';

const ok = () => new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } });

function signedUrlCandidates(req: NextRequest, dbId: string): string[] {
  const path = `/api/webhooks/twilio/voice-app-amd?dbId=${dbId}`;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  return [
    `${publicAppUrl()}${path}`,
    req.url,
    host ? `${proto}://${host}${path}` : '',
  ].filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const dbId = req.nextUrl.searchParams.get('dbId');
    if (!dbId) return ok();

    const fd = await req.formData();
    const params = formDataToParams(fd);
    const supabase = serviceClient();

    const { data: call } = await supabase
      .from('dialer_calls')
      .select('id, agent_id, twilio_call_sid')
      .eq('id', dbId)
      .maybeSingle();
    if (!call?.agent_id) return ok();

    const creds = await getTwilioCreds(supabase, call.agent_id);
    if (!creds) return ok();

    const signature = req.headers.get('x-twilio-signature');
    const urls = signedUrlCandidates(req, dbId);
    if (!validateTwilioSignatureUrls(creds.authToken, signature, urls, params)) {
      console.warn('[twilio/voice-app-amd] Invalid signature');
      return ok();
    }

    const answeredBy = params.AnsweredBy || params.answeredBy || '';
    const machine = isMachineAnsweredBy(answeredBy);
    const human = isHumanAnsweredBy(answeredBy);

    const patch: Record<string, unknown> = {
      answering_machine: machine ? true : human ? false : null,
      lead_call_sid: params.CallSid || null,
      raw_twilio_status: {
        AnsweredBy: answeredBy,
        MachineDetectionDuration: params.MachineDetectionDuration || null,
      },
    };
    if (human) patch.answered_at = new Date().toISOString();

    await supabase
      .from('dialer_calls')
      .update(patch)
      .eq('id', dbId);

    if (machine) {
      const sid = params.CallSid || call.twilio_call_sid;
      if (sid) {
        try {
          await makeProvider(creds).hangup(sid);
        } catch (e) {
          console.warn('[twilio/voice-app-amd] hangup', e);
        }
      }
    }

    return ok();
  } catch (err) {
    console.error('[twilio/voice-app-amd]', err);
    return ok();
  }
}
