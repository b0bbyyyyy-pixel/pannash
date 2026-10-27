import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getBusinessName, normalizeBusinessName } from '@/lib/casper/businessName';
import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';

export const dynamic = 'force-dynamic';

async function userClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
}

function authOnlyClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET() {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const biz = await getBusinessName(supabase, user.id);
  return NextResponse.json({ business_name: biz.name, column_present: biz.columnPresent });
}

export async function POST(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nextName = normalizeBusinessName(body.business_name ?? body.name);
  const password = String(body.password ?? '');
  if (!nextName) return NextResponse.json({ error: 'Business name required' }, { status: 400 });
  if (!password) return NextResponse.json({ error: 'Could not update business name' }, { status: 400 });

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  try {
    const { count } = await admin
      .from('casper_settings_audit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('field', 'business_name_auth')
      .gte('changed_at', since);
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: 'Could not update business name' }, { status: 429 });
    }
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('casper_settings_audit', err);
  }

  const auth = authOnlyClient();
  const { error: signErr } = await auth.auth.signInWithPassword({ email: user.email, password });
  if (signErr) {
    try {
      await admin.from('casper_settings_audit').insert({
        user_id: user.id,
        field: 'business_name_auth',
        old_value: null,
        new_value: 'rejected',
        ip: clientIp(req),
      });
    } catch (err) {
      if (isMissingSchema(err)) warnMissingSchema('casper_settings_audit', err);
    }
    return NextResponse.json({ error: 'Could not update business name' }, { status: 400 });
  }

  const current = await getBusinessName(admin, user.id);
  const now = new Date().toISOString();
  const { data: saved, error } = await admin
    .from('user_settings')
    .upsert({
      user_id: user.id,
      business_name: nextName,
      business_name_updated_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' })
    .select('id, business_name')
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) {
      warnMissingSchema('business_name', error);
      return NextResponse.json({ error: 'Run add-casper-foundation.sql first' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Could not update business name' }, { status: 500 });
  }
  if (!saved) return NextResponse.json({ error: 'Could not update business name' }, { status: 500 });

  try {
    await admin.from('casper_settings_audit').insert({
      user_id: user.id,
      field: 'business_name',
      old_value: current.name || null,
      new_value: nextName,
      ip: clientIp(req),
    });
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('casper_settings_audit', err);
  }

  return NextResponse.json({ ok: true, business_name: nextName });
}
