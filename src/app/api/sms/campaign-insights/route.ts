import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { classifyReply } from '@/lib/smsDrip/classifyReply';
import { industryFromCompany } from '@/lib/smsDrip/industryFromCompany';
import { tallyDripSends } from '@/lib/smsDrip/tally';
import { extractNanpAreaCode, lookupAreaCode, US_STATE_NAMES } from '@/lib/phoneLocation';

export const dynamic = 'force-dynamic';

function isDocsInStatus(raw: unknown) {
  return /docs\s*in|docs received/i.test(String(raw ?? ''));
}

function statusNamesForLead(status: string | null | undefined, underwriting: unknown) {
  const names = new Set<string>();
  const current = String(status ?? '').trim();
  if (current) names.add(current);
  const ud = underwriting && typeof underwriting === 'object' ? underwriting as Record<string, unknown> : {};
  const history = Array.isArray(ud.statusHistory) ? ud.statusHistory : [];
  for (const row of history) {
    const rec = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const s = String(rec.status ?? '').trim();
    if (s) names.add(s);
  }
  return names;
}

function matchesStatus(names: Set<string>, want: string) {
  if (isDocsInStatus(want)) return [...names].some(n => isDocsInStatus(n));
  const w = want.trim().toLowerCase();
  return [...names].some(n => n.trim().toLowerCase() === w);
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topCounts(map: Map<string, number>, total: number, limit = 8) {
  return [...map.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, replies]) => ({
      key,
      replies,
      share: total ? Math.round((replies / total) * 100) : 0,
    }));
}

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const listId = req.nextUrl.searchParams.get('listId');
    if (!listId) return NextResponse.json({ error: 'listId required' }, { status: 400 });

    const { data: list } = await supabase
      .from('lead_lists')
      .select('id, name, sms_templates')
      .eq('id', listId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    type LeadRow = {
      id: string;
      phone?: string | null;
      company?: string | null;
      sms_sent_at?: string | null;
      sms_opt_out?: boolean | null;
      in_pipeline?: boolean | null;
      lead_status?: string | null;
      underwriting_data?: unknown;
    };
    const full = await supabase
      .from('leads')
      .select('id, phone, company, sms_sent_at, sms_opt_out, in_pipeline, lead_status, underwriting_data')
      .eq('list_id', listId);
    const slim = full.error
      ? await supabase
          .from('leads')
          .select('id, phone, company, sms_sent_at, sms_opt_out, lead_status, underwriting_data')
          .eq('list_id', listId)
      : null;
    const leadRows = ((slim ?? full).data ?? []) as LeadRow[];
    const leadIds = leadRows.map(l => l.id);
    const textedIds = new Set(leadRows.filter(l => l.sms_sent_at).map(l => l.id));
    const optOuts = leadRows.filter(l => l.sms_opt_out).length;
    const pipeline = leadRows.filter(l => l.in_pipeline || /prospect|pipeline/i.test(String(l.lead_status ?? ''))).length;

    const { data: statusRows } = await supabase
      .from('lead_statuses')
      .select('name, sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    const statuses = (statusRows ?? []).map(s => String(s.name || '').trim()).filter(Boolean);
    if (!statuses.some(n => /^docs in$/i.test(n))) statuses.unshift('Docs In');

    const statusCounts: Record<string, number> = {};
    for (const name of statuses) statusCounts[name] = 0;
    for (const lead of leadRows) {
      const names = statusNamesForLead(lead.lead_status, lead.underwriting_data);
      for (const name of statuses) {
        if (matchesStatus(names, name)) statusCounts[name] += 1;
      }
    }

    let convs: {
      lead_id: string;
      last_inbound_at?: string | null;
      last_direction?: string | null;
      last_message_preview?: string | null;
    }[] = [];
    if (leadIds.length) {
      const inboundRes = await supabase
        .from('inbox_conversations')
        .select('lead_id, last_inbound_at, last_direction, last_message_preview')
        .eq('user_id', user.id)
        .in('lead_id', leadIds.slice(0, 1000));
      if (inboundRes.error) {
        const retry = await supabase
          .from('inbox_conversations')
          .select('lead_id, last_direction, last_message_preview')
          .eq('user_id', user.id)
          .in('lead_id', leadIds.slice(0, 1000));
        convs = (retry.data ?? []) as typeof convs;
      } else {
        convs = (inboundRes.data ?? []) as typeof convs;
      }
    }

    const repliedIds = new Set(
      (convs ?? [])
        .filter(c => c.last_inbound_at || c.last_direction === 'inbound')
        .map(c => c.lead_id)
        .filter(id => textedIds.has(id)),
    );

    const previewByLead = new Map<string, string>();
    for (const c of convs ?? []) {
      if (c.last_message_preview && (c.last_inbound_at || c.last_direction === 'inbound')) {
        previewByLead.set(c.lead_id, c.last_message_preview);
      }
    }

    if (repliedIds.size) {
      const ids = [...repliedIds].slice(0, 400);
      const { data: msgs } = await supabase
        .from('inbox_messages')
        .select('lead_id, body, created_at')
        .in('lead_id', ids)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: true });
      const first = new Map<string, string>();
      for (const m of msgs ?? []) {
        if (!first.has(m.lead_id) && m.body) first.set(m.lead_id, m.body);
      }
      for (const [id, body] of first) previewByLead.set(id, body);
    }

    const mix = { positive: 0, negative: 0, opt_out: 0, other: 0 };
    for (const id of repliedIds) {
      mix[classifyReply(previewByLead.get(id))] += 1;
    }

    const { data: jobs } = await supabase
      .from('sms_drip_jobs')
      .select('id, status, templates, sent_count, total_count, created_at')
      .eq('user_id', user.id)
      .eq('list_id', listId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    const jobList = jobs ?? [];
    const latest = jobList[0] ?? null;
    type SendRow = { lead_id: string; sms_status: string; template_index?: number | null; error?: string | null };
    let sends: SendRow[] = [];
    if (latest) {
      const sendFull = await supabase
        .from('sms_drip_sends')
        .select('lead_id, sms_status, template_index, error')
        .eq('job_id', latest.id);
      const sendSlim = sendFull.error
        ? await supabase
            .from('sms_drip_sends')
            .select('lead_id, sms_status, error')
            .eq('job_id', latest.id)
        : null;
      sends = ((sendSlim ?? sendFull).data ?? []) as SendRow[];
    }

    const tally = tallyDripSends(sends);
    const templates = (latest?.templates as string[] | null)
      ?? (list.sms_templates as string[] | null)
      ?? [];

    const byTpl = new Map<number, { sent: number; replies: number; optOuts: number }>();
    for (const s of sends) {
      if (s.sms_status !== 'sent' && s.sms_status !== 'delivered' && s.sms_status !== 'replied') continue;
      const idx = s.template_index ?? 0;
      let row = byTpl.get(idx);
      if (!row) {
        row = { sent: 0, replies: 0, optOuts: 0 };
        byTpl.set(idx, row);
      }
      row.sent += 1;
      if (repliedIds.has(s.lead_id)) row.replies += 1;
      const lead = leadRows.find(l => l.id === s.lead_id);
      if (lead?.sms_opt_out) row.optOuts += 1;
    }

    const templateRows = [...byTpl.entries()]
      .map(([idx, row]) => {
        const body = (templates[idx] || '').trim() || `Template ${idx + 1}`;
        return {
          index: idx,
          preview: body.length > 90 ? `${body.slice(0, 90)}…` : body,
          sent: row.sent,
          replies: row.replies,
          optOuts: row.optOuts,
          replyRate: row.sent ? Math.round((row.replies / row.sent) * 100) : 0,
        };
      })
      .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent);

    const failMap = new Map<string, number>();
    for (const s of sends) {
      if (s.sms_status !== 'failed' || !s.error) continue;
      const key = s.error.split('\n')[0].slice(0, 120);
      failMap.set(key, (failMap.get(key) ?? 0) + 1);
    }
    const failures = [...failMap.entries()]
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sent = textedIds.size;
    const replies = repliedIds.size;

    const byState = new Map<string, number>();
    const byArea = new Map<string, number>();
    const byIndustry = new Map<string, number>();
    const byLead = new Map(leadRows.map(l => [l.id, l]));
    for (const id of repliedIds) {
      const lead = byLead.get(id);
      if (!lead) continue;
      const areaCode = extractNanpAreaCode(lead.phone);
      if (areaCode) {
        bump(byArea, areaCode);
        const loc = lookupAreaCode(areaCode);
        if (loc) bump(byState, loc.state);
      }
      const industry = industryFromCompany(lead.company, lead.underwriting_data);
      if (industry) bump(byIndustry, industry);
    }

    const topStates = topCounts(byState, replies, 5).map(row => ({
      state: row.key,
      label: US_STATE_NAMES[row.key] || row.key,
      replies: row.replies,
      share: row.share,
    }));
    const topAreaCodes = topCounts(byArea, replies, 5).map(row => {
      const loc = lookupAreaCode(row.key);
      return {
        areaCode: row.key,
        city: loc?.city ?? null,
        state: loc?.state ?? null,
        replies: row.replies,
        share: row.share,
      };
    });
    const topIndustries = topCounts(byIndustry, replies).map(row => ({
      industry: row.key,
      replies: row.replies,
      share: row.share,
    }));

    return NextResponse.json({
      name: list.name,
      leads: leadRows.length,
      sent,
      replies,
      replyRate: sent ? Math.round((replies / sent) * 100) : 0,
      optOuts,
      pipeline,
      statuses,
      statusCounts,
      failed: tally.failed,
      skipped: tally.skipped,
      pending: tally.pending,
      jobStatus: latest?.status ?? null,
      mix,
      templates: templateRows,
      failures,
      topStates,
      topAreaCodes,
      topIndustries,
    });
  } catch (err) {
    console.error('[campaign-insights]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
