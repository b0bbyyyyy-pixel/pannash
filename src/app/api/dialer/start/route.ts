import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { incrementAttempts, getCurrentLead } from '@/lib/dialer/queue';
import { isValidE164 } from '@/lib/dialer/e164';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

/**
 * POST /api/dialer/start
 * Body: { leadId: string }
 * - Verifies the agent holds the lock
 * - Creates a dialer_calls row (no disposition yet)
 * - Increments attempts_today
 * Returns: { callId }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    // Confirm this agent holds the lock
    const current = await getCurrentLead(supabase, user.id);
    if (!current || current.id !== leadId) {
      return NextResponse.json({ error: 'Lead not locked by this agent' }, { status: 409 });
    }

    if (!isValidE164(current.phone_e164)) {
      return NextResponse.json({ error: 'Invalid E.164 number' }, { status: 422 });
    }

    if (current.dnc) {
      return NextResponse.json({ error: 'Lead is on DNC list' }, { status: 422 });
    }

    // Insert call row (no disposition yet)
    const { data: callRow, error: callErr } = await supabase
      .from('dialer_calls')
      .insert({
        lead_id: current.id,
        agent_id: user.id,
        lead_name: current.name,
        to_number: current.phone_e164,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (callErr || !callRow) {
      console.error('[dialer/start] insert call row:', callErr);
      return NextResponse.json({ error: 'Failed to create call record' }, { status: 500 });
    }

    // Increment attempts
    await incrementAttempts(supabase, current, user.id);

    return NextResponse.json({ callId: callRow.id, phone: current.phone_e164 });
  } catch (err) {
    console.error('[dialer/start POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
