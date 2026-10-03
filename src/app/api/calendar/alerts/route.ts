import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serviceClient } from '@/lib/telephony/twilio';
import { fireDueCalendarPings } from '@/lib/casper/calendarPing';

export const dynamic = 'force-dynamic';

function isCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth === `Bearer ${secret}`) return true;
  return Boolean(req.headers.get('x-vercel-cron'));
}

async function userClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function POST() {
  try {
    const supabase = await userClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sent = await fireDueCalendarPings(supabase, user.id);
    return NextResponse.json({ sent });
  } catch (err) {
    console.error('[calendar/alerts]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (isCron(req)) {
      const sent = await fireDueCalendarPings(serviceClient());
      return NextResponse.json({ sent });
    }

    const supabase = await userClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sent = await fireDueCalendarPings(supabase, user.id);
    return NextResponse.json({ sent });
  } catch (err) {
    console.error('[calendar/alerts]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
