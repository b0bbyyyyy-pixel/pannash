import { redirect } from 'next/navigation';
import { logMerchantEvent } from '@/lib/merchantPortal/events';
import { requireMerchantSession } from '@/lib/merchantPortal/session';
import { loadMerchantPortalView } from '@/lib/merchantPortal/view';
import MerchantPortalClient from './MerchantPortalClient';

export const dynamic = 'force-dynamic';

export default async function MerchantHomePage() {
  const session = await requireMerchantSession();
  if (!session) redirect('/merchant/login');

  const view = await loadMerchantPortalView(session.supabase, {
    userId: session.portal.user_id,
    lead: session.lead,
  });

  const viewedAt = session.portal.last_viewed_at ? new Date(session.portal.last_viewed_at).getTime() : 0;
  if (!viewedAt || Date.now() - viewedAt > 30 * 60 * 1000) {
    await session.supabase
      .from('merchant_portals')
      .update({ last_viewed_at: new Date().toISOString() })
      .eq('id', session.portal.id);
    await logMerchantEvent(session.supabase, {
      userId: session.portal.user_id,
      leadId: session.portal.lead_id,
      portalId: session.portal.id,
      eventType: 'view',
    });
  }

  return <MerchantPortalClient {...view} />;
}
