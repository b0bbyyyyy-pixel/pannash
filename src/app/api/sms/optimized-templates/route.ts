import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  briefingFromInsights,
  collectReplySamples,
  emptyOptimizedPack,
  generateOptimizedSms,
  isOptimizedPack,
  upsertOptimizedPack,
  type OptimizedPack,
} from '@/lib/smsDrip/optimizeTemplates';
import { loadLeadListSources, optimizedPackId, sourceFromStored } from '@/lib/smsDrip/leadSources';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

function asPacks(raw: unknown): OptimizedPack[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is OptimizedPack => !!p && typeof p === 'object') as OptimizedPack[];
}

function findOptimized(packs: OptimizedPack[], sourceKey: string): OptimizedPack | null {
  const id = optimizedPackId(sourceKey);
  return packs.find(p => p.id === id) ?? packs.find(p => isOptimizedPack(p) && (!sourceKey || p.sourceKey === sourceKey)) ?? null;
}

async function readPacks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('id, sms_template_packs')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { settingsId: null as string | null, packs: [] as OptimizedPack[] };
  return {
    settingsId: data?.id as string | null,
    packs: asPacks(data?.sms_template_packs),
  };
}

async function writePacks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  settingsId: string | null,
  packs: OptimizedPack[],
) {
  const payload = { sms_template_packs: packs, updated_at: new Date().toISOString() };
  if (settingsId) {
    await supabase.from('user_settings').update(payload).eq('user_id', userId);
  } else {
    await supabase.from('user_settings').insert({ user_id: userId, ...payload });
  }
}

export async function GET(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sourceKey = String(req.nextUrl.searchParams.get('source') || '').trim();
  const { packs } = await readPacks(supabase, user.id);
  const optimized = findOptimized(packs, sourceKey);
  return NextResponse.json({
    optimized: optimized?.templates?.some(t => t.trim())
      ? optimized
      : emptyOptimizedPack(sourceFromStored(sourceKey)),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const days = Number(body.days) === 60 || Number(body.days) === 90 ? Number(body.days) : 30;
  const sourceKey = String(body.source || body.sourceKey || '').trim();
  if (!sourceKey) {
    return NextResponse.json({ error: 'Pick a lead source before writing Optimized texts.' }, { status: 400 });
  }
  const { lists } = await loadLeadListSources(supabase, user.id);
  const source = lists.find(l => l.key === sourceKey) || sourceFromStored(sourceKey);
  if (!source?.key) {
    return NextResponse.json({ error: 'Unknown lead source.' }, { status: 400 });
  }
  const leadIds = new Set<string>();
  const insights = body.insights && typeof body.insights === 'object'
    ? {
        ...(body.insights as Record<string, unknown>),
        days,
        sourceKey: source.key,
        sourceLabel: source.label,
      }
    : {
        days,
        sourceKey: source.key,
        sourceLabel: source.label,
        sent: body.sent,
        replies: body.replies,
        replyRate: body.replyRate,
        optOuts: body.optOuts,
        mix: body.mix,
        templates: body.templates,
        topIndustries: body.topIndustries,
        topStates: body.topStates,
        replyTimes: body.replyTimes,
      };

  try {
    const listIds = lists.filter(l => l.key === source.key).map(l => l.id);
    if (listIds.length) {
      for (let from = 0; from < 8000; from += 1000) {
        const { data } = await supabase
          .from('leads')
          .select('id')
          .eq('user_id', user.id)
          .in('list_id', listIds.slice(0, 80))
          .range(from, from + 999);
        for (const row of data ?? []) if (row.id) leadIds.add(row.id);
        if ((data ?? []).length < 1000) break;
      }
    }
    const samples = await collectReplySamples(supabase, user.id, leadIds.size ? leadIds : null);
    const briefing = briefingFromInsights(insights, { samples, source });
    briefing.days = days;
    if (!briefing.templates?.length) {
      const { data: jobs } = await supabase
        .from('sms_drip_jobs')
        .select('templates, list_id')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(40);
      const seen = new Set<string>();
      briefing.templates = [];
      const allowed = new Set(listIds);
      for (const job of jobs ?? []) {
        if (allowed.size && job.list_id && !allowed.has(job.list_id)) continue;
        for (const raw of Array.isArray(job.templates) ? job.templates : []) {
          const preview = String(raw || '').trim();
          if (!preview || seen.has(preview)) continue;
          seen.add(preview);
          briefing.templates.push({ preview: preview.slice(0, 90), sent: 0, replies: 0, optOuts: 0, replyRate: 0 });
          if (briefing.templates.length >= 8) break;
        }
        if (briefing.templates.length >= 8) break;
      }
    }
    const optimized = await generateOptimizedSms(briefing);
    const { settingsId, packs } = await readPacks(supabase, user.id);
    await writePacks(supabase, user.id, settingsId, upsertOptimizedPack(packs, optimized) as OptimizedPack[]);
    return NextResponse.json({ optimized });
  } catch (err) {
    console.error('[sms/optimized-templates]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not write optimized texts' },
      { status: 500 },
    );
  }
}
