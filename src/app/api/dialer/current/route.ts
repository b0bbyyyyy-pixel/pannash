import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCurrentLead, peekQueue } from '@/lib/dialer/queue';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

/**
 * GET /api/dialer/current
 * Returns:
 *   - current: locked lead (or null)
 *   - activeCall: most recent open call for this lead (or null)
 *   - queue: next 10 eligible leads (preview)
 *   - todayCalls: calls made today
 */
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const current = await getCurrentLead(supabase, user.id);

    // Active (no-disposition) call for this lead
    let activeCall = null;
    if (current) {
      const { data } = await supabase
        .from('dialer_calls')
        .select('id, lead_id, to_number, started_at')
        .eq('lead_id', current.id)
        .eq('agent_id', user.id)
        .is('disposition', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      activeCall = data;
    }

    // Peek queue (excludes current lead)
    const queue = await peekQueue(supabase, user.id, current?.id ?? null, 10);

    // Today's calls
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayCalls } = await supabase
      .from('dialer_calls')
      .select('id, lead_id, lead_name, to_number, started_at, disposition, notes, callback_at')
      .eq('agent_id', user.id)
      .gte('started_at', todayStart.toISOString())
      .order('started_at', { ascending: false });

    return NextResponse.json({
      current,
      activeCall,
      queue: queue ?? [],
      todayCalls: todayCalls ?? [],
    });
  } catch (err) {
    console.error('[dialer/current GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
