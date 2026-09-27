import { NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { rowToSettings, settingsToRow } from '@/lib/mobile/settings';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { data: existing } = await supabase
    .from('mobile_text_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const settings = rowToSettings(existing);
  settings.pushSubscription = null;

  const { error } = await supabase
    .from('mobile_text_settings')
    .upsert(settingsToRow(user.id, settings), { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
