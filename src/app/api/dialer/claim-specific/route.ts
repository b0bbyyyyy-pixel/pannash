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

/**
 * POST /api/dialer/claim-specific
 * Body: { leadId: string; listId?: string }
 *
 * Claims a specific lead by ID, bypassing the eligibility/ordering logic
 * (used as a fallback when claimNextLead returns null but peekQueue has leads).
 * Also clears any other locks this agent holds, then returns the full lead + updated queue.
 */
export async function POST(req: Request) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { leadId, listId } = body as { leadId?: string; listId?: string };
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    // Clear any other locks held by this agent
    await supabase
      .from('leads')
      .update({ locked_by: null, locked_at: null })
      .eq('locked_by', user.id)
      .neq('id', leadId);

    // Fetch the specific lead (must belong to this user)
    const { data: lead, error: fetchErr } = await supabase
      .from('leads')
      .select([
        'id', 'name', 'company', 'email', 'phone_e164', 'timezone',
        'dnc', 'dialer_status', 'next_eligible_at',
        'last_disposition', 'last_called_at', 'last_call_notes',
        'notes', 'stage', 'lead_status', 'month_key', 'list_id', 'in_pipeline',
        'attempts_today', 'attempts_today_on',
        'locked_by', 'locked_at',
      ].join(', '))
      .eq('id', leadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Try to lock (non-blocking — if it fails we proceed anyway)
    const { error: lockErr } = await supabase
      .from('leads')
      .update({ locked_by: user.id, locked_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (lockErr) console.warn('[claim-specific] lock failed:', lockErr.message);

    // Build queue preview (next lead after this one)
    const { peekQueue } = await import('@/lib/dialer/queue');
    const queue = await peekQueue(supabase, user.id, leadId, 10, listId ?? null);

    return NextResponse.json({ current: lead, queue });
  } catch (err) {
    console.error('[dialer/claim-specific POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
