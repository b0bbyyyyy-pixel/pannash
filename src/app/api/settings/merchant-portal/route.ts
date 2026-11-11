import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { MERCHANT_STAGES, parseStageMap } from '@/lib/merchantPortal/stages';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('portal_enabled, portal_stage_map')
    .eq('user_id', user.id)
    .maybeSingle();
  const { data: statuses } = await supabase
    .from('lead_statuses')
    .select('name')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  const map = parseStageMap(settings?.portal_stage_map);
  const names = (statuses || []).map(s => String(s.name || '').trim()).filter(Boolean);
  return NextResponse.json({
    enabled: settings?.portal_enabled !== false,
    stages: MERCHANT_STAGES,
    map: Object.fromEntries(names.map(name => [name, map[name.toLowerCase()] || 'Reviewing'])),
  });
}

export async function POST(req: Request) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled !== false;
  const map = parseStageMap(body.map);
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: user.id,
        portal_enabled: enabled,
        portal_stage_map: map,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled, map });
}
