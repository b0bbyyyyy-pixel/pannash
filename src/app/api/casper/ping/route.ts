import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPingSettings, recoverPingRepliesFromInbox, sendCasperPing } from '@/lib/casper/ping';
import { catchUpUnansweredPing, runCasperPingReply } from '@/lib/casper/pingReply';

export const maxDuration = 60;

export const dynamic = 'force-dynamic';

async function client() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function GET() {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getPingSettings(supabase, user.id);
  if (settings.phone) {
    try { await recoverPingRepliesFromInbox(supabase, user.id, settings.phone); } catch { /* ignore */ }
  }
  const { data: messages, error } = await supabase
    .from('casper_ping_messages')
    .select('id, direction, body, kind, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(80);

  return NextResponse.json({
    ...settings,
    messages: messages ?? [],
    setupRequired: !!error && /casper_ping|schema cache/i.test(error.message || ''),
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (enabled !== undefined) payload.casper_ping_enabled = enabled;
  if (phone !== undefined) payload.casper_ping_phone = phone || null;

  const { error } = existing
    ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
    : await supabase.from('user_settings').insert({ user_id: user.id, ...payload });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (phone !== undefined) {
    try {
      await supabase.from('mobile_text_settings').upsert({
        user_id: user.id,
        personal_alert_number: phone || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch {
      // optional table
    }
  }

  return NextResponse.json(await getPingSettings(supabase, user.id));
}

export async function POST(req: NextRequest) {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.body || '').trim();
  const test = body.test === true;

  if (test) {
    const sent = await sendCasperPing(supabase, {
      userId: user.id,
      body: text || 'Casper here — ping is on. Text me back on this thread anytime.',
      kind: 'test',
      requireEnabled: false,
    });
    return NextResponse.json(sent, { status: sent.sent ? 200 : 400 });
  }

  if (body.catchUp === true) {
    const result = await catchUpUnansweredPing(supabase, user.id);
    return NextResponse.json(result);
  }

  if (!text) return NextResponse.json({ error: 'Message required' }, { status: 400 });
  const result = await runCasperPingReply(supabase, { userId: user.id, body: text });
  return NextResponse.json(result, { status: result.replied ? 200 : 400 });
}
