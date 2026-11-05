/**
 * GET /api/dialer/call-status?id=<dialer_calls.id>
 * Lightweight poll for hunt mode (AMD / answered / ended).
 */
import { NextResponse } from 'next/server';
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

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('dialer_calls')
      .select('id, status, answering_machine, answered_at, started_at, raw_twilio_status, disposition')
      .eq('id', id)
      .eq('agent_id', user.id)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    const raw = data.raw_twilio_status as { AnsweredBy?: string } | null;
    return NextResponse.json({
      id: data.id,
      status: data.status,
      answering_machine: data.answering_machine,
      answered_at: data.answered_at,
      started_at: data.started_at,
      answered_by: raw?.AnsweredBy ?? null,
      disposition: data.disposition,
    });
  } catch (err) {
    console.error('[dialer/call-status GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
