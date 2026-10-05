import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isHiddenInboxThread } from '@/lib/leads/dnc';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('inbox_conversations')
      .select('lead_id, unread_count, last_message_preview, last_inbound_at, last_direction')
      .eq('user_id', user.id)
      .gt('unread_count', 0);

    if (error) {
      return NextResponse.json({ count: 0 });
    }

    const ids = [...new Set((data ?? []).map(r => r.lead_id).filter(Boolean))];
    const { data: leads } = ids.length
      ? await supabase.from('leads').select('id, lead_status, sms_opt_out').eq('user_id', user.id).in('id', ids)
      : { data: [] };
    const byId = new Map((leads ?? []).map(l => [l.id, l]));

    let count = 0;
    for (const row of data ?? []) {
      const preview = row.last_message_preview;
      if (isHiddenInboxThread(byId.get(row.lead_id), preview)) continue;
      // STOP / DNC already skipped. Don't badge the tab for outbound-only leftover unread.
      if (!row.last_inbound_at && row.last_direction !== 'inbound') continue;
      count += Number(row.unread_count) || 0;
    }

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
