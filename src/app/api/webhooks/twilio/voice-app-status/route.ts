/**
 * POST /api/webhooks/twilio/voice-app-status?dbId=<dialer_calls.id>
 *
 * Status callback for browser-dialer call legs (voice-app webhook).
 * Updates the dialer_calls row: status, answered_at, duration, ended_at.
 * On a completed outbound call with a matched lead, stamps
 * call_made_at / last_called_at so campaign progress and Last Activity update.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/telephony/twilio';

const ok = () => new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } });

export async function POST(req: NextRequest) {
  try {
    const dbId = req.nextUrl.searchParams.get('dbId');
    if (!dbId) return ok();

    const fd = await req.formData();
    const params: Record<string, string> = {};
    fd.forEach((v, k) => { params[k] = String(v); });

    // CallStatus for status callbacks; DialCallStatus when used as a <Dial> action
    const callStatus = params.DialCallStatus || params.CallStatus || '';
    const duration   = params.CallDuration ? parseInt(params.CallDuration, 10) : null;

    const supabase = serviceClient();

    const update: Record<string, unknown> = {};
    if (callStatus === 'in-progress' || callStatus === 'answered') {
      update.status = 'in_progress';
      update.answered_at = new Date().toISOString();
    } else if (['completed', 'no-answer', 'busy', 'failed', 'canceled'].includes(callStatus)) {
      update.status = callStatus.replace('-', '_');
      update.ended_at = new Date().toISOString();
      if (duration != null) update.duration_seconds = duration;
    }
    if (Object.keys(update).length === 0) return ok();

    const { data: row } = await supabase
      .from('dialer_calls')
      .update(update)
      .eq('id', dbId)
      .select('lead_id, direction, agent_id')
      .single();

    // Stamp the lead on completed outbound calls
    if (row?.lead_id && row.direction === 'outbound' && update.ended_at) {
      const now = new Date().toISOString();
      await supabase
        .from('leads')
        .update({ call_made_at: now, last_called_at: now })
        .eq('id', row.lead_id)
        .eq('user_id', row.agent_id);
    }

    return ok();
  } catch (err) {
    console.error('[twilio/voice-app-status]', err);
    return ok(); // never make Twilio retry-loop
  }
}
