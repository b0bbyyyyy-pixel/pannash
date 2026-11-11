import { NextRequest, NextResponse } from 'next/server';
import { logMerchantEvent, requestIp } from '@/lib/merchantPortal/events';
import { requireMerchantSession } from '@/lib/merchantPortal/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireMerchantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel || '').trim();
  if (!['call', 'text', 'email'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }
  await logMerchantEvent(session.supabase, {
    userId: session.portal.user_id,
    leadId: session.portal.lead_id,
    portalId: session.portal.id,
    eventType: 'contact_click',
    eventData: { channel },
    ip: requestIp(req),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}
