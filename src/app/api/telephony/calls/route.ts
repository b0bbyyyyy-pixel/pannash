/**
 * GET /api/telephony/calls?leadId=<id>&limit=20
 *
 * Call history for one lead (or the caller's most recent calls if no leadId).
 * Powers the call timeline on the contact record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isMissedCall } from '@/lib/telephony/missed';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leadId = req.nextUrl.searchParams.get('leadId');
    const callId = req.nextUrl.searchParams.get('callId');
    const peekMissed = req.nextUrl.searchParams.get('peekMissed') === '1';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || (peekMissed ? '40' : '20'), 10), 100);

    let query = supabase
      .from('dialer_calls')
      .select('id, lead_id, lead_name, to_number, from_number, direction, status, disposition, notes, started_at, answered_at, ended_at, duration_seconds, recording_url')
      .eq('agent_id', user.id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (callId) query = query.eq('id', callId);
    else if (leadId) query = query.eq('lead_id', leadId);

    const { data, error } = await query;
    if (error) {
      console.error('[telephony/calls GET]', error);
      return NextResponse.json({ error: 'Failed to load calls' }, { status: 500 });
    }

    const calls = data ?? [];
    if (peekMissed) {
      const latest = calls.find(isMissedCall);
      return NextResponse.json({ latestMissedAt: latest?.started_at ?? null });
    }

    return NextResponse.json({ calls });
  } catch (err) {
    console.error('[telephony/calls GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/telephony/calls
 * Browser reports an inbound Client call so History is not empty when the
 * Twilio webhook insert is missing or the agent never answers.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as {
      callSid?: string;
      from?: string;
      to?: string;
      leadId?: string | null;
      leadName?: string | null;
      status?: string;
    };
    const callSid = String(body.callSid || '').trim();
    const from = String(body.from || '').trim();
    if (!callSid && !from) {
      return NextResponse.json({ error: 'Missing caller' }, { status: 400 });
    }

    const status = ['no_answer', 'canceled', 'in_progress', 'completed', 'ringing_agent'].includes(String(body.status || ''))
      ? String(body.status)
      : 'ringing_agent';
    const ended = status === 'no_answer' || status === 'canceled';

    const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    let existing: { id: string; answered_at: string | null } | null = null;
    if (callSid) {
      const bySid = await supabase
        .from('dialer_calls')
        .select('id, answered_at')
        .eq('agent_id', user.id)
        .eq('twilio_call_sid', callSid)
        .maybeSingle();
      existing = bySid.data;
    }
    if (!existing?.id && from) {
      const recent = await supabase
        .from('dialer_calls')
        .select('id, answered_at')
        .eq('agent_id', user.id)
        .eq('direction', 'inbound')
        .eq('from_number', from)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existing = recent.data;
    }
    if (existing?.id) {
      if (ended && !existing.answered_at) {
        await supabase
          .from('dialer_calls')
          .update({
            status,
            ended_at: new Date().toISOString(),
            direction: 'inbound',
          })
          .eq('id', existing.id)
          .eq('agent_id', user.id);
      } else if (!ended && body.leadId) {
        await supabase
          .from('dialer_calls')
          .update({
            lead_id: body.leadId,
            lead_name: body.leadName || undefined,
          })
          .eq('id', existing.id)
          .eq('agent_id', user.id);
      }
      return NextResponse.json({ id: existing.id, updated: true });
    }

    const { data: row, error } = await supabase
      .from('dialer_calls')
      .insert({
        agent_id: user.id,
        lead_id: body.leadId || null,
        lead_name: body.leadName || from || 'Unknown',
        to_number: body.to || '',
        from_number: from,
        direction: 'inbound',
        status,
        twilio_call_sid: callSid || null,
        started_at: new Date().toISOString(),
        ended_at: ended ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[telephony/calls POST]', error);
      return NextResponse.json({ error: 'Failed to save call' }, { status: 500 });
    }
    return NextResponse.json({ id: row?.id, created: true });
  } catch (err) {
    console.error('[telephony/calls POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
