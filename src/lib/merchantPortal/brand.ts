import { getBusinessName } from '@/lib/casper/businessName';
import { mailboxEmail } from '@/lib/email-from';
import { pickSendConnection, type SendConnection } from '@/lib/email/sendAccounts';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { parseStageMap, type MerchantStage } from '@/lib/merchantPortal/stages';
import { BROKER_DISCLAIMER, withBusinessName } from '@/lib/merchantPortal/mask';

export type OwnerBrand = {
  businessName: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  disclaimer: string;
  portalEnabled: boolean;
  stageMap: Record<string, MerchantStage>;
};

export async function loadOwnerBrand(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<OwnerBrand> {
  const biz = await getBusinessName(supabase, userId);
  let portalEnabled = true;
  let stageMap = parseStageMap(null);
  let settingsEmail = '';
  try {
    const full = await supabase
      .from('user_settings')
      .select('portal_enabled, portal_stage_map, email_from_name, preferred_send_connection_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!full.error) {
      portalEnabled = full.data?.portal_enabled !== false;
      stageMap = parseStageMap(full.data?.portal_stage_map);
    }
  } catch {
    /* columns may not exist until SQL is run */
  }

  const { data: emailConns } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', userId);
  const preferred = await supabase
    .from('user_settings')
    .select('preferred_send_connection_id')
    .eq('user_id', userId)
    .maybeSingle();
  const picked = pickSendConnection(
    emailConns as SendConnection[] | null,
    preferred.data?.preferred_send_connection_id,
  );
  settingsEmail = mailboxEmail(picked) || '';

  const creds = await getTwilioCreds(supabase, userId);
  let logoUrl: string | null = null;
  try {
    const { data } = await supabase
      .from('automation_settings')
      .select('portal_defaults')
      .eq('user_id', userId)
      .maybeSingle();
    const defaults = data?.portal_defaults && typeof data.portal_defaults === 'object'
      ? data.portal_defaults as { logoUrl?: string }
      : null;
    logoUrl = defaults?.logoUrl?.trim() || null;
  } catch {
    /* optional */
  }

  const businessName = biz.name;
  return {
    businessName,
    logoUrl,
    phone: creds?.fromNumber || '',
    email: settingsEmail,
    disclaimer: withBusinessName(BROKER_DISCLAIMER, businessName),
    portalEnabled,
    stageMap,
  };
}
