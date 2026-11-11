import { NextRequest, NextResponse } from 'next/server';
import { logMerchantEvent, requestIp } from '@/lib/merchantPortal/events';
import { requireMerchantSession } from '@/lib/merchantPortal/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireMerchantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await logMerchantEvent(session.supabase, {
    userId: session.portal.user_id,
    leadId: session.portal.lead_id,
    portalId: session.portal.id,
    eventType: 'offer_click',
    eventData: { offerId: body.offerId || null, title: body.title || null },
    ip: requestIp(req),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}
