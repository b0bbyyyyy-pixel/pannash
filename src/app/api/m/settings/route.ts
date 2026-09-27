import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import {
  MOBILE_TEXT_DEFAULTS,
  rowToSettings,
  settingsToRow,
  type MobileTextSettings,
} from '@/lib/mobile/settings';

export const dynamic = 'force-dynamic';

function withLandingCookie(res: NextResponse, phoneLanding: boolean) {
  res.cookies.set('gostwrk_m_landing', phoneLanding ? '1' : '0', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}

export async function GET() {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('mobile_text_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error && !String(error.message).includes('mobile_text_settings')) {
    console.error('[m/settings GET]', error.message);
  }

  const settings = error ? MOBILE_TEXT_DEFAULTS : rowToSettings(data);
  return withLandingCookie(NextResponse.json({
    ...settings,
    pushSubscription: undefined,
    hasPushSubscription: Boolean(settings.pushSubscription),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    smsFallbackEnv: process.env.MOBILE_SMS_FALLBACK === '1',
    setupRequired: Boolean(error),
  }), settings.phoneLanding);
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { data: existing } = await supabase
    .from('mobile_text_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const current = rowToSettings(existing);
  const next: MobileTextSettings = {
    phoneLanding: typeof body.phoneLanding === 'boolean' ? body.phoneLanding : current.phoneLanding,
    webPush: typeof body.webPush === 'boolean' ? body.webPush : current.webPush,
    smsFallback: typeof body.smsFallback === 'boolean' ? body.smsFallback : current.smsFallback,
    personalAlertNumber: typeof body.personalAlertNumber === 'string'
      ? body.personalAlertNumber.trim()
      : current.personalAlertNumber,
    pushSubscription: current.pushSubscription,
  };

  const { error } = await supabase
    .from('mobile_text_settings')
    .upsert(settingsToRow(user.id, next), { onConflict: 'user_id' });

  if (error) {
    console.error('[m/settings PATCH]', error.message);
    return NextResponse.json({
      error: 'Run add-mobile-text.sql in Supabase, then save again.',
      setupRequired: true,
    }, { status: 500 });
  }

  return withLandingCookie(NextResponse.json({
    phoneLanding: next.phoneLanding,
    webPush: next.webPush,
    smsFallback: next.smsFallback,
    personalAlertNumber: next.personalAlertNumber,
  }), next.phoneLanding);
}
