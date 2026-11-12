import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { normalizePortalDomain } from '@/lib/merchantPortal/origin';
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

  let settings: {
    portal_enabled?: boolean | null;
    portal_stage_map?: unknown;
    portal_domain?: string | null;
    portal_brand_name?: string | null;
  } | null = null;
  const selects = [
    'portal_enabled, portal_stage_map, portal_domain, portal_brand_name',
    'portal_enabled, portal_stage_map, portal_domain',
    'portal_enabled, portal_stage_map',
  ];
  for (const sel of selects) {
    const res = await supabase
      .from('user_settings')
      .select(sel)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!res.error) {
      settings = res.data;
      break;
    }
  }
  const { data: statuses } = await supabase
    .from('lead_statuses')
    .select('name')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  const map = parseStageMap(settings?.portal_stage_map);
  const names = (statuses || []).map(s => String(s.name || '').trim()).filter(Boolean);
  const domain = normalizePortalDomain(settings?.portal_domain);
  const portalBrandName = String(settings?.portal_brand_name || '').replace(/\s+/g, ' ').trim();
  return NextResponse.json({
    enabled: settings?.portal_enabled !== false,
    portalDomain: domain.ok ? (domain.value || '') : '',
    portalBrandName,
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
  const domain = normalizePortalDomain(body.portalDomain ?? body.portal_domain);
  if (!domain.ok) return NextResponse.json({ error: domain.error }, { status: 400 });
  const portalBrandName = String(body.portalBrandName ?? body.portal_brand_name ?? '').replace(/\s+/g, ' ').trim() || null;
  const row = {
    user_id: user.id,
    portal_enabled: enabled,
    portal_stage_map: map,
    portal_domain: domain.value,
    portal_brand_name: portalBrandName,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
  if (error) {
    const { portal_brand_name: _brand, ...withoutBrand } = row;
    const retry = await supabase.from('user_settings').upsert(withoutBrand, { onConflict: 'user_id' });
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    enabled,
    map,
    portalDomain: domain.value || '',
    portalBrandName: portalBrandName || '',
  });
}
