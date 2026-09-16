/**
 * GET  /api/telephony/settings — fetch dialer settings (defaults if none saved)
 * PUT  /api/telephony/settings — upsert dialer settings
 *
 * Twilio credentials are NOT here — they stay in phone_connections
 * (managed at /settings/phone).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTelephonySettings, DEFAULT_SETTINGS } from '@/lib/telephony/twilio';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = await getTelephonySettings(supabase, user.id);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[telephony/settings GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // Whitelist — only known settings keys are persisted
    const allowed: Record<string, unknown> = {};
    const keys = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];
    for (const k of keys) {
      if (k in body) allowed[k] = body[k];
    }

    // Basic validation
    if ('wrap_seconds' in allowed) {
      const w = Number(allowed.wrap_seconds);
      if (isNaN(w) || w < 0 || w > 30) {
        return NextResponse.json({ error: 'wrap_seconds must be 0–30' }, { status: 400 });
      }
      allowed.wrap_seconds = w;
    }
    if ('sip_uri' in allowed && allowed.sip_uri) {
      const uri = String(allowed.sip_uri).trim();
      if (!uri.startsWith('sip:')) {
        return NextResponse.json({ error: 'SIP URI must start with sip:' }, { status: 400 });
      }
      allowed.sip_uri = uri;
    }
    for (const timeKey of ['calling_window_start', 'calling_window_end'] as const) {
      if (timeKey in allowed && !/^\d{2}:\d{2}$/.test(String(allowed[timeKey]))) {
        return NextResponse.json({ error: `${timeKey} must be HH:MM` }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('telephony_settings')
      .upsert({ user_id: user.id, ...allowed, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) {
      console.error('[telephony/settings PUT]', error);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('[telephony/settings PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
