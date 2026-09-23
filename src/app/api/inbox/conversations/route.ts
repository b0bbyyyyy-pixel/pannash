import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const LEAD_COLS = 'id, name, company, phone, stage, month_key, last_contact, created_at, notes, in_pipeline, lead_status, list_id';
const LIMIT = 40;

function escapeIlike(s: string) {
  return s.replace(/[%_\\]/g, '\\$&');
}

function isInboxLead(l: { phone?: string | null; in_pipeline?: boolean; month_key?: string | null; list_id?: string | null }) {
  if (!l.phone) return false;
  return l.in_pipeline === true || (!!l.month_key && !l.list_id);
}

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
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

    let list: Record<string, unknown>[] = [];

    if (q) {
      const safe = escapeIlike(q);
      const { data: hits, error } = await supabase
        .from('leads')
        .select(LEAD_COLS)
        .eq('user_id', user.id)
        .or(`name.ilike.%${safe}%,company.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .order('last_contact', { ascending: false, nullsFirst: false })
        .limit(80);

      if (error) {
        console.error('[inbox/conversations] search error:', error.message);
        return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
      }
      list = (hits ?? []).filter(isInboxLead).slice(0, LIMIT);
    } else {
      // Main inbox = people who texted back. Drip outbound never creates a row here.
      let convs: Record<string, unknown>[] = [];
      try {
        const { data, error } = await supabase
          .from('inbox_conversations')
          .select('*')
          .eq('user_id', user.id)
          .not('last_inbound_at', 'is', null)
          .order('last_inbound_at', { ascending: false })
          .limit(LIMIT);
        if (error) {
          // last_inbound_at column not added yet (add-sms-drip.sql) — replies only via last_direction
          const { data: fallback } = await supabase
            .from('inbox_conversations')
            .select('*')
            .eq('user_id', user.id)
            .eq('last_direction', 'inbound')
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(LIMIT);
          convs = fallback ?? [];
        } else {
          convs = data ?? [];
        }
      } catch {
        // Table not created yet
      }

      const convLeadIds = convs.map(c => String(c.lead_id)).filter(Boolean);
      if (convLeadIds.length) {
        const { data: convLeads } = await supabase
          .from('leads')
          .select(LEAD_COLS)
          .eq('user_id', user.id)
          .in('id', convLeadIds);
        const byId = new Map((convLeads ?? []).map(l => [l.id, l]));
        list = convLeadIds.map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
      }

      // Until replies fill the rail, pad with pipeline leads (drip outbound never adds a row)
      if (list.length < LIMIT) {
        const have = new Set(list.map(l => String(l.id)));
        const { data: extras, error } = await supabase
          .from('leads')
          .select(LEAD_COLS)
          .eq('user_id', user.id)
          .not('phone', 'is', null)
          .not('phone', 'eq', '')
          .or('in_pipeline.eq.true,and(month_key.not.is.null,list_id.is.null)')
          .order('last_contact', { ascending: false, nullsFirst: false })
          .limit(LIMIT);

        if (error) {
          console.error('[inbox/conversations] leads query error:', error.message);
          if (!list.length) {
            return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
          }
        }

        for (const lead of extras ?? []) {
          if (have.has(lead.id)) continue;
          list.push(lead);
          have.add(lead.id);
          if (list.length >= LIMIT) break;
        }
      }
    }

    if (pinLeadId && !list.some(l => l.id === pinLeadId)) {
      const { data: pinned } = await supabase
        .from('leads')
        .select(LEAD_COLS)
        .eq('id', pinLeadId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (pinned) list.unshift(pinned);
      if (list.length > LIMIT) list = list.slice(0, LIMIT + 1);
    }

    const ids = list.map(l => String(l.id));

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
    if (ids.length) {
      try {
        const { data: convs } = await supabase
          .from('inbox_conversations')
          .select('*')
          .eq('user_id', user.id)
          .in('lead_id', ids);
        for (const c of convs ?? []) convMap[c.lead_id] = c;
      } catch {
        // Table not created yet — ignore
      }
    }

    const merged: Record<string, unknown>[] = list.map(lead => ({
      ...lead,
      phone: (lead.phone as string) || '',
      sms_opt_out: optOutMap[String(lead.id)] ?? false,
      conversation: convMap[String(lead.id)] ?? null,
    }));

    merged.sort((a, b) => {
      if (pinLeadId) {
        if (a.id === pinLeadId) return -1;
        if (b.id === pinLeadId) return 1;
      }
      // Replies always stack above pipeline padding. Drip outbound is ignored.
      type Conv = { last_inbound_at?: string | null } | null;
      const aIn = (a.conversation as Conv)?.last_inbound_at ?? null;
      const bIn = (b.conversation as Conv)?.last_inbound_at ?? null;
      if (aIn && bIn) return bIn > aIn ? 1 : -1;
      if (aIn) return -1;
      if (bIn) return 1;
      const aTime = (a.last_contact as string | null) ?? '0';
      const bTime = (b.last_contact as string | null) ?? '0';
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
