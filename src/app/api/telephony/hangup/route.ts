/**
 * POST /api/telephony/hangup  { callId }
 *
 * Ends a live call from the CRM. Hanging up the AGENT leg tears down
 * the lead leg too (they're bridged by <Dial>).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { makeProvider } from '@/lib/telephony/provider';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { callId } = await req.json();
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 });

    const { data: call } = await supabase
      .from('dialer_calls')
      .select('id, twilio_call_sid, status')
      .eq('id', callId)
      .eq('agent_id', user.id)
      .single();

    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    // Dry-run rows have no Twilio SID — just close them out locally
    if (!call.twilio_call_sid) {
      await supabase
        .from('dialer_calls')
        .update({ status: 'canceled', ended_at: new Date().toISOString() })
        .eq('id', callId);
      return NextResponse.json({ success: true, dryRun: true });
    }

    const creds = await getTwilioCreds(supabase, user.id);
    if (!creds) return NextResponse.json({ error: 'No Twilio connection' }, { status: 400 });

    try {
      await makeProvider(creds).hangup(call.twilio_call_sid);
    } catch (e) {
      // Call may already be done — that's fine, status webhook will settle it
      console.warn('[telephony/hangup] Twilio hangup warning:', e);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[telephony/hangup POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
