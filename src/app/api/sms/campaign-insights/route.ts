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

type LeadRow = {
  id: string;
  list_id?: string | null;
  phone?: string | null;
  company?: string | null;
  sms_sent_at?: string | null;
  sms_opt_out?: boolean | null;
  in_pipeline?: boolean | null;
  lead_status?: string | null;
  underwriting_data?: unknown;
};

type SendRow = {
  lead_id: string;
  job_id?: string | null;
  sms_status: string;
  template_index?: number | null;
  error?: string | null;
  sent_at?: string | null;
};

type ConvRow = {
  lead_id: string;
  last_inbound_at?: string | null;
  last_direction?: string | null;
  last_message_preview?: string | null;
};

function geoAndIndustry(leadRows: LeadRow[], repliedIds: Set<string>, replies: number) {
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
  return {
    topStates: topCounts(byState, replies, 5).map(row => ({
      state: row.key,
      label: US_STATE_NAMES[row.key] || row.key,
      replies: row.replies,
      share: row.share,
    })),
    topAreaCodes: topCounts(byArea, replies, 5).map(row => {
      const loc = lookupAreaCode(row.key);
      return {
        areaCode: row.key,
        city: loc?.city ?? null,
        state: loc?.state ?? null,
        replies: row.replies,
        share: row.share,
      };
    }),
    topIndustries: topCounts(byIndustry, replies).map(row => ({
      industry: row.key,
      replies: row.replies,
      share: row.share,
    })),
  };
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

async function overviewInsights(
  supabase: Awaited<ReturnType<typeof getClient>>,
  userId: string,
  daysRaw: string | null,
) {
  const days = daysRaw === 'all' ? null : Math.min(365, Math.max(1, Number(daysRaw) || 30));
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  const leadRows: LeadRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    let q = supabase
      .from('leads')
      .select('id, list_id, phone, company, sms_sent_at, sms_opt_out, in_pipeline, lead_status, underwriting_data')
      .eq('user_id', userId)
      .not('list_id', 'is', null)
      .not('sms_sent_at', 'is', null)
      .range(from, from + 999);
    if (since) q = q.gte('sms_sent_at', since);
    const full = await q;
    if (full.error) {
      let q2 = supabase
        .from('leads')
        .select('id, list_id, phone, company, sms_sent_at, sms_opt_out, lead_status, underwriting_data')
        .eq('user_id', userId)
        .not('list_id', 'is', null)
        .not('sms_sent_at', 'is', null)
        .range(from, from + 999);
      if (since) q2 = q2.gte('sms_sent_at', since);
      const slim = await q2;
      const rows = asRows<LeadRow>(slim.data);
      leadRows.push(...rows);
      if (rows.length < 1000) break;
      continue;
    }
    const rows = asRows<LeadRow>(full.data);
    leadRows.push(...rows);
    if (rows.length < 1000) break;
  }

  const textedIds = new Set(leadRows.map(l => l.id));
  const byLead = new Map(leadRows.map(l => [l.id, l]));

  const { data: jobs } = await supabase
    .from('sms_drip_jobs')
    .select('id, templates, created_at, updated_at, list_id, status')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .limit(500);
  const jobList = (jobs ?? []).filter(j => {
    if (!since) return true;
    if (j.status === 'active' || j.status === 'paused') return true;
    const created = String(j.created_at ?? '');
    const updated = String((j as { updated_at?: string }).updated_at ?? '');
    return created >= since || updated >= since;
  });
  const jobTpl = new Map<string, string[]>();
  for (const j of jobList) {
    jobTpl.set(j.id, Array.isArray(j.templates) ? j.templates as string[] : []);
  }

  const sends: SendRow[] = [];
  for (const slice of chunk(jobList.map(j => j.id), 25)) {
    for (let from = 0; from < 8000; from += 1000) {
      const sendFull = await supabase
        .from('sms_drip_sends')
        .select('lead_id, job_id, sms_status, template_index, error, sent_at')
        .in('job_id', slice)
        .range(from, from + 999);
      const sendSlim = sendFull.error
        ? await supabase
            .from('sms_drip_sends')
            .select('lead_id, job_id, sms_status, error')
            .in('job_id', slice)
            .range(from, from + 999)
        : null;
      const rows = asRows<SendRow>((sendSlim ?? sendFull).data);
      sends.push(...rows);
      if (rows.length < 1000) break;
    }
  }

  const sendsInRange = sends.filter(s => {
    if (!since) return true;
    if (s.sent_at) return s.sent_at >= since;
    return textedIds.has(s.lead_id);
  });

  const optOuts = leadRows.filter(l => l.sms_opt_out).length;
  const pipeline = leadRows.filter(l => l.in_pipeline || /prospect|pipeline/i.test(String(l.lead_status ?? ''))).length;
  const campaignCount = new Set(leadRows.map(l => l.list_id).filter(Boolean)).size;

  const { data: statusRows } = await supabase
    .from('lead_statuses')
    .select('name, sort_order')
    .eq('user_id', userId)
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

  const inboundRes = await supabase
    .from('inbox_conversations')
    .select('lead_id, last_inbound_at, last_direction, last_message_preview')
    .eq('user_id', userId)
    .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
    .limit(10000);
  let convs: ConvRow[] = [];
  if (inboundRes.error) {
    const retry = await supabase
      .from('inbox_conversations')
      .select('lead_id, last_direction, last_message_preview')
      .eq('user_id', userId)
      .eq('last_direction', 'inbound')
      .limit(10000);
    convs = (retry.data ?? []) as ConvRow[];
  } else {
    convs = (inboundRes.data ?? []) as ConvRow[];
  }

  const repliedIds = new Set<string>();
  for (const c of convs) {
    if (!textedIds.has(c.lead_id)) continue;
    if (c.last_inbound_at || c.last_direction === 'inbound') repliedIds.add(c.lead_id);
  }
  for (const s of sendsInRange) {
    if (s.sms_status === 'replied' && s.lead_id) repliedIds.add(s.lead_id);
  }

  const previewByLead = new Map<string, string>();
  for (const c of convs) {
    if (c.last_message_preview && repliedIds.has(c.lead_id)) {
      previewByLead.set(c.lead_id, c.last_message_preview);
    }
  }

  const mix = { positive: 0, negative: 0, opt_out: 0, other: 0 };
  for (const id of repliedIds) mix[classifyReply(previewByLead.get(id))] += 1;

  const tally = tallyDripSends(sendsInRange);
  const byTpl = new Map<string, { sent: number; replies: number; optOuts: number }>();
  for (const s of sendsInRange) {
    if (s.sms_status !== 'sent' && s.sms_status !== 'delivered' && s.sms_status !== 'replied') continue;
    const body = (jobTpl.get(s.job_id ?? '')?.[s.template_index ?? 0] || '').trim() || 'Template';
    const key = body.length > 90 ? `${body.slice(0, 90)}…` : body;
    let row = byTpl.get(key);
    if (!row) {
      row = { sent: 0, replies: 0, optOuts: 0 };
      byTpl.set(key, row);
    }
    row.sent += 1;
    if (repliedIds.has(s.lead_id)) row.replies += 1;
    if (byLead.get(s.lead_id)?.sms_opt_out) row.optOuts += 1;
  }
  const templateRows = [...byTpl.entries()]
    .map(([preview, row], index) => ({
      index,
      preview,
      sent: row.sent,
      replies: row.replies,
      optOuts: row.optOuts,
      replyRate: row.sent ? Math.round((row.replies / row.sent) * 100) : 0,
    }))
    .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent)
    .slice(0, 8);

  const failMap = new Map<string, number>();
  for (const s of sendsInRange) {
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
  const geo = geoAndIndustry(leadRows, repliedIds, replies);

  return NextResponse.json({
    name: days ? `Last ${days} days` : 'All time',
    campaigns: campaignCount,
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
    jobStatus: null,
    mix,
    templates: templateRows,
    failures,
    ...geo,
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const listId = req.nextUrl.searchParams.get('listId');
    if (!listId) return overviewInsights(supabase, user.id, req.nextUrl.searchParams.get('days'));

    const { data: list } = await supabase
      .from('lead_lists')
      .select('id, name, sms_templates')
      .eq('id', listId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

    const { topStates, topAreaCodes, topIndustries } = geoAndIndustry(leadRows, repliedIds, replies);

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
