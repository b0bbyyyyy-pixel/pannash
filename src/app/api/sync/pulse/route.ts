import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { countInboxUnread } from '@/lib/inbox/unreadCount';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serverNow = new Date().toISOString();
  const unreadCount = await countInboxUnread(supabase, user.id);
  const since = req.nextUrl.searchParams.get('since')?.trim() || '';
  const openRaw = req.nextUrl.searchParams.get('open')?.trim() || '';
  const openIds = [...new Set(openRaw.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 5);

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

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const threads: { leadId: string; sig: string }[] = [];
  for (const leadId of openIds) {
    const { data: recent } = await supabase
      .from('inbox_messages')
      .select('id, status, created_at')
      .eq('lead_id', leadId)
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20);
    let rows = recent ?? [];
    if (!rows.length) {
      const { data: latest } = await supabase
        .from('inbox_messages')
        .select('id, status, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1);
      rows = latest ?? [];
    }
    const sig = rows.map(r => `${r.id}:${r.created_at}:${r.status ?? ''}`).join('|');
    threads.push({ leadId, sig });
  }

  return NextResponse.json({ unreadCount, serverNow, inboxChanged, threads });
}
