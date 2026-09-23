import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type SmsTemplatePack = {
  id: string;
  name: string;
  templates: string[];
};

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

function normalizePacks(raw: unknown): SmsTemplatePack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      id: String(p.id || crypto.randomUUID()),
      name: String(p.name || 'Set').trim() || 'Set',
      templates: Array.isArray(p.templates)
        ? p.templates.map((t) => String(t ?? ''))
        : ['', '', '', '', ''],
    }));
}

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('sms_template_packs')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ packs: [], setupRequired: true });
  }

  return NextResponse.json({ packs: normalizePacks(data?.sms_template_packs) });
}

export async function PUT(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const packs = normalizePacks(body.packs);

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload = { sms_template_packs: packs, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
    : await supabase.from('user_settings').insert({ user_id: user.id, ...payload });

  if (error) {
    console.error('[sms/template-packs]', error);
    return NextResponse.json({ error: error.message, setupRequired: true }, { status: 500 });
  }

  return NextResponse.json({ packs });
}
