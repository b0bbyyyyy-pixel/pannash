import webpush, { type PushSubscription } from 'web-push';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { rowToSettings } from '@/lib/mobile/settings';

type NotifyArgs = {
  userId: string;
  threadId: string;
  name?: string | null;
  body: string;
};

function vapidReady() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

/**
 * Inbound merchant SMS alert. Web Push when the user subscribed.
 * SMS-to-me only when the user toggle is on AND MOBILE_SMS_FALLBACK=1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyUserOfInboundSms(supabase: any, args: NotifyArgs) {
  const { data: row, error } = await supabase
    .from('mobile_text_settings')
    .select('*')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error) {
    console.error('[mobile] settings read', error.message);
    return;
  }

  const settings = rowToSettings(row);
  const who = (args.name || 'Someone').trim();
  const preview = args.body.length > 140 ? `${args.body.slice(0, 137)}…` : args.body;
  const url = `/m/text/${args.threadId}`;

  if (settings.webPush && settings.pushSubscription && vapidReady()) {
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      );
      await webpush.sendNotification(
        settings.pushSubscription as unknown as PushSubscription,
        JSON.stringify({
          title: who,
          body: preview,
          url,
        }),
      );
    } catch (err) {
      console.error('[mobile] web push', err);
    }
  }

  const fallbackOn = process.env.MOBILE_SMS_FALLBACK === '1';
  if (settings.smsFallback && fallbackOn && settings.personalAlertNumber) {
    try {
      const creds = await getTwilioCreds(supabase, args.userId);
      if (creds) {
        await sendTwilioSms(
          creds,
          settings.personalAlertNumber,
          `Text from ${who}: ${preview}`,
        );
      }
    } catch (err) {
      console.error('[mobile] sms fallback', err);
    }
  }
}
