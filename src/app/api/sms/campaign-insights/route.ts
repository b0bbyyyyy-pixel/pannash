import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { classifyReply } from '@/lib/smsDrip/classifyReply';
import { industryFromCompany } from '@/lib/smsDrip/industryFromCompany';
import { extractNanpAreaCode, lookupAreaCode, US_STATE_NAMES } from '@/lib/phoneLocation';
import { BUILTIN_LEAD_SOURCES, loadLeadListSources } from '@/lib/smsDrip/leadSources';
import {
  insightsTally,
  isSuccessfulDripStatus,
  parseInsightsRange,
  safeInsightsTz,
} from '@/lib/smsDrip/insightsRange';
import {
  chunk,
  loadDripSendsForJobs,
  loadDripSendsInRange,
  loadLeadsByIds,
  sendInRange,
  successfulSendLeadIds,
  type InsightLead,
  type InsightSend,
} from '@/lib/smsDrip/insightsData';

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

type LeadRow = InsightLead;
type SendRow = InsightSend;

type ConvRow = {
  lead_id: string;
  last_inbound_at?: string | null;
  last_direction?: string | null;
  last_message_preview?: string | null;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function safeTz(raw: string | null) {
  return safeInsightsTz(raw);
}

function formatHourLabel(hour: number) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

function hourRangeLabel(start: number, width: number) {
  return `${formatHourLabel(start)}–${formatHourLabel((start + width) % 24)}`;
}

function zonedHourAndDay(iso: string, tz: string): { hour: number; day: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    let hour = Number(parts.find(p => p.type === 'hour')?.value);
    if (hour === 24) hour = 0;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
    const wd = parts.find(p => p.type === 'weekday')?.value ?? '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    if (day < 0) return null;
    return { hour, day };
  } catch {
    return null;
  }
}

function collectReplyIsos(
  repliedIds: Set<string>,
  convs: ConvRow[],
  firstAt?: Map<string, string>,
) {
  const lastAt = new Map<string, string>();
  for (const c of convs) {
    if (c.last_inbound_at) lastAt.set(c.lead_id, c.last_inbound_at);
  }
  const times: string[] = [];
  for (const id of repliedIds) {
    const iso = firstAt?.get(id) || lastAt.get(id);
    if (iso) times.push(iso);
  }
  return times;
}

function timeInsights(
  tz: string,
  replyIsos: string[],
  leadRows: LeadRow[],
  repliedIds: Set<string>,
  sendTimes?: { leadId: string; iso: string }[],
) {
  const hourCounts = Array.from({ length: 24 }, () => 0);
  const dayCounts = Array.from({ length: 7 }, () => 0);
  let counted = 0;
  for (const iso of replyIsos) {
    const z = zonedHourAndDay(iso, tz);
    if (!z) continue;
    hourCounts[z.hour] += 1;
    dayCounts[z.day] += 1;
    counted += 1;
  }

  const hours = hourCounts.map((replies, hour) => ({
    hour,
    label: formatHourLabel(hour),
    replies,
    share: counted ? Math.round((replies / counted) * 100) : 0,
  }));
  const days = dayCounts.map((replies, day) => ({
    day,
    label: WEEKDAYS[day],
    short: WEEKDAYS[day].slice(0, 3),
    replies,
    share: counted ? Math.round((replies / counted) * 100) : 0,
  }));

  const peakHour = hours.reduce((best, row) => (row.replies > best.replies ? row : best), hours[0]);
  const peakDay = days.reduce((best, row) => (row.replies > best.replies ? row : best), days[0]);

  let windowStart = 0;
  let windowSum = 0;
  for (let i = 0; i < 24; i++) {
    let sum = 0;
    for (let w = 0; w < 3; w++) sum += hourCounts[(i + w) % 24];
    if (sum > windowSum) {
      windowSum = sum;
      windowStart = i;
    }
  }

  const sendBuckets = Array.from({ length: 24 }, () => ({ sent: 0, replies: 0 }));
  const times = sendTimes?.length
    ? sendTimes
    : leadRows.filter(l => l.sms_sent_at).map(l => ({ leadId: l.id, iso: l.sms_sent_at as string }));
  for (const row of times) {
    const z = zonedHourAndDay(row.iso, tz);
    if (!z) continue;
    sendBuckets[z.hour].sent += 1;
    if (repliedIds.has(row.leadId)) sendBuckets[z.hour].replies += 1;
  }
  const minSent = 10;
  const bestSendHours = sendBuckets
    .map((row, hour) => ({
      hour,
      label: formatHourLabel(hour),
      sent: row.sent,
      replies: row.replies,
      replyRate: row.sent ? Math.round((row.replies / row.sent) * 100) : 0,
    }))
    .filter(row => row.sent >= minSent)
    .sort((a, b) => b.replyRate - a.replyRate || b.replies - a.replies)
    .slice(0, 5);

  return {
    timezone: tz,
    counted,
    peakHour: peakHour.replies
      ? { label: peakHour.label, replies: peakHour.replies, share: peakHour.share }
      : null,
    peakWindow: windowSum
      ? {
          label: hourRangeLabel(windowStart, 3),
          replies: windowSum,
          share: counted ? Math.round((windowSum / counted) * 100) : 0,
        }
      : null,
    peakDay: peakDay.replies
      ? { label: peakDay.label, replies: peakDay.replies, share: peakDay.share }
      : null,
    hours,
    topHours: [...hours].filter(h => h.replies > 0).sort((a, b) => b.replies - a.replies).slice(0, 5),
    days,
    bestSendHours,
  };
}

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

