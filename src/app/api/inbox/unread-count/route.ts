import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSmsStopBody } from '@/lib/leads/dnc';

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
      .select('unread_count, last_message_preview, last_inbound_at, last_direction')
      .eq('user_id', user.id)
      .gt('unread_count', 0);

    if (error) {
      return NextResponse.json({ count: 0 });
    }

    let count = 0;
    for (const row of data ?? []) {
      const preview = String(row.last_message_preview ?? '');
      const inbound = row.last_inbound_at || row.last_direction === 'inbound';
      if (inbound && isSmsStopBody(preview)) continue;
      count += Number(row.unread_count) || 0;
    }

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
