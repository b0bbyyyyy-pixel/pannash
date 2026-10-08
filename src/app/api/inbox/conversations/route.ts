import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSmsStopBody } from '@/lib/leads/dnc';
import { inboxActivityMs, sortInboxLeads } from '@/lib/inbox/sortInboxLeads';
import { countAttachmentsByLead } from '@/lib/leads/attachmentCounts';

const LEAD_COLS = 'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, underwriting_data, sms_opt_out, casper_enabled';
const LEAD_COLS_FALLBACK = 'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, underwriting_data';
const CONV_COLS = 'id, lead_id, last_message_at, last_inbound_at, last_direction, last_message_preview, unread_count';
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
    const initial = req.nextUrl.searchParams.get('initial') === '1';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function selectLeads(build: (cols: string) => any) {
      let { data, error } = await build(LEAD_COLS);
      if (error) {
        const fallback = await build(LEAD_COLS_FALLBACK);
        data = fallback.data;
        error = fallback.error;
      }
      return { data, error };
    }

    let list: Record<string, unknown>[] = [];
    let convs: Record<string, unknown>[] = [];

    if (q) {
      const safe = escapeIlike(q);
      const { data: hits, error } = await selectLeads((cols) =>
        supabase
          .from('leads')
          .select(cols)
          .eq('user_id', user.id)
          .or(`name.ilike.%${safe}%,company.ilike.%${safe}%,phone.ilike.%${safe}%`)
          .order('last_contact', { ascending: false, nullsFirst: false })
          .limit(80)
      );

      if (error) {
        console.error('[inbox/conversations] search error:', error.message);
        return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
      }
      list = (hits ?? []).filter(isInboxLead).slice(0, LIMIT);
    } else {
      // Main inbox = people who texted back (including replies that never got last_inbound_at).
      try {
        let { data, error } = await supabase
          .from('inbox_conversations')
          .select(CONV_COLS)
          .eq('user_id', user.id)
          .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(80);
        if (error) {
          ({ data, error } = await supabase
            .from('inbox_conversations')
            .select('*')
            .eq('user_id', user.id)
            .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(80));
        }
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
        const aT = inboxActivityMs({ conversation: a });
        const bT = inboxActivityMs({ conversation: b });
        return bT - aT;
      });
      convs = convs.slice(0, LIMIT);

      const convLeadIds = convs.map(c => String(c.lead_id)).filter(Boolean);
      if (convLeadIds.length) {
        const { data: convLeads } = await selectLeads((cols) =>
          supabase.from('leads').select(cols).eq('user_id', user.id).in('id', convLeadIds)
        );
        const byId = new Map((convLeads ?? []).map((l: { id: string }) => [l.id, l]));
        list = convLeadIds.map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
      }
    }

    if (pinLeadId && !list.some(l => l.id === pinLeadId)) {
      const { data: pinned } = await selectLeads((cols) =>
        supabase.from('leads').select(cols).eq('id', pinLeadId).eq('user_id', user.id).maybeSingle()
      );
      if (pinned) list.unshift(pinned as Record<string, unknown>);
      if (list.length > LIMIT) list = list.slice(0, LIMIT + 1);
    }

    const ids = list.map(l => String(l.id));
    const convMap: Record<string, Record<string, unknown>> = {};
    for (const c of convs) {
      const lid = String(c.lead_id ?? '');
      if (lid) convMap[lid] = c;
    }

    const missingConvIds = ids.filter(id => !convMap[id]);
    if (missingConvIds.length) {
      try {
        let extraQ = await supabase
          .from('inbox_conversations')
          .select(CONV_COLS)
          .eq('user_id', user.id)
          .in('lead_id', missingConvIds);
        if (extraQ.error) {
          extraQ = await supabase
            .from('inbox_conversations')
            .select('*')
            .eq('user_id', user.id)
            .in('lead_id', missingConvIds);
        }
        const extra = extraQ.data;
        for (const c of extra ?? []) convMap[c.lead_id as string] = c;
      } catch {
        // Table not created yet — ignore
      }
    }

    const docCountByLead = ids.length ? await countAttachmentsByLead(supabase, ids) : {};

    const merged: Record<string, unknown>[] = list.map(lead => {
      const optOut = !!(lead.sms_opt_out);
      return {
        ...lead,
        id: lead.id,
        phone: (lead.phone as string) || '',
        sms_opt_out: optOut,
        casper_enabled: lead.casper_enabled ?? null,
        conversation: convMap[String(lead.id)] ?? null,
        lead_status: (optOut ? 'DNC' : lead.lead_status) ?? null,
        doc_count: docCountByLead[String(lead.id)] ?? 0,
      };
    }).filter(lead => {
      if (q || (pinLeadId && lead.id === pinLeadId)) return true;
      const conv = lead.conversation as { last_message_preview?: string | null; last_inbound_at?: string | null; last_direction?: string | null; last_message_at?: string | null } | null;
      const preview = conv?.last_message_preview ?? '';
      const hasInbound = !!(conv?.last_inbound_at || conv?.last_direction === 'inbound');
      if (hasInbound && isSmsStopBody(preview)) return false;
      const dnc = !!(lead.sms_opt_out) || String(lead.lead_status ?? '').toUpperCase() === 'DNC';
      if (dnc) return false;
      return hasInbound;
    });

    const mergedSorted = sortInboxLeads(merged);

    let phoneConn = null;
    if (initial) {
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
    }

    return NextResponse.json({ leads: mergedSorted, phoneConnection: phoneConn });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[inbox/conversations] unexpected error:', err);
    return NextResponse.json({ leads: [], phoneConnection: null, dbError: message });
  }
}
