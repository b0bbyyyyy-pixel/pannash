import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { claimNextLead, unlockLead, peekQueue } from '@/lib/dialer/queue';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

/**
 * POST /api/dialer/next
 * Releases any current lock, claims the next eligible lead.
 * Body: { releasePreviousId?: string; listId?: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { releasePreviousId, listId } = body as { releasePreviousId?: string; listId?: string };

    // Release previous lock if explicitly requested
    if (releasePreviousId) {
      await unlockLead(supabase, releasePreviousId, user.id);
    }

    // Always clear ALL stale/active locks held by this agent (across all campaigns)
    // so switching campaigns never leaves ghost locks blocking the new queue.
    await supabase
      .from('leads')
      .update({ locked_by: null, locked_at: null })
      .eq('locked_by', user.id)
      .neq('id', releasePreviousId ?? '00000000-0000-0000-0000-000000000000');

    const next = await claimNextLead(supabase, user.id, listId);
    const queue = await peekQueue(supabase, user.id, next?.id ?? null, 10, listId);

    return NextResponse.json({ current: next, queue });
  } catch (err) {
    console.error('[dialer/next POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
