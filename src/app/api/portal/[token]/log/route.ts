import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public endpoint — clients call this to log activity (no auth)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { eventType, eventData } = body;

    // Resolve portal id from token
    const { data: portal } = await supabase
      .from('client_offer_portals')
      .select('id')
      .eq('token', token)
      .single();

    if (!portal) return NextResponse.json({ ok: false }, { status: 404 });

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const ua = req.headers.get('user-agent') || null;

    await supabase.from('portal_activity_logs').insert({
      portal_id: portal.id,
      event_type: eventType,
      event_data: eventData || null,
      ip_address: ip,
      user_agent: ua,
    });

    // Update last_opened_at on every 'open' event
    if (eventType === 'open') {
      await supabase
        .from('client_offer_portals')
        .update({ last_opened_at: new Date().toISOString() })
        .eq('id', portal.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[portal/log]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
