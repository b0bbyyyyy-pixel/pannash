import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { rowToSettings, settingsToRow } from '@/lib/mobile/settings';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const subscription = await req.json().catch(() => null);
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Missing push subscription' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('mobile_text_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const settings = rowToSettings(existing);
  settings.webPush = true;
  settings.pushSubscription = subscription;

  const { error } = await supabase
    .from('mobile_text_settings')
    .upsert(settingsToRow(user.id, settings), { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: 'Run add-mobile-text.sql in Supabase first.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
