import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  CASPER_MISSION,
  DEFAULT_CASPER_CAPABILITIES,
  DEFAULT_CASPER_SYSTEM_PROMPT,
  mergeCapabilities,
} from '@/lib/casper/defaults';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  let prompt = typeof data?.casper_system_prompt === 'string' ? data.casper_system_prompt : null;
  if (!prompt) {
    prompt = DEFAULT_CASPER_SYSTEM_PROMPT;
    if (data?.id) {
      await supabase
        .from('user_settings')
        .update({ casper_system_prompt: prompt, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } else {
      await supabase.from('user_settings').insert({
        user_id: user.id,
        casper_system_prompt: prompt,
        casper_capabilities: DEFAULT_CASPER_CAPABILITIES,
        casper_mission: CASPER_MISSION,
        casper_enabled: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  let pausedLeads = 0;
  try {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('casper_enabled', false);
    pausedLeads = count ?? 0;
  } catch {
    // column not added yet
  }

  return NextResponse.json({
    enabled: !!data?.casper_enabled,
    system_prompt: prompt,
    capabilities: mergeCapabilities(data?.casper_capabilities),
    mission: data?.casper_mission || CASPER_MISSION,
    updated_at: data?.updated_at ?? null,
    paused_leads: pausedLeads,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id, casper_capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('enabled' in body) payload.casper_enabled = !!body.enabled;
  if ('system_prompt' in body) payload.casper_system_prompt = String(body.system_prompt ?? '');
  if ('mission' in body) payload.casper_mission = String(body.mission || CASPER_MISSION);
  if ('capabilities' in body) {
    payload.casper_capabilities = mergeCapabilities({
      ...mergeCapabilities(existing?.casper_capabilities),
      ...(body.capabilities && typeof body.capabilities === 'object' ? body.capabilities : {}),
    });
  }

  const { error } = existing
    ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
    : await supabase.from('user_settings').insert({
        user_id: user.id,
        casper_enabled: false,
        casper_system_prompt: DEFAULT_CASPER_SYSTEM_PROMPT,
        casper_capabilities: DEFAULT_CASPER_CAPABILITIES,
        casper_mission: CASPER_MISSION,
        ...payload,
      });

  if (error) {
    console.error('[casper]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: fresh } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: !!fresh?.casper_enabled,
    system_prompt: fresh?.casper_system_prompt || DEFAULT_CASPER_SYSTEM_PROMPT,
    capabilities: mergeCapabilities(fresh?.casper_capabilities),
    mission: fresh?.casper_mission || CASPER_MISSION,
    updated_at: fresh?.updated_at ?? null,
  });
}
