import { sendLeadEmail } from '@/lib/email/sendLeadEmail';
import { smsSendBlockReason } from '@/lib/leads/dnc';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { merchantAdmin } from '@/lib/merchantPortal/admin';
import { loadOwnerBrand } from '@/lib/merchantPortal/brand';
import { logMerchantEvent } from '@/lib/merchantPortal/events';
import {
  createPortal,
  markLinkSent,
  merchantLoginUrl,
  sendsInCurrentHour,
  type MerchantPortalRow,
} from '@/lib/merchantPortal/tokens';

const GENERIC_LOGIN = 'If we have an application for that email or mobile, we sent a new link.';

export function loginGenericMessage() {
  return GENERIC_LOGIN;
}

function emailHtml(businessName: string, url: string, disclaimer: string, loginUrl: string) {
  const name = businessName || 'your broker';
  return [
    `Thanks for applying with ${name}.`,
    '',
    'Track your file, upload documents, and see offers when funding partners send them.',
    '',
    disclaimer,
    '',
    `<p><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px">Open your portal</a></p>`,
    '',
    `This link is private to you. Expires in 30 days. Request a new one any time at ${loginUrl}.`,
  ].join('\n');
}

function smsBody(businessName: string, url: string) {
  const prefix = businessName ? `${businessName}: ` : '';
  return `${prefix}Thanks for applying. Track your file and upload docs here: ${url} Reply STOP to opt out.`;
}

export async function sendPortalLink(args: {
  userId: string;
  leadId: string;
  email?: boolean;
  sms?: boolean;
}): Promise<{ url: string; portalId: string; emailed: boolean; texted: boolean }> {
  const supabase = merchantAdmin();
  const { data: latest } = await supabase
    .from('merchant_portals')
    .select('last_link_sent_at, link_sends_last_hour')
    .eq('lead_id', args.leadId)
    .eq('user_id', args.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && sendsInCurrentHour(latest as MerchantPortalRow) >= 3) {
    throw new Error('rate_limited');
  }

  const created = await createPortal(supabase, { userId: args.userId, leadId: args.leadId });
  const brand = await loadOwnerBrand(supabase, args.userId);
  const { data: lead } = await supabase
    .from('leads')
    .select('id, email, phone, sms_opt_out, dnc, lead_status, underwriting_data')
    .eq('id', args.leadId)
    .eq('user_id', args.userId)
    .maybeSingle();
  if (!lead) throw new Error('lead_missing');

  let emailed = false;
  let texted = false;
  if (args.email !== false && lead.email) {
    const sent = await sendLeadEmail(supabase, {
      userId: args.userId,
      leadId: args.leadId,
      to: String(lead.email),
      subject: brand.businessName
        ? `Your ${brand.businessName} application portal`
        : 'Your application portal',
      html: emailHtml(brand.businessName, created.url, brand.disclaimer, merchantLoginUrl(created.origin)),
    });
    emailed = !!sent.sent;
  }

  const ud = lead.underwriting_data && typeof lead.underwriting_data === 'object'
    ? lead.underwriting_data as { smsConsent?: { optIn?: boolean } }
    : {};
  const consented = args.sms === true || ud.smsConsent?.optIn === true;
  if (consented && lead.phone) {
    const blocked = await smsSendBlockReason(supabase, lead);
    if (!blocked) {
      const creds = await getTwilioCreds(supabase, args.userId);
      if (creds) {
        const result = await sendTwilioSms(creds, String(lead.phone), smsBody(brand.businessName, created.url));
        texted = result.status !== 'failed';
      }
    }
  }

  await markLinkSent(supabase, created.portalId, latest || {});
  const channels = [emailed && 'email', texted && 'sms'].filter(Boolean);
  await logMerchantEvent(supabase, {
    userId: args.userId,
    leadId: args.leadId,
    portalId: created.portalId,
    eventType: 'link_sent',
    eventData: { channel: channels.join(',') || 'none' },
  });
  return { url: created.url, portalId: created.portalId, emailed, texted };
}
