/**
 * POST /api/webhooks/twilio/recording?callId=<id>
 *
 * Twilio posts here when a call recording is ready.
 * We save ONLY the recording URL on the call row — no audio blobs in our DB.
 * Playback uses the Twilio-hosted mp3: <RecordingUrl>.mp3
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  serviceClient,
  getTwilioCreds,
  validateTwilioSignature,
  formDataToParams,
  publicAppUrl,
} from '@/lib/telephony/twilio';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: NextRequest) {
  try {
    const callId = req.nextUrl.searchParams.get('callId');
    if (!callId) return new NextResponse(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } });

    const supabase = serviceClient();

    const { data: call } = await supabase
      .from('dialer_calls')
      .select('id, agent_id')
      .eq('id', callId)
      .single();

    if (call) {
      const creds = await getTwilioCreds(supabase, call.agent_id);
      const fd = await req.formData();
      const params = formDataToParams(fd);

      if (creds) {
        const fullUrl = `${publicAppUrl()}/api/webhooks/twilio/recording?callId=${callId}`;
        const signature = req.headers.get('x-twilio-signature');
        if (!validateTwilioSignature(creds.authToken, signature, fullUrl, params)) {
          console.warn('[twilio/recording] Invalid signature — rejecting');
          return new NextResponse('Forbidden', { status: 403 });
        }
      }

      if (params.RecordingUrl) {
        await supabase
          .from('dialer_calls')
          .update({ recording_url: `${params.RecordingUrl}.mp3` })
          .eq('id', callId);
      }
    }

    return new NextResponse(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } });
  } catch (err) {
    console.error('[twilio/recording]', err);
    return new NextResponse(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } });
  }
}
