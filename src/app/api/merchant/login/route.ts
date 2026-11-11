import { NextRequest, NextResponse } from 'next/server';
import { last10, phonesOverlap } from '@/lib/leads/phone';
import { merchantAdmin } from '@/lib/merchantPortal/admin';
import { logMerchantEvent, requestIp } from '@/lib/merchantPortal/events';
import { loginGenericMessage, sendPortalLink } from '@/lib/merchantPortal/sendLink';
import { sendsInCurrentHour } from '@/lib/merchantPortal/tokens';

export const dynamic = 'force-dynamic';

const IP_MAX = 8;

export async function POST(req: NextRequest) {
  const generic = NextResponse.json({ ok: true, message: loginGenericMessage() });
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const mobile = String(body.mobile || body.phone || '').trim();
    const ip = requestIp(req);
    const supabase = merchantAdmin();

    if (ip) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('merchant_portal_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'link_requested')
        .eq('ip', ip)
        .gte('created_at', since);
      if ((count || 0) >= IP_MAX) return generic;
    }

    if (!email && last10(mobile).length !== 10) return generic;

    let lead: { id: string; user_id: string } | null = null;
    if (email) {
      const { data } = await supabase
        .from('leads')
        .select('id, user_id, email')
        .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
        .limit(20);
      const match = (data || []).find(row => String(row.email || '').trim().toLowerCase() === email);
      if (match) lead = { id: match.id, user_id: match.user_id };
    }
    if (!lead && last10(mobile).length === 10) {
      const digits = last10(mobile);
      const pattern = `%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}%`;
      const { data } = await supabase
        .from('leads')
        .select('id, user_id, phone, phone_e164')
        .or(`phone.ilike.${pattern},phone_e164.ilike.${pattern}`)
        .limit(20);
      const match = (data || []).find(row => phonesOverlap(row.phone, mobile) || phonesOverlap(row.phone_e164, mobile));
      if (match) lead = { id: match.id, user_id: match.user_id };
    }
    if (!lead) return generic;

    const { data: portal } = await supabase
      .from('merchant_portals')
      .select('id, last_link_sent_at, link_sends_last_hour')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!portal) return generic;
    if (sendsInCurrentHour(portal) >= 3) return generic;

    await logMerchantEvent(supabase, {
      userId: lead.user_id,
      leadId: lead.id,
      portalId: portal.id,
      eventType: 'link_requested',
      ip,
      userAgent: req.headers.get('user-agent'),
    });

    await sendPortalLink({
      userId: lead.user_id,
      leadId: lead.id,
      email: true,
    });
  } catch (err) {
    console.warn('[merchant-portal] login', err instanceof Error ? err.message : 'error');
  }
  return generic;
}
