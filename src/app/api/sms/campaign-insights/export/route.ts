import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { loadLeadListSources } from '@/lib/smsDrip/leadSources';
import { parseInsightsRange, safeInsightsTz } from '@/lib/smsDrip/insightsRange';
import {
  buildOutboundCsv,
  chunk,
  loadDripSendsForJobs,
  loadDripSendsInRange,
  loadLeadsByIds,
  outboundRowsFromSends,
  sendInRange,
} from '@/lib/smsDrip/insightsData';
import { expandRepliedByPhone, loadInboundSignals } from '@/lib/smsDrip/campaignReplyIds';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

function fileSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tz = safeInsightsTz(req.nextUrl.searchParams.get('tz'));
    const listId = String(req.nextUrl.searchParams.get('listId') || '').trim();
    const sourceKey = String(req.nextUrl.searchParams.get('source') || '').trim();
    const range = parseInsightsRange({
      days: listId ? (req.nextUrl.searchParams.get('days') || 'all') : req.nextUrl.searchParams.get('days'),
      month: req.nextUrl.searchParams.get('month'),
      tz,
    });

    const { lists } = await loadLeadListSources(supabase, user.id);
    const sourceListIds = sourceKey
      ? new Set(lists.filter(l => l.key === sourceKey).map(l => l.id))
      : listId
        ? new Set([listId])
        : null;

    let sends = listId
      ? [] as Awaited<ReturnType<typeof loadDripSendsInRange>>
      : await loadDripSendsInRange(supabase, user.id, range);

    if (listId) {
      const { data: jobs } = await supabase
        .from('sms_drip_jobs')
        .select('id')
        .eq('user_id', user.id)
        .eq('list_id', listId)
        .neq('status', 'cancelled');
      sends = await loadDripSendsForJobs(supabase, (jobs ?? []).map(j => j.id));
      sends = sends.filter(s => sendInRange(s, range));
    }

    const jobIds = [...new Set(sends.map(s => s.job_id).filter((id): id is string => Boolean(id)))];
    const jobListIds = new Map<string, string | null>();
    for (const slice of chunk(jobIds, 50)) {
      const { data: jobs } = await supabase
        .from('sms_drip_jobs')
        .select('id, list_id')
        .eq('user_id', user.id)
        .in('id', slice);
      for (const j of jobs ?? []) jobListIds.set(j.id, j.list_id ?? null);
    }

    const leads = await loadLeadsByIds(supabase, user.id, sends.map(s => s.lead_id));
    const byLead = new Map(leads.map(l => [l.id, l]));

    const scoped = sends.filter(s => {
      if (!sourceListIds) return true;
      const listIdForSend = (s.job_id ? jobListIds.get(s.job_id) : null) || byLead.get(s.lead_id)?.list_id || null;
      return !!listIdForSend && sourceListIds.has(listIdForSend);
    });

    const signals = await loadInboundSignals(supabase, user.id);
    const repliedIds = expandRepliedByPhone({
      leads,
      inboundLeadIds: signals.inboundLeadIds,
      inboundPhones: signals.inboundPhones,
    });
    for (const s of scoped) {
      if (s.sms_status === 'replied' && s.lead_id) repliedIds.add(s.lead_id);
    }

    const rows = outboundRowsFromSends({ sends: scoped, leads, repliedIds, tz });
    const csv = buildOutboundCsv(rows);
    const name = `campaign-texts-${fileSlug(range.label)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[campaign-insights/export]', err);
    return NextResponse.json({ error: 'Could not export texts' }, { status: 500 });
  }
}
