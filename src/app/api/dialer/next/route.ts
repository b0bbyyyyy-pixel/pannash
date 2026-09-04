import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { claimNextLead, unlockLead, getCurrentLead, peekQueue } from '@/lib/dialer/queue';

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
 * Body: { releasePreviousId?: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { releasePreviousId } = body as { releasePreviousId?: string };

    // Release previous lock if explicitly requested
    if (releasePreviousId) {
      await unlockLead(supabase, releasePreviousId, user.id);
    } else {
      // Auto-release any stale lock this agent holds
      const existing = await getCurrentLead(supabase, user.id);
      if (existing) await unlockLead(supabase, existing.id, user.id);
    }

    const next = await claimNextLead(supabase, user.id);
    const queue = await peekQueue(supabase, user.id, next?.id ?? null, 10);

    return NextResponse.json({ current: next, queue });
  } catch (err) {
    console.error('[dialer/next POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
