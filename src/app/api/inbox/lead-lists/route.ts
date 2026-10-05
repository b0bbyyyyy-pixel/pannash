import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isCampaignInboxLead } from '@/lib/inbox/promoteCampaignReply';

// GET /api/inbox/lead-lists              → folder tree for picker
// GET /api/inbox/lead-lists?listId=xxx   → leads from a specific list (with phones)
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

    const listId = req.nextUrl.searchParams.get('listId');

    // ── Fetch leads from a specific list ────────────────────────────────────
    if (listId) {
      // Campaign text threads: people still being worked on this list, not Prospects.
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, name, company, phone, notes, last_contact, created_at, sms_opt_out, lead_status, stage, in_pipeline')
        .eq('user_id', user.id)
        .eq('list_id', listId)
        .not('phone', 'is', null)
        .not('phone', 'eq', '')
        .order('created_at', { ascending: false });

      if (error) {
        // sms_opt_out / in_pipeline may not exist yet — retry without them
        const { data: leadsBasic } = await supabase
          .from('leads')
          .select('id, name, company, phone, notes, last_contact, created_at, lead_status, stage')
          .eq('user_id', user.id)
          .eq('list_id', listId)
          .not('phone', 'is', null)
          .not('phone', 'eq', '')
          .order('created_at', { ascending: false });
        const basic = (leadsBasic ?? []).filter(isCampaignInboxLead);
        return NextResponse.json({ leads: basic });
      }

      return NextResponse.json({ leads: (leads ?? []).filter(isCampaignInboxLead) });
    }

    // ── Fetch all lists — use select('*') so it works with any schema ───────
    const { data: lists } = await supabase
      .from('lead_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    // Count leads with phones per list
    const { data: counts } = await supabase
      .from('leads')
      .select('list_id')
      .eq('user_id', user.id)
      .not('list_id', 'is', null)
      .not('phone', 'is', null)
      .not('phone', 'eq', '');

    const countMap: Record<string, number> = {};
    for (const r of counts ?? []) {
      if (r.list_id) countMap[r.list_id] = (countMap[r.list_id] ?? 0) + 1;
    }

    return NextResponse.json({ lists: lists ?? [], countMap });
  } catch (err: any) {
    console.error('[inbox/lead-lists]', err);
    return NextResponse.json({ lists: [], countMap: {} });
  }
}
