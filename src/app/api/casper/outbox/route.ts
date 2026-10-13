import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { after, NextRequest, NextResponse } from 'next/server';
import {
  kickOutboxPump,
  listPendingOutbox,
  processDueCasperOutbox,
  pumpCasperOutboxRow,
} from '@/lib/casper/outbox';
import { serviceClient } from '@/lib/telephony/twilio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isProcessor(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secrets = [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  if (secrets.some(secret => auth === `Bearer ${secret}`)) return true;
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
  if (isProcessor(req)) {
    const result = await processDueCasperOutbox(serviceClient());
    return NextResponse.json(result);
  }

  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await processDueCasperOutbox(supabase, user.id);
  return NextResponse.json(result);
}

/** Queue tab: pending scheduled replies for the signed-in user. Also flushes due rows. */
export async function GET(req: NextRequest) {
  try {
    if (isProcessor(req) || req.nextUrl.searchParams.get('process') === '1') {
      return await runDue(req);
    }

    const supabase = await userClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await processDueCasperOutbox(supabase, user.id);
    const pending = await listPendingOutbox(supabase, user.id);
    return NextResponse.json({ pending });
  } catch (err) {
    console.error('[casper/outbox GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (body.id && isProcessor(req)) {
      const result = await pumpCasperOutboxRow(serviceClient(), body.id);
      if (result.hop) after(() => kickOutboxPump(body.id!));
      return NextResponse.json(result);
    }

    return await runDue(req);
  } catch (err) {
    console.error('[casper/outbox POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
