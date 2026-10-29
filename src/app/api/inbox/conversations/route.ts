import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSmsStopBody } from '@/lib/leads/dnc';
import { inboxActivityMs, sortInboxLeads } from '@/lib/inbox/sortInboxLeads';
import { dedupeInboxLeadsByPhone, groupDuplicateLeads, mergeBestConversation, pickDisplayDuplicate } from '@/lib/inbox/dedupeInboxLeads';
import { last10, normPersonName } from '@/lib/leads/phone';
import { countAttachmentsByLead } from '@/lib/leads/attachmentCounts';
import { getRequestUser } from '@/lib/auth/getRequestUser';

const LEAD_COLS = 'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, underwriting_data, sms_opt_out, casper_enabled, sms_language';
const LEAD_COLS_NO_LANG = 'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, underwriting_data, sms_opt_out, casper_enabled';
const LEAD_COLS_FALLBACK = 'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, underwriting_data';
const CONV_COLS = 'id, lead_id, last_message_at, last_inbound_at, last_direction, last_message_preview, unread_count';
const LIMIT = 200;
const FETCH = 300;

function escapeIlike(s: string) {
  return s.replace(/[%_\\]/g, '\\$&');
}

function orIlike(col: string, raw: string) {
  const inner = escapeIlike(raw).replace(/"/g, '\\"');
  return `${col}.ilike."%${inner}%"`;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = user.id;

    const pinLeadId = req.nextUrl.searchParams.get('leadId');
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const statusFilter = req.nextUrl.searchParams.get('status')?.trim() ?? '';
    const initial = req.nextUrl.searchParams.get('initial') === '1';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function selectLeads(build: (cols: string) => any) {
      let { data, error } = await build(LEAD_COLS);
      if (error) {
        const mid = await build(LEAD_COLS_NO_LANG);
        data = mid.data;
        error = mid.error;
      }
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
      const digits = q.replace(/\D/g, '');
      const parts = ['name', 'company', 'email', 'phone'].map(col => orIlike(col, q));
      if (digits.length >= 4) parts.push(`phone.ilike."%${digits}%"`);
      const { data: hits, error } = await selectLeads((cols) =>
        supabase
          .from('leads')
          .select(cols)
          .eq('user_id', user.id)
          .or(parts.join(','))
          .order('last_contact', { ascending: false, nullsFirst: false })
          .limit(80)
      );

      if (error) {
        console.error('[inbox/conversations] search error:', error.message);
        return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
      }
      list = (hits ?? [])
        .filter((l: Record<string, unknown>) => String(l.phone ?? '').trim())
        .filter((l: Record<string, unknown>) => {
          if (digits.length < 4) return true;
          const phone = last10(String(l.phone ?? ''));
          const name = `${l.name ?? ''} ${l.company ?? ''} ${l.email ?? ''}`.toLowerCase();
          return name.includes(q.toLowerCase()) || phone.includes(digits) || String(l.phone ?? '').includes(q);
        })
        .slice(0, LIMIT);
    } else if (statusFilter) {
      const { data: hits, error } = await selectLeads((cols) =>
        supabase
          .from('leads')
          .select(cols)
          .eq('user_id', user.id)
          .eq('lead_status', statusFilter)
          .order('last_contact', { ascending: false, nullsFirst: false })
          .limit(200)
      );
      if (error) {
        console.error('[inbox/conversations] status error:', error.message);
        return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
      }
      list = (hits ?? []).filter((l: Record<string, unknown>) => String(l.phone ?? '').trim());
    } else {
      // Main inbox = people who texted back (including replies that never got last_inbound_at).
      try {
        let { data, error } = await supabase
          .from('inbox_conversations')
          .select(CONV_COLS)
          .eq('user_id', user.id)
          .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(FETCH);
        if (error) {
          ({ data, error } = await supabase
            .from('inbox_conversations')
            .select('*')
            .eq('user_id', user.id)
            .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(FETCH));
        }
        if (error) {
          const { data: fallback } = await supabase
            .from('inbox_conversations')
            .select('*')
            .eq('user_id', user.id)
            .eq('last_direction', 'inbound')
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(FETCH);
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

      // Pipeline threads whose last SMS is outbound never had last_inbound_at —
      // they still belong on Inbox (docs / Submitted live on that copy).
      const pipelineIds = new Set<string>();
      try {
        const { data: pipeLeads } = await supabase
          .from('leads')
          .select('id')
          .eq('user_id', user.id)
          .eq('in_pipeline', true)
          .limit(400);
        for (const row of pipeLeads ?? []) {
          const id = String((row as { id: string }).id ?? '');
          if (id) pipelineIds.add(id);
        }
        const seen = new Set(convs.map(c => String(c.lead_id)));
        const extraIds = [...pipelineIds].filter(id => !seen.has(id));
        for (let i = 0; i < extraIds.length; i += 80) {
          const chunk = extraIds.slice(i, i + 80);
          let extra = await supabase
            .from('inbox_conversations')
            .select(CONV_COLS)
            .eq('user_id', user.id)
            .in('lead_id', chunk)
            .not('last_message_at', 'is', null);
          if (extra.error) {
            extra = await supabase
              .from('inbox_conversations')
              .select('*')
              .eq('user_id', user.id)
              .in('lead_id', chunk)
              .not('last_message_at', 'is', null);
          }
          for (const c of extra.data ?? []) {
            const id = String(c.lead_id ?? '');
            if (!id || seen.has(id)) continue;
            convs.push(c);
            seen.add(id);
          }
        }
      } catch {
        // ignore
      }

      convs.sort((a, b) => {
        const aT = inboxActivityMs({ conversation: a });
        const bT = inboxActivityMs({ conversation: b });
        return bT - aT;
      });
      const kept: Record<string, unknown>[] = [];
      let extraInbound = 0;
      for (const c of convs) {
        const id = String(c.lead_id ?? '');
        if (!id) continue;
        if (pipelineIds.has(id)) {
          kept.push(c);
          continue;
        }
        if (extraInbound >= LIMIT) continue;
        kept.push(c);
        extraInbound += 1;
      }
      convs = kept;

      const convLeadIds = convs.map(c => String(c.lead_id)).filter(Boolean);
      if (convLeadIds.length) {
        const { data: convLeads } = await selectLeads((cols) =>
          supabase.from('leads').select(cols).eq('user_id', user.id).in('id', convLeadIds)
        );
        const byId = new Map((convLeads ?? []).map((l: { id: string }) => [l.id, l]));
        list = convLeadIds.map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
      }
    }

    // Pipeline + same-name copies — Autova phones are often stored garbled
    // so last-10 ilike misses Autovova Auto Transport.
    async function loadSiblingPool(seed: Record<string, unknown>[]) {
      const { data: pipeline } = await selectLeads((cols) =>
        supabase.from('leads').select(cols).eq('user_id', userId).eq('in_pipeline', true).limit(400)
      );
      const names = [...new Set(
        seed.map(l => String(l.name ?? '').trim()).filter(n => normPersonName(n).length >= 10)
      )];
      const named: Record<string, unknown>[] = [];
      for (const name of names.slice(0, 25)) {
        const { data } = await selectLeads((cols) =>
          supabase.from('leads').select(cols).eq('user_id', userId).ilike('name', name).limit(20)
        );
        named.push(...((data ?? []) as Record<string, unknown>[]));
      }
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of [...seed, ...((pipeline ?? []) as Record<string, unknown>[]), ...named]) {
        const id = String(row.id ?? '');
        if (id) byId.set(id, row);
      }
      return [...byId.values()];
    }

    let resolvedPin = q ? null : pinLeadId;
    if (resolvedPin) {
      const { data: pinned } = await selectLeads((cols) =>
        supabase.from('leads').select(cols).eq('id', pinLeadId).eq('user_id', user.id).maybeSingle()
      );
      const pinRow = pinned as Record<string, unknown> | null;
      if (pinRow) {
        const pool = await loadSiblingPool([pinRow, ...list]);
        const sibIds = pool.map(l => String(l.id));
        let sibConvs: Record<string, unknown>[] = [];
        try {
          const extra = await supabase
            .from('inbox_conversations')
            .select(CONV_COLS)
            .eq('user_id', user.id)
            .in('lead_id', sibIds);
          sibConvs = extra.error ? [] : (extra.data ?? []);
        } catch { /* ignore */ }
        const convByLead = new Map(sibConvs.map((c: Record<string, unknown>) => [String(c.lead_id), c]));
        const pinDocs = await countAttachmentsByLead(supabase, sibIds);
        const ranked = pool.map((l: Record<string, unknown>) => ({
          ...l,
          id: String(l.id ?? ''),
          name: (l.name as string | null) ?? null,
          phone: (l.phone as string | null) ?? null,
          in_pipeline: (l.in_pipeline as boolean | null) ?? null,
          lead_status: (l.lead_status as string | null) ?? null,
          last_contact: (l.last_contact as string | null) ?? null,
          doc_count: pinDocs[String(l.id)] ?? 0,
          conversation: (convByLead.get(String(l.id)) ?? null) as {
            last_inbound_at?: string | null;
            last_direction?: string | null;
            last_message_at?: string | null;
          } | null,
        }));
        const group = groupDuplicateLeads(ranked).find(g => g.some(l => String(l.id) === String(pinRow.id))) ?? ranked.filter(l => String(l.id) === String(pinRow.id));
        const best = group.length ? mergeBestConversation(pickDisplayDuplicate(group), group) : pinRow;
        if (best?.id) resolvedPin = String(best.id);
        if (best && !list.some(l => l.id === best.id)) list.unshift(best);
      }
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
        email: (lead.email as string) || '',
        phone: (lead.phone as string) || '',
        in_pipeline: lead.in_pipeline ?? null,
        sms_opt_out: optOut,
        casper_enabled: lead.casper_enabled ?? null,
        conversation: convMap[String(lead.id)] ?? null,
        lead_status: (optOut ? 'DNC' : lead.lead_status) ?? null,
        doc_count: docCountByLead[String(lead.id)] ?? 0,
        email_from_sms: !!((lead as { underwriting_data?: { email_from_sms?: boolean } | null }).underwriting_data?.email_from_sms),
      };
    }).filter(lead => {
      if (q || statusFilter || (resolvedPin && lead.id === resolvedPin)) return true;
      const conv = lead.conversation as { last_message_preview?: string | null; last_inbound_at?: string | null; last_direction?: string | null; last_message_at?: string | null } | null;
      const preview = conv?.last_message_preview ?? '';
      const hasInbound = !!(conv?.last_inbound_at || conv?.last_direction === 'inbound');
      if (hasInbound && isSmsStopBody(preview)) return false;
      const dnc = !!(lead.sms_opt_out) || String(lead.lead_status ?? '').toUpperCase() === 'DNC';
      if (dnc) return false;
      return hasInbound || (!!lead.in_pipeline && !!conv?.last_message_at);
    });

    let resolved = merged;
    if (!q && !statusFilter && resolved.length) {
      const pool = await loadSiblingPool(resolved);
      const allSibIds = pool.map(l => String(l.id)).filter(Boolean);
      const missingSibIds = allSibIds.filter(id => !convMap[id]);
      if (missingSibIds.length) {
        try {
          let extraQ = await supabase
            .from('inbox_conversations')
            .select(CONV_COLS)
            .eq('user_id', user.id)
            .in('lead_id', missingSibIds);
          if (extraQ.error) {
            extraQ = await supabase
              .from('inbox_conversations')
              .select('*')
              .eq('user_id', user.id)
              .in('lead_id', missingSibIds);
          }
          for (const c of extraQ.data ?? []) convMap[String(c.lead_id)] = c;
        } catch { /* ignore */ }
      }
      const sibDocs = allSibIds.length ? await countAttachmentsByLead(supabase, allSibIds) : {};
      for (const [id, n] of Object.entries(sibDocs)) docCountByLead[id] = n;
      const ranked = pool.map((l: Record<string, unknown>) => ({
        ...l,
        id: String(l.id ?? ''),
        name: (l.name as string | null) ?? null,
        phone: (l.phone as string | null) ?? null,
        in_pipeline: (l.in_pipeline as boolean | null) ?? null,
        lead_status: (l.lead_status as string | null) ?? null,
        last_contact: (l.last_contact as string | null) ?? null,
        doc_count: docCountByLead[String(l.id)] ?? Number(l.doc_count) ?? 0,
        conversation: convMap[String(l.id)] ?? null,
      }));
      const inboxIds = new Set(resolved.map(l => String(l.id)));
      const next: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const group of groupDuplicateLeads(ranked)) {
        if (!group.some(l => inboxIds.has(String(l.id)))) continue;
        const best = mergeBestConversation(pickDisplayDuplicate(group), group);
        const id = String(best.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const existing = resolved.find(l => String(l.id) === id);
        next.push(existing
          ? { ...existing, ...best, conversation: best.conversation ?? existing.conversation, doc_count: best.doc_count ?? existing.doc_count }
          : { ...best });
      }
      resolved = next;
    }

    const mergedDeduped = (q || statusFilter) ? resolved : dedupeInboxLeadsByPhone(resolved);
    const mergedSorted = sortInboxLeads(mergedDeduped, resolvedPin);

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
