import type { SupabaseClient } from '@supabase/supabase-js';

export type MerchantPortalEventType =
  | 'view'
  | 'upload'
  | 'needs_viewed'
  | 'offer_click'
  | 'contact_click'
  | 'link_sent'
  | 'link_requested'
  | 'revoked';

export async function logMerchantEvent(
  supabase: SupabaseClient,
  args: {
    userId: string;
    leadId: string;
    portalId?: string | null;
    eventType: MerchantPortalEventType;
    eventData?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  try {
    await supabase.from('merchant_portal_events').insert({
      user_id: args.userId,
      lead_id: args.leadId,
      portal_id: args.portalId || null,
      event_type: args.eventType,
      event_data: args.eventData || null,
      ip: args.ip || null,
      user_agent: args.userAgent || null,
    });
  } catch (err) {
    console.warn('[merchant-portal] event log failed', err instanceof Error ? err.message : 'error');
  }
}

export function requestIp(req: { headers: Headers }) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
}

export function eventLabel(type: string, data?: Record<string, unknown> | null): { title: string; detail?: string } {
  const amount = data && (data.amount ?? data.offerAmount ?? data.selectedAmount);
  const money = typeof amount === 'number' && Number.isFinite(amount)
    ? `$${Math.round(amount).toLocaleString('en-US')}`
    : typeof amount === 'string' && amount
      ? amount
      : '';
  switch (type) {
    case 'view':
      return { title: 'Merchant viewed portal' };
    case 'upload':
      return { title: data?.fileName ? `Uploaded ${String(data.fileName)}` : 'Uploaded bank statement' };
    case 'needs_viewed':
      return { title: 'Merchant viewed docs needed' };
    case 'offer_click':
    case 'open':
      return { title: 'Opened offer' };
    case 'contact_click':
      return { title: 'Clicked contact', detail: data?.channel ? String(data.channel) : undefined };
    case 'link_sent':
      return { title: 'Portal link sent', detail: data?.channel ? String(data.channel) : undefined };
    case 'link_requested':
      return { title: 'Merchant requested a new link' };
    case 'revoked':
      return { title: 'Merchant portal revoked' };
    case 'slider_change':
      return { title: money ? `Moved slider to ${money}` : 'Moved slider' };
    case 'submit':
      return { title: money ? `Clicked Accept – ${money}` : 'Clicked Accept' };
    case 'term_change':
      return { title: 'Changed offer term', detail: data?.label ? String(data.label) : undefined };
    default:
      return { title: type.replace(/_/g, ' ') };
  }
}
