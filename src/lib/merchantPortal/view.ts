import { loadOwnerBrand } from '@/lib/merchantPortal/brand';
import {
  DEFAULT_PORTAL_NEEDS,
  maskEin,
  maskSsn,
  money,
  parsePortalNeeds,
  type PortalNeed,
} from '@/lib/merchantPortal/mask';
import { resolveMerchantStage, stageUpdatedAt, type MerchantStage } from '@/lib/merchantPortal/stages';

export type MerchantPortalView = {
  brand: { businessName: string; logoUrl: string | null; phone: string; email: string; disclaimer: string };
  application: {
    legalName: string;
    dba: string;
    ownerName: string;
    email: string;
    phone: string;
    address: string;
    amount: string;
    useOfFunds: string;
    submitted: string;
    ssn: string;
    ein: string;
  };
  stage: MerchantStage;
  updatedAt: string | null;
  needs: PortalNeed[];
  files: { name: string; at: string }[];
  offers: { token: string; title: string; createdAt: string }[];
};

export type MerchantViewLead = {
  id: string;
  user_id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  lead_status?: string | null;
  created_at?: string | null;
  underwriting_data?: unknown;
};

export async function loadMerchantPortalView(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { userId: string; lead: MerchantViewLead },
): Promise<MerchantPortalView> {
  const brand = await loadOwnerBrand(supabase, args.userId);
  const lead = args.lead;
  const ud = lead.underwriting_data && typeof lead.underwriting_data === 'object'
    ? lead.underwriting_data as Record<string, unknown>
    : {};

  const [{ data: offers }, { data: submissions }, { data: files }] = await Promise.all([
    supabase
      .from('client_offer_portals')
      .select('token, title, created_at, expires_at, is_active')
      .eq('lead_id', lead.id)
      .eq('user_id', args.userId)
      .neq('is_active', false),
    supabase
      .from('lender_submissions')
      .select('status')
      .eq('lead_id', lead.id)
      .eq('user_id', args.userId)
      .limit(40),
    supabase
      .from('lead_attachments')
      .select('file_name, created_at, file_path')
      .eq('lead_id', lead.id)
      .eq('user_id', args.userId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const now = Date.now();
  const activeOffers = (offers || []).filter((row: { expires_at?: string | null }) => {
    if (row.expires_at && new Date(row.expires_at).getTime() < now) return false;
    return true;
  });
  const hasPartnerSubmission = (submissions || []).some((row: { status?: string | null }) => {
    const status = String(row.status || '').toLowerCase();
    return status === 'sent' || status === 'awaiting response' || status.includes('awaiting');
  });
  const stage = resolveMerchantStage({
    leadStatus: lead.lead_status,
    stageMap: brand.stageMap,
    hasActiveOffer: activeOffers.length > 0,
    hasPartnerSubmission,
  });

  const storedNeeds = parsePortalNeeds(ud.portalNeeds);
  const needs = storedNeeds.length
    ? storedNeeds
    : (stage === 'Docs needed' ? DEFAULT_PORTAL_NEEDS : storedNeeds);

  const address = [
    ud.businessAddress,
    ud.businessCity,
    ud.businessState,
    ud.businessZip,
  ].filter(v => typeof v === 'string' && v.trim()).join(', ');

  const merchantFiles = (files || []).filter((f: { file_path?: string | null }) => {
    const path = String(f.file_path || '');
    return path.includes(`/${lead.id}/`);
  }).map((f: { file_name?: string | null; created_at?: string | null }) => ({
    name: String(f.file_name || 'file'),
    at: String(f.created_at || ''),
  }));

  return {
    brand: {
      businessName: brand.businessName,
      logoUrl: brand.logoUrl,
      phone: brand.phone,
      email: brand.email,
      disclaimer: brand.disclaimer,
    },
    application: {
      legalName: String(lead.company || ud.legalName || ''),
      dba: String(ud.dba || ''),
      ownerName: String(lead.name || ''),
      email: String(lead.email || ''),
      phone: String(lead.phone || ud.businessPhone || ''),
      address,
      amount: money(ud.requestedAmount),
      useOfFunds: String(ud.purposeOfFunds || ''),
      submitted: String(lead.created_at || ''),
      ssn: maskSsn(ud.ssn),
      ein: maskEin(ud.ein),
    },
    stage,
    updatedAt: stageUpdatedAt(ud) || lead.created_at || null,
    needs,
    files: merchantFiles,
    offers: activeOffers.map((o: { token?: unknown; title?: unknown; created_at?: unknown }) => ({
      token: String(o.token),
      title: String(o.title || 'Funding offer'),
      createdAt: String(o.created_at || ''),
    })),
  };
}
