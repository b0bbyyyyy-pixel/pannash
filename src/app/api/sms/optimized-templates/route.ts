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

function findOptimized(packs: OptimizedPack[]): OptimizedPack | null {
  return packs.find(p => isOptimizedPack(p)) ?? null;
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

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { packs } = await readPacks(supabase, user.id);
  const optimized = findOptimized(packs);
  return NextResponse.json({ optimized: optimized?.templates?.some(t => t.trim()) ? optimized : emptyOptimizedPack() });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const days = Number(body.days) === 60 || Number(body.days) === 90 ? Number(body.days) : 30;
  const insights = body.insights && typeof body.insights === 'object'
    ? { ...(body.insights as Record<string, unknown>), days }
    : { days, sent: body.sent, replies: body.replies, replyRate: body.replyRate, optOuts: body.optOuts, mix: body.mix, templates: body.templates, topIndustries: body.topIndustries, topStates: body.topStates, replyTimes: body.replyTimes };

  try {
    const samples = await collectReplySamples(supabase, user.id);
    const briefing = briefingFromInsights(insights, { samples });
    briefing.days = days;
    if (!briefing.templates?.length) {
      const { data: jobs } = await supabase
        .from('sms_drip_jobs')
        .select('templates')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(40);
      const seen = new Set<string>();
      briefing.templates = [];
      for (const job of jobs ?? []) {
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
