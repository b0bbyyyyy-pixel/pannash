import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { countInboxUnread } from '@/lib/inbox/unreadCount';
import { getRequestUser } from '@/lib/auth/getRequestUser';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const user = await getRequestUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serverNow = new Date().toISOString();
  const unreadCount = await countInboxUnread(supabase, user.id);
  const since = req.nextUrl.searchParams.get('since')?.trim() || '';

  if (!since) {
    return NextResponse.json({ unreadCount, serverNow, inboxChanged: [], threads: [] });
  }

  const sinceMs = new Date(since).getTime();
  const sinceQuery = Number.isFinite(sinceMs)
    ? new Date(sinceMs - 30_000).toISOString()
    : since;

  let inboxChanged: Record<string, unknown>[] = [];
  try {
    const { data } = await supabase
      .from('inbox_conversations')
      .select('lead_id, last_message_at, last_inbound_at, last_direction, last_message_preview, unread_count')
      .eq('user_id', user.id)
      .gt('last_message_at', sinceQuery)
      .order('last_message_at', { ascending: false })
      .limit(80);
    inboxChanged = data ?? [];
  } catch {
    inboxChanged = [];
  }

  return NextResponse.json({ unreadCount, serverNow, inboxChanged, threads: [] });
}
