import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { unlockLead } from '@/lib/dialer/queue';
import { nextEligibleAt } from '@/lib/dialer/canDial';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

const VALID_DISPOSITIONS = [
  'connected', 'voicemail', 'no_answer', 'busy', 'bad_number', 'dnc', 'callback',
] as const;
type Disposition = typeof VALID_DISPOSITIONS[number];

/**
 * POST /api/dialer/disposition
 * Body: { callId, leadId, disposition, notes?, callbackAt? }
 * - Updates the dialer_calls row with disposition + ended_at
 * - Updates the lead: last_disposition, last_call_notes, next_eligible_at
 * - Handles dnc / bad_number flags
 * - Unlocks the lead
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { callId, leadId, disposition, notes, callbackAt } =
      (await req.json()) as {
        callId: string;
        leadId: string;
        disposition: string;
        notes?: string;
        callbackAt?: string;
      };

    if (!callId || !leadId || !disposition) {
      return NextResponse.json({ error: 'callId, leadId, and disposition required' }, { status: 400 });
    }

    if (!VALID_DISPOSITIONS.includes(disposition as Disposition)) {
      return NextResponse.json({ error: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(', ')}` }, { status: 400 });
    }

    if (disposition === 'callback' && !callbackAt) {
      return NextResponse.json({ error: 'callbackAt is required for callback disposition' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Update the call row
    await supabase
      .from('dialer_calls')
      .update({
        disposition,
        notes: notes || null,
        callback_at: callbackAt || null,
        ended_at: now,
      })
      .eq('id', callId)
      .eq('agent_id', user.id);

    // 2. Compute lead updates
    const eligibleAt = nextEligibleAt(disposition, callbackAt);

    const leadUpdate: Record<string, unknown> = {
      last_disposition: disposition,
      last_called_at: now,
      last_call_notes: notes || null,
      next_eligible_at: eligibleAt,
      locked_by: null,
      locked_at: null,
    };

    if (disposition === 'dnc') {
      leadUpdate.dnc = true;
      leadUpdate.next_eligible_at = null;
    }

    if (disposition === 'bad_number') {
      leadUpdate.dialer_status = 'bad_number';
      leadUpdate.next_eligible_at = null;
    }

    // 3. Update the lead
    const { error: leadErr } = await supabase
      .from('leads')
      .update(leadUpdate)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (leadErr) {
      console.error('[dialer/disposition] lead update:', leadErr);
      // Still try to unlock
      await unlockLead(supabase, leadId, user.id);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    return NextResponse.json({ success: true, disposition, nextEligibleAt: eligibleAt });
  } catch (err) {
    console.error('[dialer/disposition POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
