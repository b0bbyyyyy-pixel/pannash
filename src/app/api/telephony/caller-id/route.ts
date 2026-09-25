import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { pickDialerCallerId } from '@/lib/dialerCallerId';
import { toE164 } from '@/lib/dialer/e164';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const to = toE164(req.nextUrl.searchParams.get('to') || '');
    const creds = await getTwilioCreds(supabase, user.id);
    const fallback = creds?.fromNumber || '';
    const from = to ? pickDialerCallerId(to, fallback) : fallback;

    return NextResponse.json({ from: from || null });
  } catch (err) {
    console.error('[telephony/caller-id GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
