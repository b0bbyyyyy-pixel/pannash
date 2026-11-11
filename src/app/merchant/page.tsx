import { redirect } from 'next/navigation';
import { loadOwnerBrand } from '@/lib/merchantPortal/brand';
import { logMerchantEvent } from '@/lib/merchantPortal/events';
import {
  DEFAULT_PORTAL_NEEDS,
  maskEin,
  maskSsn,
  money,
  parsePortalNeeds,
} from '@/lib/merchantPortal/mask';
import { requireMerchantSession } from '@/lib/merchantPortal/session';
import { resolveMerchantStage, stageUpdatedAt } from '@/lib/merchantPortal/stages';
import MerchantPortalClient from './MerchantPortalClient';

export const dynamic = 'force-dynamic';

export default async function MerchantHomePage() {
  const session = await requireMerchantSession();
  if (!session) redirect('/merchant/login');

  const brand = await loadOwnerBrand(session.supabase, session.portal.user_id);
  const ud = session.lead.underwriting_data && typeof session.lead.underwriting_data === 'object'
    ? session.lead.underwriting_data as Record<string, unknown>
    : {};

  const [{ data: offers }, { data: submissions }, { data: files }] = await Promise.all([
    session.supabase
      .from('client_offer_portals')
      .select('token, title, created_at, expires_at, is_active')
      .eq('lead_id', session.portal.lead_id)
      .eq('user_id', session.portal.user_id)
      .neq('is_active', false),
    session.supabase
      .from('lender_submissions')
      .select('status')
      .eq('lead_id', session.portal.lead_id)
      .eq('user_id', session.portal.user_id)
      .limit(40),
    session.supabase
      .from('lead_attachments')
      .select('file_name, created_at, file_path')
      .eq('lead_id', session.portal.lead_id)
      .eq('user_id', session.portal.user_id)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const now = Date.now();
  const activeOffers = (offers || []).filter(row => {
    if (row.expires_at && new Date(row.expires_at).getTime() < now) return false;
    return true;
  });
  const hasPartnerSubmission = (submissions || []).some(row => {
    const status = String(row.status || '').toLowerCase();
    return status === 'sent' || status === 'awaiting response' || status.includes('awaiting');
  });
  const stage = resolveMerchantStage({
    leadStatus: session.lead.lead_status,
    stageMap: brand.stageMap,
    hasActiveOffer: activeOffers.length > 0,
    hasPartnerSubmission,
  });

  const storedNeeds = parsePortalNeeds(ud.portalNeeds);
  const needs = storedNeeds.length
    ? storedNeeds
    : (stage === 'Docs needed' ? DEFAULT_PORTAL_NEEDS : storedNeeds);

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

  const address = [
    ud.businessAddress,
    ud.businessCity,
    ud.businessState,
    ud.businessZip,
  ].filter(v => typeof v === 'string' && v.trim()).join(', ');

  const merchantFiles = (files || []).filter(f => {
    const path = String(f.file_path || '');
    return path.includes(`/${session.portal.lead_id}/`);
  }).map(f => ({ name: String(f.file_name || 'file'), at: String(f.created_at || '') }));

  return (
    <MerchantPortalClient
      brand={{
        businessName: brand.businessName,
        logoUrl: brand.logoUrl,
        phone: brand.phone,
        email: brand.email,
        disclaimer: brand.disclaimer,
      }}
      application={{
        legalName: String(session.lead.company || ud.legalName || ''),
        dba: String(ud.dba || ''),
        ownerName: String(session.lead.name || ''),
        email: String(session.lead.email || ''),
        phone: String(session.lead.phone || ud.businessPhone || ''),
        address,
        amount: money(ud.requestedAmount),
        useOfFunds: String(ud.purposeOfFunds || ''),
        submitted: String(session.lead.created_at || ''),
        ssn: maskSsn(ud.ssn),
        ein: maskEin(ud.ein),
      }}
      stage={stage}
      updatedAt={stageUpdatedAt(ud) || session.lead.created_at}
      needs={needs}
      files={merchantFiles}
      offers={activeOffers.map(o => ({
        token: String(o.token),
        title: String(o.title || 'Funding offer'),
        createdAt: String(o.created_at || ''),
      }))}
    />
  );
}
