import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { countUploadUnread, listUploadUnread, markUploadSeen, type UploadUnreadKind } from '@/lib/inbox/uploadUnread';

export const dynamic = 'force-dynamic';

async function client() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function GET() {
  try {
    const supabase = await client();
    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const items = await listUploadUnread(supabase, user.id);
    return NextResponse.json({ count: items.length, items });
  } catch {
    return NextResponse.json({ count: 0, items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await client();
    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const leadId = String(body.leadId || '').trim();
    const kind = body.kind === 'documents' || body.kind === 'application' || body.kind === 'all'
      ? body.kind
      : 'all';
    if (!leadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    await markUploadSeen(supabase, {
      userId: user.id,
      leadId,
      kind: kind as UploadUnreadKind | 'all',
    });
    let docsIn = false;
    try {
      const { maybeMarkDocsIn } = await import('@/lib/leads/markDocsIn');
      docsIn = await maybeMarkDocsIn(supabase, { leadId, userId: user.id });
    } catch {
      /* status update is best-effort */
    }
    const count = await countUploadUnread(supabase, user.id);
    return NextResponse.json({ ok: true, count, docsIn });
  } catch {
    return NextResponse.json({ ok: false, count: 0 });
  }
}
