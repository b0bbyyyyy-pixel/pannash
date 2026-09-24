import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatTwilioSmsError, mapTwilioStatus } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function emptyTwiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' }
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const messageSid = String(formData.get('MessageSid') ?? formData.get('SmsSid') ?? '');
    const messageStatus = String(formData.get('MessageStatus') ?? formData.get('SmsStatus') ?? '');
    const to = String(formData.get('To') ?? '');
    const from = String(formData.get('From') ?? '');
    const body = String(formData.get('Body') ?? '');
    const errorCode = String(formData.get('ErrorCode') ?? '');
    const errorMessage = String(formData.get('ErrorMessage') ?? '');

    console.log('[SMS Status]', {
      sid: messageSid,
      status: messageStatus,
      to,
      errorCode: errorCode || undefined,
    });

    if (!messageSid || !messageStatus) {
      return emptyTwiml();
    }

    const codeNum = errorCode ? Number(errorCode) : null;
    const inboxStatus = mapTwilioStatus(messageStatus, Number.isFinite(codeNum) ? codeNum : null);
    const inboxError = formatTwilioSmsError(errorCode || null, errorMessage || null)
      ?? (inboxStatus === 'failed' ? (errorMessage || messageStatus) : null);

    const { data: updated, error: updateErr } = await supabase
      .from('inbox_messages')
      .update({
        status: inboxStatus,
        ...(inboxError ? { error_message: inboxError } : {}),
      })
      .eq('twilio_sid', messageSid)
      .select('id');

    if (updateErr) {
      console.error('[SMS Status] inbox_messages update failed', messageSid, updateErr);
    }

    const { data: queueItem } = await supabase
      .from('sms_queue')
      .select('id, lead_id, campaign_lead_id, sms_body')
      .eq('twilio_sid', messageSid)
      .maybeSingle();

    if (!updated?.length) {
      console.warn('[SMS Status] No inbox_messages row for SID', messageSid, 'status', messageStatus, 'error', errorCode || '(none)');

      let leadId: string | null = queueItem?.lead_id ?? null;
      let storedBody = body || queueItem?.sms_body || '';

      if (!leadId || !storedBody) {
        const { data: smsMsg } = await supabase
          .from('sms_messages')
          .select('body, campaign_lead_id')
          .eq('twilio_sid', messageSid)
          .maybeSingle();
        if (smsMsg?.body) storedBody = storedBody || smsMsg.body;
        if (!leadId && smsMsg?.campaign_lead_id) {
          const { data: cl } = await supabase
            .from('campaign_leads')
            .select('lead_id')
            .eq('id', smsMsg.campaign_lead_id)
            .maybeSingle();
          leadId = cl?.lead_id ?? null;
        }
      }

      let userId: string | null = null;
      if (leadId) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, user_id')
          .eq('id', leadId)
          .maybeSingle();
        userId = lead?.user_id ?? null;
      }

      if (storedBody || leadId || to) {
        const recorded = await recordOutboundInboxSms(supabase, {
          userId,
          leadId,
          toPhone: to,
          body: storedBody || '(undelivered)',
          twilioSid: messageSid,
          status: inboxStatus,
          errorMessage: inboxError,
          sentBy: 'system',
          bumpLastMessageAt: false,
        });
        if (recorded) {
          console.log('[SMS Status] Reconciled missing inbox row', messageSid, recorded);
        } else {
          console.error('[SMS Status] Could not reconcile SID', messageSid, { to, from, errorCode, leadId });
        }
      } else {
        console.error('[SMS Status] Dropped status with no inbox row and no To/body/lead', messageSid, { from, errorCode });
      }
    }

    if (queueItem) {
      let newStatus = 'sent';
      let campaignLeadStatus = 'sent';

      if (messageStatus === 'failed' || messageStatus === 'undelivered') {
        newStatus = 'failed';
        campaignLeadStatus = 'failed';
      } else if (messageStatus === 'delivered') {
        newStatus = 'sent';
        campaignLeadStatus = 'delivered';
      }

      await supabase
        .from('sms_queue')
        .update({ status: newStatus })
        .eq('id', queueItem.id);

      await supabase
        .from('campaign_leads')
        .update({
          status: campaignLeadStatus,
          delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : undefined
        })
        .eq('id', queueItem.campaign_lead_id);

      console.log(`[SMS Status] Updated queue ${queueItem.id} and campaign_lead ${queueItem.campaign_lead_id} to ${campaignLeadStatus}`);
    }

    return emptyTwiml();
  } catch (error: unknown) {
    console.error('[SMS Status] Error:', error);
    return emptyTwiml();
  }
}
