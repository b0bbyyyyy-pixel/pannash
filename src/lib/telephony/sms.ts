import twilio from 'twilio';
import { toE164 } from '@/lib/dialer/e164';
import { publicAppUrl, type TwilioCreds } from '@/lib/telephony/twilio';

export type SmsSendResult = {
  sid: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  error?: string;
};

const ERROR_COPY: Record<number, string> = {
  21704: 'Messaging Service has no numbers. Add your Twilio number in Console → Messaging → Services → Sender Pool.',
  21705: 'Messaging Service SID is invalid. It must start with MG.',
  21211: 'Invalid destination number.',
  21610: 'Recipient opted out (STOP).',
  21614: 'Not a valid mobile number.',
  30007: 'Carrier blocked this message (content / spam filter). Try Customer Care wording with One Funding: and STOP/HELP.',
  30034: 'A2P 10DLC not registered for this number. Send through the approved Messaging Service.',
  30032: 'Toll-free / A2P not verified.',
  21408: 'Permission to send SMS to this region is not enabled on the Twilio account.',
};

export function mapTwilioStatus(status: string | undefined, errorCode?: number | null): SmsSendResult['status'] {
  if (errorCode || status === 'failed' || status === 'undelivered') return 'failed';
  if (status === 'delivered') return 'delivered';
  // Twilio's create() returns queued/accepted/sending — the carrier already has it.
  // Reserve "queued" for messages we never handed to Twilio.
  if (status === 'sent' || status === 'queued' || status === 'accepted' || status === 'sending') return 'sent';
  return 'queued';
}

export function formatTwilioSmsError(errorCode?: number | string | null, errorMessage?: string | null): string | undefined {
  if (errorCode == null || errorCode === '') {
    return errorMessage?.trim() || undefined;
  }
  const code = Number(errorCode);
  const known = Number.isFinite(code) ? ERROR_COPY[code] : undefined;
  if (known) return `${code}: ${known}`;
  if (errorMessage) return `${errorCode}: ${errorMessage}`;
  return String(errorCode);
}

function formatError(errorCode?: number | null, errorMessage?: string | null): string | undefined {
  return formatTwilioSmsError(errorCode, errorMessage);
}

function twilioErrorCode(err: unknown): number | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const n = Number((err as { code?: unknown }).code);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

  const send = async (useService: boolean) => {
    return client.messages.create({
      body,
      to,
      statusCallback,
      ...(useService && messagingServiceSid ? { messagingServiceSid } : {}),
      ...(from ? { from } : {}),
    });
  };

  let created;
  try {
    // Prefer service + From together (A2P). If the service pool is empty, Twilio returns 21704.
    created = await send(Boolean(messagingServiceSid));
  } catch (err) {
    const code = twilioErrorCode(err);
    if (code === 21704 && from) {
      created = await send(false);
    } else {
      const message = err instanceof Error ? err.message : 'Twilio error';
      throw new Error(formatError(code, message) || message);
    }
  }

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

  // Async 21704: Twilio accepted the request, then failed the message.
  if ((errorCode === 21704 || status === 'failed') && errorCode === 21704 && from && messagingServiceSid) {
    try {
      created = await send(false);
      const fresh = await client.messages(created.sid).fetch();
      status = fresh.status;
      errorCode = fresh.errorCode;
      errorMessage = fresh.errorMessage;
    } catch {
      // keep original failure
    }
  }

  const mapped = mapTwilioStatus(status, errorCode);
  return {
    sid: created.sid,
    status: mapped,
    error: formatError(errorCode, errorMessage),
  };
}

/** Re-fetch Twilio for messages still in-flight so Inbox can show delivered/failed without the webhook. */
export async function refreshSmsStatuses(
  creds: TwilioCreds,
  rows: { id: string; twilio_sid: string | null; status: string }[],
): Promise<{ id: string; status: SmsSendResult['status']; error?: string }[]> {
  const pending = rows.filter(m =>
    m.twilio_sid && (m.status === 'queued' || m.status === 'sent' || m.status === 'accepted' || m.status === 'sending')
  );
  if (!pending.length) return [];

  const client = twilio(creds.accountSid, creds.authToken);
  const updates: { id: string; status: SmsSendResult['status']; error?: string }[] = [];

  for (const m of pending.slice(-12)) {
    try {
      const fresh = await client.messages(m.twilio_sid!).fetch();
      const status = mapTwilioStatus(fresh.status, fresh.errorCode);
      const error = formatError(fresh.errorCode, fresh.errorMessage);
      if (status !== m.status || error) updates.push({ id: m.id, status, error });
    } catch {
      // SID unknown / network — leave as-is
    }
  }
  return updates;
}

/** Point the Twilio number + Messaging Service at our inbound SMS webhook so replies hit Inbox. */
export async function configureInboundSmsWebhooks(creds: TwilioCreds): Promise<{ smsUrl: string; ok: boolean; error?: string }> {
  const smsUrl = `${publicAppUrl()}/api/webhooks/twilio`;
  const client = twilio(creds.accountSid, creds.authToken);
  const from = toE164(creds.fromNumber) || creds.fromNumber;

  try {
    if (from) {
      const nums = await client.incomingPhoneNumbers.list({ phoneNumber: from, limit: 1 });
      const match = nums[0] ?? (await client.incomingPhoneNumbers.list({ limit: 20 }))
        .find(n => toE164(n.phoneNumber) === from);
      if (match) {
        await client.incomingPhoneNumbers(match.sid).update({
          smsUrl,
          smsMethod: 'POST',
        });
      }
    }

    if (creds.messagingServiceSid) {
      await client.messaging.v1.services(creds.messagingServiceSid).update({
        inboundRequestUrl: smsUrl,
        inboundMethod: 'POST',
      });
    }

    return { smsUrl, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not set inbound SMS webhook';
    return { smsUrl, ok: false, error: message };
  }
}
