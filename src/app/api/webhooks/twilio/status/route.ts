import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatTwilioSmsError, mapTwilioStatus, fetchTwilioSmsBody } from '@/lib/telephony/sms';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import {
  recordOutboundInboxSms,
  recoverOutboundSmsBody,
  isPlaceholderSmsBody,
} from '@/lib/inbox/recordOutboundSms';
import { onDripDeliveryFailed } from '@/lib/smsDrip/failsafe';

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
      .select('id, lead_id, body');

    if (updateErr) {
      console.error('[SMS Status] inbox_messages update failed', messageSid, updateErr);
    }

    const { data: queueItem } = await supabase
      .from('sms_queue')
      .select('id, lead_id, campaign_lead_id, sms_body')
      .eq('twilio_sid', messageSid)
      .maybeSingle();

    const leadIdForCreds = updated?.[0]?.lead_id ?? queueItem?.lead_id ?? null;
    let recoveredBody = await recoverOutboundSmsBody(supabase, messageSid, body || queueItem?.sms_body);

    if (!recoveredBody && (leadIdForCreds || updated?.length)) {
      let userId: string | null = null;
      if (leadIdForCreds) {
        const { data: lead } = await supabase
          .from('leads')
          .select('user_id')
          .eq('id', leadIdForCreds)
          .maybeSingle();
        userId = lead?.user_id ?? null;
      }
      if (userId) {
        const creds = await getTwilioCreds(supabase, userId);
        if (creds) {
          try {
            recoveredBody = await fetchTwilioSmsBody(creds, messageSid);
          } catch (err) {
            console.warn('[SMS Status] Twilio body fetch failed', messageSid, err);
          }
        }
      }
    }

    if (recoveredBody && updated?.length) {
      const placeholders = updated.filter(row => isPlaceholderSmsBody(row.body));
      if (placeholders.length) {
        await supabase
          .from('inbox_messages')
          .update({ body: recoveredBody })
          .eq('twilio_sid', messageSid);
      }
    }

    if (!updated?.length) {
      console.warn('[SMS Status] No inbox_messages row for SID', messageSid, 'status', messageStatus, 'error', errorCode || '(none)');

      let leadId: string | null = queueItem?.lead_id ?? null;
      let storedBody = recoveredBody;

      if (!leadId || !storedBody) {
        const { data: smsMsg } = await supabase
          .from('sms_messages')
          .select('body, campaign_lead_id')
          .eq('twilio_sid', messageSid)
          .maybeSingle();
        if (smsMsg?.body && !storedBody) storedBody = smsMsg.body;
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

      if (!storedBody && userId) {
        const creds = await getTwilioCreds(supabase, userId);
        if (creds) {
          try {
            storedBody = await fetchTwilioSmsBody(creds, messageSid);
          } catch (err) {
            console.warn('[SMS Status] Twilio body fetch failed', messageSid, err);
          }
        }
      }

      // Never create a thread bubble with a fake "(undelivered)" body.
      // The send path writes the real text once Twilio returns the SID.
      if (storedBody && (leadId || to)) {
        const recorded = await recordOutboundInboxSms(supabase, {
          userId,
          leadId,
          toPhone: to,
          body: storedBody,
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
        console.warn('[SMS Status] Waiting for send path to record SID', messageSid, { to, from, errorCode, leadId });
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

    if (inboxStatus === 'failed') {
      const leadId = updated?.[0]?.lead_id ?? queueItem?.lead_id ?? null;
      await onDripDeliveryFailed(supabase, {
        twilioSid: messageSid,
        leadId,
        error: inboxError,
      });
    }

    return emptyTwiml();
  } catch (error: unknown) {
    console.error('[SMS Status] Error:', error);
    return emptyTwiml();
  }
}
