/**
 * GET /api/telephony/calls?leadId=<id>&limit=20
 *
 * Call history for one lead (or the caller's most recent calls if no leadId).
 * Powers the call timeline on the contact record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20', 10), 100);

    let query = supabase
      .from('dialer_calls')
      .select('id, lead_id, lead_name, to_number, from_number, status, disposition, notes, started_at, answered_at, ended_at, duration_seconds, recording_url')
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

    return NextResponse.json({ calls: data ?? [] });
  } catch (err) {
    console.error('[telephony/calls GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
