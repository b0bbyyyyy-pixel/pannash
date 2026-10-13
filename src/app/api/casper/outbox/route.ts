import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { listPendingOutbox, processDueCasperOutbox } from '@/lib/casper/outbox';
import { serviceClient } from '@/lib/telephony/twilio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

async function runDue(req: NextRequest) {
  if (isCron(req)) {
    const result = await processDueCasperOutbox(serviceClient());
    return NextResponse.json(result);
  }

  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await processDueCasperOutbox(supabase, user.id);
  return NextResponse.json(result);
}

/** Queue tab: pending scheduled replies for the signed-in user. */
export async function GET(req: NextRequest) {
  try {
    if (isCron(req) || req.nextUrl.searchParams.get('process') === '1') {
      return await runDue(req);
    }

    const supabase = await userClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pending = await listPendingOutbox(supabase, user.id);
    return NextResponse.json({ pending });
  } catch (err) {
    console.error('[casper/outbox GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await runDue(req);
  } catch (err) {
    console.error('[casper/outbox POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
