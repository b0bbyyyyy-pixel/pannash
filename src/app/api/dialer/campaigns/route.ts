import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveListSource } from '@/lib/smsDrip/leadSources';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

/**
 * GET /api/dialer/campaigns
 * Returns all lead lists with total and touched (called + sms) counts.
 */
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    type ListRow = { id: string; name: string; created_at: string; source_category?: string | null };
    const withSource = await supabase
      .from('lead_lists')
      .select('id, name, created_at, source_category')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    let lists: ListRow[] | null = withSource.data as ListRow[] | null;
    if (withSource.error && /source_category/i.test(withSource.error.message || '')) {
      const fallback = await supabase
        .from('lead_lists')
        .select('id, name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      lists = fallback.data as ListRow[] | null;
    }

    if (!lists?.length) return NextResponse.json({ campaigns: [] });

    const campaigns = await Promise.all(
      lists.map(async (list) => {
        const { data: stats } = await supabase
          .from('leads')
          .select('id, call_made_at, sms_sent_at')
          .eq('list_id', list.id);
        const total   = stats?.length ?? 0;
        const touched = stats?.filter((l) => l.call_made_at || l.sms_sent_at).length ?? 0;
        const called  = stats?.filter((l) => l.call_made_at).length ?? 0;
        const source = resolveListSource(list);
        return {
          id: list.id,
          name: list.name,
          created_at: list.created_at,
          total,
          touched,
          called,
          sourceKey: source.key,
          sourceLabel: source.label,
        };
      })
    );

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error('[dialer/campaigns GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
