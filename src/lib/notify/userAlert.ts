import { Resend } from 'resend';
import webpush, { type PushSubscription } from 'web-push';
import { getTwilioCreds, publicAppUrl, serviceClient } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { rowToSettings } from '@/lib/mobile/settings';

export type UserAlert = {
  userId: string;
  email?: string | null;
  title: string;
  body: string;
  url: string;
  tag?: string;
};

function vapidReady() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

async function resolveEmail(userId: string, fallback?: string | null) {
  if (fallback) return fallback;
  try {
    const { data } = await serviceClient().auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Push, email, and optional SMS-to-me. Used for campaign failsafe (not inbound texts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyUserAlert(supabase: any, alert: UserAlert) {
  const { data: row } = await supabase
    .from('mobile_text_settings')
    .select('*')
    .eq('user_id', alert.userId)
    .maybeSingle();
  const settings = rowToSettings(row);
  const path = alert.url.startsWith('/') ? alert.url : `/${alert.url}`;
  const origin = publicAppUrl();

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
          title: alert.title,
          body: alert.body,
          url: path,
          tag: alert.tag || 'gostwrk',
        }),
      );
    } catch (err) {
      console.error('[alert] web push', err);
    }
  }

  const email = await resolveEmail(alert.userId, alert.email);
  if (email && process.env.RESEND_API_KEY) {
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'Gostwrk <onboarding@resend.dev>',
        to: email,
        subject: alert.title,
        html: `<p>${alert.body}</p><p><a href="${origin}${path}">Open campaign</a></p>`,
      });
    } catch (err) {
      console.error('[alert] email', err);
    }
  }

  const fallbackOn = process.env.MOBILE_SMS_FALLBACK === '1';
  if (settings.smsFallback && fallbackOn && settings.personalAlertNumber) {
    try {
      const creds = await getTwilioCreds(supabase, alert.userId);
      if (creds) {
        await sendTwilioSms(
          creds,
          settings.personalAlertNumber,
          `${alert.title}: ${alert.body}`,
        );
      }
    } catch (err) {
      console.error('[alert] sms fallback', err);
    }
  }
}
