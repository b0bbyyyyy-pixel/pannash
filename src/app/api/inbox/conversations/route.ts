import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSmsStopBody } from '@/lib/leads/dnc';

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
      // Main inbox = people who texted back (including replies that never got last_inbound_at).
      let convs: Record<string, unknown>[] = [];
      try {
        const { data, error } = await supabase
          .from('inbox_conversations')
          .select('*')
          .eq('user_id', user.id)
          .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(80);
        if (error) {
          const { data: fallback } = await supabase
            .from('inbox_conversations')
            .select('*')
            .eq('user_id', user.id)
            .eq('last_direction', 'inbound')
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(80);
          convs = fallback ?? [];
        } else {
          convs = data ?? [];
        }
      } catch {
        // Table not created yet
      }

      convs = convs.filter(c => {
        const preview = String(c.last_message_preview ?? '');
        const inbound = c.last_inbound_at || c.last_direction === 'inbound';
        if (!inbound) return false;
        if (isSmsStopBody(preview)) return false;
        return true;
      });
      convs.sort((a, b) => {
        const aT = String(a.last_inbound_at || a.last_message_at || '');
        const bT = String(b.last_inbound_at || b.last_message_at || '');
        return bT > aT ? 1 : bT < aT ? -1 : 0;
      });
      convs = convs.slice(0, LIMIT);

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
    let casperMap: Record<string, boolean | null> = {};
    if (ids.length) {
      try {
        const { data: optOuts } = await supabase
          .from('leads')
          .select('id, sms_opt_out, casper_enabled')
          .in('id', ids);
        for (const r of optOuts ?? []) {
          optOutMap[r.id] = r.sms_opt_out ?? false;
          casperMap[r.id] = r.casper_enabled ?? null;
        }
      } catch {
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
      id: lead.id,
      phone: (lead.phone as string) || '',
      sms_opt_out: optOutMap[String(lead.id)] ?? false,
      casper_enabled: casperMap[String(lead.id)] ?? null,
      conversation: convMap[String(lead.id)] ?? null,
      lead_status: (optOutMap[String(lead.id)] ? 'DNC' : lead.lead_status) ?? null,
    })).filter(lead => {
      if (q || (pinLeadId && lead.id === pinLeadId)) return true;
      const conv = lead.conversation as { last_message_preview?: string | null; last_inbound_at?: string | null; last_direction?: string | null; last_message_at?: string | null } | null;
      const preview = conv?.last_message_preview ?? '';
      const hasInbound = !!(conv?.last_inbound_at || conv?.last_direction === 'inbound');
      if (hasInbound && isSmsStopBody(preview)) return false;
      const dnc = !!(lead.sms_opt_out) || String(lead.lead_status ?? '').toUpperCase() === 'DNC';
      if (dnc) return false;
      return hasInbound;
    });

    merged.sort((a, b) => {
      if (pinLeadId) {
        if (a.id === pinLeadId) return -1;
        if (b.id === pinLeadId) return 1;
      }
      type Conv = { last_inbound_at?: string | null; last_message_at?: string | null } | null;
      const t = (row: Record<string, unknown>) => {
        const c = row.conversation as Conv;
        return c?.last_inbound_at || c?.last_message_at || (row.last_contact as string | null) || '0';
      };
      const aT = t(a);
      const bT = t(b);
      return bT > aT ? 1 : bT < aT ? -1 : 0;
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
