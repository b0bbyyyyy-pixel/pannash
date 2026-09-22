import twilio from 'twilio';
import { toE164 } from '@/lib/dialer/e164';
import { publicAppUrl, type TwilioCreds } from '@/lib/telephony/twilio';

export type SmsSendResult = {
  sid: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  error?: string;
};

function mapTwilioStatus(status: string | undefined, errorCode?: number | null): SmsSendResult['status'] {
  if (errorCode || status === 'failed' || status === 'undelivered') return 'failed';
  if (status === 'delivered') return 'delivered';
  if (status === 'sent') return 'sent';
  return 'queued';
}

/** Send one SMS. Always E.164. Uses Messaging Service when A2P/10DLC is approved. */
export async function sendTwilioSms(
  creds: TwilioCreds,
  toRaw: string,
  body: string,
): Promise<SmsSendResult> {
  const to = toE164(toRaw);
  if (!to) {
    throw new Error(`Invalid destination number: ${toRaw || '(empty)'}. Use a 10-digit US number.`);
  }

  const from = toE164(creds.fromNumber) || creds.fromNumber || '';
  const messagingServiceSid = creds.messagingServiceSid?.trim() || '';

  if (!messagingServiceSid && !from) {
    throw new Error('No Twilio From number or Messaging Service SID configured.');
  }

  const client = twilio(creds.accountSid, creds.authToken);
  const statusCallback = `${publicAppUrl()}/api/webhooks/twilio/status`;

  const created = await client.messages.create({
    body,
    to,
    statusCallback,
    ...(messagingServiceSid ? { messagingServiceSid } : { from }),
  });
  let status = created.status;
  let errorCode = created.errorCode;
  let errorMessage = created.errorMessage;

  try {
    const fresh = await client.messages(created.sid).fetch();
    status = fresh.status;
    errorCode = fresh.errorCode;
    errorMessage = fresh.errorMessage;
  } catch {
    // fetch is best-effort — status callback will catch later failures
  }

  const mapped = mapTwilioStatus(status, errorCode);
  const error = errorCode
    ? `${errorCode}${errorMessage ? `: ${errorMessage}` : ''}`
    : undefined;

  return { sid: created.sid, status: mapped, error };
}
