import { NextRequest, NextResponse } from 'next/server';
import { offerPortalAdmin } from '@/lib/portal/offerAdmin';

// Public endpoint — clients call this to log activity (token-gated, service role)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { eventType, eventData } = body;
    const supabase = offerPortalAdmin();

    // Resolve portal id from token
    const { data: portal } = await supabase
      .from('client_offer_portals')
      .select('id')
      .eq('token', token)
      .maybeSingle();

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

    if (eventType === 'submit') {
      try {
        const { data: row } = await supabase
          .from('client_offer_portals')
          .select('user_id, lead_id, lead_name')
          .eq('id', portal.id)
          .maybeSingle();
        if (row?.user_id) {
          const amount = eventData?.amount ?? eventData?.offerAmount ?? eventData?.selectedAmount;
          const money = typeof amount === 'number' && Number.isFinite(amount)
            ? `$${Math.round(amount).toLocaleString('en-US')}`
            : typeof amount === 'string' && amount ? amount : '';
          const who = String(row.lead_name || 'a lead').trim() || 'a lead';
          const { notifyLeadActivity } = await import('@/lib/casper/ping');
          await notifyLeadActivity(supabase, {
            userId: row.user_id,
            body: `${who} clicked Accept on their offer${money ? ` – ${money}` : ''}.`,
          });
        }
      } catch (pingErr) {
        console.warn('[portal/log] accept ping failed');
        void pingErr;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[portal/log]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