async function overviewInsights(
  supabase: Awaited<ReturnType<typeof getClient>>,
  userId: string,
  daysRaw: string | null,
  monthRaw: string | null,
  tz: string,
  sourceKeyRaw: string | null,
) {
  const range = parseInsightsRange({ days: daysRaw, month: monthRaw, tz });
  const sourceKey = String(sourceKeyRaw || '').trim();
  const { lists } = await loadLeadListSources(supabase, userId);
  const byList = new Map(lists.map(l => [l.id, l]));
  const sourceListIds = sourceKey
    ? new Set(lists.filter(l => l.key === sourceKey).map(l => l.id))
    : null;
  const sourceMeta = sourceKey
    ? lists.find(l => l.key === sourceKey) || BUILTIN_LEAD_SOURCES.find(s => s.key === sourceKey) || null
    : null;

  const allSends = await loadDripSendsInRange(supabase, userId, range);
  const jobIds = [...new Set(allSends.map(s => s.job_id).filter((id): id is string => Boolean(id)))];
  const jobsById = new Map<string, { id: string; templates: string[]; list_id: string | null }>();
  for (const slice of chunk(jobIds, 50)) {
    const { data: jobs } = await supabase
      .from('sms_drip_jobs')
      .select('id, templates, list_id')
      .eq('user_id', userId)
      .in('id', slice);
    for (const j of jobs ?? []) {
      jobsById.set(j.id, {
        id: j.id,
        templates: Array.isArray(j.templates) ? j.templates as string[] : [],
        list_id: j.list_id ?? null,
      });
    }
  }

  const leadIdSet = new Set(allSends.map(s => s.lead_id).filter(Boolean));
  let leadRows = await loadLeadsByIds(supabase, userId, [...leadIdSet]);
  const leadsById = new Map(leadRows.map(l => [l.id, l]));

  const sourceBuckets = new Map<string, { key: string; label: string; listIds: Set<string>; leadIds: Set<string> }>();
  for (const list of lists) {
    sourceBuckets.set(list.key, { key: list.key, label: list.label, listIds: new Set([list.id]), leadIds: new Set() });
  }

  const jobTpl = new Map<string, string[]>();
  for (const j of jobsById.values()) jobTpl.set(j.id, j.templates);

  const sendsInRange: SendRow[] = [];
  const campaignListIds = new Set<string>();
  for (const s of allSends) {
    const job = s.job_id ? jobsById.get(s.job_id) : null;
    const lead = leadsById.get(s.lead_id);
    const listId = job?.list_id || lead?.list_id || null;
    if (sourceListIds && (!listId || !sourceListIds.has(listId))) continue;
    sendsInRange.push(s);
    if (listId) campaignListIds.add(listId);
    const list = listId ? byList.get(listId) : null;
    const key = list?.key || '';
    const label = list?.label || 'Uncategorized';
    let bucket = sourceBuckets.get(key);
    if (!bucket) {
      bucket = { key, label, listIds: new Set(), leadIds: new Set() };
      sourceBuckets.set(key, bucket);
    }
    if (listId) bucket.listIds.add(listId);
    if (s.lead_id && isSuccessfulDripStatus(s.sms_status)) bucket.leadIds.add(s.lead_id);
  }

  const scopedLeadIds = new Set(sendsInRange.map(s => s.lead_id));
  leadRows = leadRows.filter(l => scopedLeadIds.has(l.id));
  const byLead = new Map(leadRows.map(l => [l.id, l]));

  const textedIds = successfulSendLeadIds(sendsInRange);
  for (const lead of leadRows) {
    if (lead.sms_sent_at && sendInRange({ lead_id: lead.id, sms_status: 'sent', sent_at: lead.sms_sent_at }, range)) {
      textedIds.add(lead.id);
      const list = lead.list_id ? byList.get(lead.list_id) : null;
      if (list) sourceBuckets.get(list.key)?.leadIds.add(lead.id);
    }
  }

  const textedLeads = leadRows.filter(l => textedIds.has(l.id));
  const optOuts = textedLeads.filter(l => l.sms_opt_out).length;
  const pipeline = textedLeads.filter(l => l.in_pipeline || /prospect|pipeline/i.test(String(l.lead_status ?? ''))).length;
  const campaignCount = campaignListIds.size;

  const { data: statusRows } = await supabase
    .from('lead_statuses')
    .select('name, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  const statuses = (statusRows ?? []).map(s => String(s.name || '').trim()).filter(Boolean);
  if (!statuses.some(n => /^docs in$/i.test(n))) statuses.unshift('Docs In');

  const statusCounts: Record<string, number> = {};
  for (const name of statuses) statusCounts[name] = 0;
  for (const lead of textedLeads) {
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

  const tally = insightsTally(sendsInRange);
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
  const geo = geoAndIndustry(textedLeads, repliedIds, replies);
  let replyIsos = collectReplyIsos(repliedIds, convs);
  if (!replyIsos.length && repliedIds.size) {
    const firstAt = new Map<string, string>();
    for (const slice of chunk([...repliedIds].slice(0, 800), 250)) {
      const { data: msgs, error } = await supabase
        .from('inbox_messages')
        .select('lead_id, created_at')
        .in('lead_id', slice)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: true })
        .limit(800);
      if (error) break;
      for (const m of msgs ?? []) {
        if (m.lead_id && m.created_at && !firstAt.has(m.lead_id)) firstAt.set(m.lead_id, m.created_at);
      }
    }
    replyIsos = collectReplyIsos(repliedIds, convs, firstAt);
  }
  const sendTimes = sendsInRange
    .filter(s => isSuccessfulDripStatus(s.sms_status) && (s.sent_at || s.created_at))
    .map(s => ({ leadId: s.lead_id, iso: (s.sent_at || s.created_at) as string }));
  const replyTimes = timeInsights(tz, replyIsos, textedLeads, repliedIds, sendTimes);

  const sources = [...sourceBuckets.values()]
    .map(b => ({
      key: b.key,
      label: b.label,
      campaigns: b.listIds.size,
      sent: b.leadIds.size,
    }))
    .sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label));

  const rangeLabel = range.label;
  const sourceLabel = sourceMeta && 'label' in sourceMeta ? sourceMeta.label : sourceKey || '';

  return NextResponse.json({
    name: sourceLabel ? `${rangeLabel} · ${sourceLabel}` : rangeLabel,
    sourceKey: sourceKey || '',
    sourceLabel: sourceLabel || 'All sources',
    sources,
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
    replyTimes,
    ...geo,
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tz = safeTz(req.nextUrl.searchParams.get('tz'));
    const listId = req.nextUrl.searchParams.get('listId');
    if (!listId) {
      return overviewInsights(
        supabase,
        user.id,
        req.nextUrl.searchParams.get('days'),
        req.nextUrl.searchParams.get('month'),
        tz,
        req.nextUrl.searchParams.get('source'),
      );
    }

    const { lists } = await loadLeadListSources(supabase, user.id);
    const listSource = lists.find(l => l.id === listId);
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

    const { data: jobs } = await supabase
      .from('sms_drip_jobs')
      .select('id, status, templates, sent_count, total_count, created_at')
      .eq('user_id', user.id)
      .eq('list_id', listId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    const jobList = jobs ?? [];
    const latest = jobList[0] ?? null;
    let sends: SendRow[] = [];
    if (jobList.length) {
      sends = await loadDripSendsForJobs(supabase, jobList.map(j => j.id));
    }
    for (const s of sends) {
      if (isSuccessfulDripStatus(s.sms_status) && s.lead_id) textedIds.add(s.lead_id);
    }

    const optOuts = leadRows.filter(l => textedIds.has(l.id) && l.sms_opt_out).length;
    const pipeline = leadRows.filter(l => textedIds.has(l.id) && (l.in_pipeline || /prospect|pipeline/i.test(String(l.lead_status ?? '')))).length;

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
    for (const s of sends) {
      if (s.sms_status === 'replied' && s.lead_id) repliedIds.add(s.lead_id);
    }

    const previewByLead = new Map<string, string>();
    for (const c of convs ?? []) {
      if (c.last_message_preview && (c.last_inbound_at || c.last_direction === 'inbound')) {
        previewByLead.set(c.lead_id, c.last_message_preview);
      }
    }

    const firstAt = new Map<string, string>();
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
        if (!m.lead_id) continue;
        if (m.created_at && !firstAt.has(m.lead_id)) firstAt.set(m.lead_id, m.created_at);
        if (!first.has(m.lead_id) && m.body) first.set(m.lead_id, m.body);
      }
      for (const [id, body] of first) previewByLead.set(id, body);
    }

    const mix = { positive: 0, negative: 0, opt_out: 0, other: 0 };
    for (const id of repliedIds) {
      mix[classifyReply(previewByLead.get(id))] += 1;
    }

    const tally = insightsTally(sends);
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
    const replyTimes = timeInsights(
      tz,
      collectReplyIsos(repliedIds, convs, firstAt),
      leadRows,
      repliedIds,
    );

    return NextResponse.json({
      name: list.name,
      sourceKey: listSource?.key || '',
      sourceLabel: listSource?.label || 'Uncategorized',
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
      replyTimes,
      topStates,
      topAreaCodes,
      topIndustries,
    });
  } catch (err) {
    console.error('[campaign-insights]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
