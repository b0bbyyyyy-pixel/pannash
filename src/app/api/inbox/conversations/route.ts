import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const LEAD_COLS = 'id, name, company, phone, stage, month_key, last_contact, notes, in_pipeline';

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

    const pinLeadId = req.nextUrl.searchParams.get('leadId');

    // Pipeline leads + legacy CRM (month_key, no campaign list) that have a phone.
    // New pipeline adds set in_pipeline and leave month_key null.
    const { data: leads, error } = await supabase
      .from('leads')
      .select(LEAD_COLS)
      .eq('user_id', user.id)
      .not('phone', 'is', null)
      .not('phone', 'eq', '')
      .or('in_pipeline.eq.true,and(month_key.not.is.null,list_id.is.null)')
      .order('last_contact', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[inbox/conversations] leads query error:', error.message);
      return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
    }

    const list = [...(leads ?? [])];

    // Send SMS from a lead workspace always passes leadId — include that row even if
    // it wouldn't match the default filter (no phone, campaign list, etc.).
    if (pinLeadId && !list.some(l => l.id === pinLeadId)) {
      const { data: pinned } = await supabase
        .from('leads')
        .select(LEAD_COLS)
        .eq('id', pinLeadId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (pinned) list.unshift(pinned);
    }

    const ids = list.map(l => l.id);

    let optOutMap: Record<string, boolean> = {};
    if (ids.length) {
      try {
        const { data: optOuts } = await supabase
          .from('leads')
          .select('id, sms_opt_out')
          .in('id', ids);
        for (const r of optOuts ?? []) {
          optOutMap[r.id] = r.sms_opt_out ?? false;
        }
      } catch {
        // Column not created yet — ignore
      }
    }

    let convMap: Record<string, Record<string, unknown>> = {};
    try {
      const { data: convs } = await supabase
        .from('inbox_conversations')
        .select('*')
        .eq('user_id', user.id);
      for (const c of convs ?? []) convMap[c.lead_id] = c;
    } catch {
      // Table not created yet — ignore
    }

    const merged = list.map(lead => ({
      ...lead,
      phone: lead.phone || '',
      sms_opt_out: optOutMap[lead.id] ?? false,
      conversation: convMap[lead.id] ?? null,
    }));

    merged.sort((a, b) => {
      if (pinLeadId) {
        if (a.id === pinLeadId) return -1;
        if (b.id === pinLeadId) return 1;
      }
      const aTime = (a.conversation as { last_message_at?: string } | null)?.last_message_at ?? a.last_contact ?? '0';
      const bTime = (b.conversation as { last_message_at?: string } | null)?.last_message_at ?? b.last_contact ?? '0';
      return bTime > aTime ? 1 : -1;
    });

    let phoneConn = null;
    try {
      const { data } = await supabase
        .from('phone_connections')
        .select('phone_number, provider')
        .eq('user_id', user.id)
        .single();
      phoneConn = data ?? null;
    } catch {
      // No connection table or no row — fine
    }

    return NextResponse.json({ leads: merged, phoneConnection: phoneConn });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[inbox/conversations] unexpected error:', err);
    return NextResponse.json({ leads: [], phoneConnection: null, dbError: message });
  }
}
