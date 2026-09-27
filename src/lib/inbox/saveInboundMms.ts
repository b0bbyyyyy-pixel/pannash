import twilio from 'twilio';
import { getTwilioCreds, serviceClient, type TwilioCreds } from '@/lib/telephony/twilio';

export type MediaItem = {
  sid?: string;
  path?: string;
  type: string;
  savedAt?: string | null;
};

function isPhoto(type: string) {
  const t = type.toLowerCase().split(';')[0].trim();
  return t.startsWith('image/');
}

export function mediaSidFromUrl(url: string) {
  return url.match(/\/Media\/(ME[a-f0-9]+)/i)?.[1] ?? null;
}

/** Stream a Twilio-hosted MMS image. Nothing is written to Supabase. */
export async function downloadTwilioMedia(
  creds: TwilioCreds,
  messageSid: string,
  mediaSid: string,
): Promise<{ bytes: Uint8Array; type: string } | null> {
  const fileUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages/${messageSid}/Media/${mediaSid}`;
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');
  const res = await fetch(fileUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    console.error('[mms] Twilio media download', res.status, messageSid, mediaSid);
    return null;
  }
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return { bytes: new Uint8Array(await res.arrayBuffer()), type };
}

/**
 * Remember that an inbound text had a photo. The file stays on Twilio
 * until someone chooses Save to Documents.
 */
export async function saveInboundMms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    formData: FormData;
    userId: string;
    leadId: string;
    messageSid: string;
    numMedia: number;
  },
) {
  if (!args.messageSid || args.numMedia < 1) return;

  const items: MediaItem[] = [];
  for (let i = 0; i < args.numMedia; i++) {
    const url = String(args.formData.get(`MediaUrl${i}`) ?? '');
    const type = String(args.formData.get(`MediaContentType${i}`) ?? 'image/jpeg');
    const sid = mediaSidFromUrl(url);
    if (!sid || !isPhoto(type)) continue;
    items.push({ sid, type: type.split(';')[0].trim(), savedAt: null });
  }
  if (!items.length) return;

  const { error } = await supabase
    .from('inbox_messages')
    .update({ media_items: items })
    .eq('twilio_sid', args.messageSid);

  if (error) {
    console.error('[SMS Webhook] media_items update failed. Run add-inbox-mms.sql.', error.message);
  }
}

type ThreadMessage = {
  id: string;
  direction?: string;
  body?: string;
  twilio_sid?: string | null;
  media_items?: MediaItem[] | null;
};

function needsSid(m: ThreadMessage) {
  return Boolean(
    m.direction === 'inbound' &&
    m.twilio_sid &&
    !(Array.isArray(m.media_items) && m.media_items.some(item => item?.sid)) &&
    /^Attachment: \d+ Photo/.test(String(m.body ?? ''))
  );
}

function hasStoredCopy(m: ThreadMessage) {
  return Array.isArray(m.media_items) && m.media_items.some(item => item?.path && item.path.includes('/mms/'));
}

/** Point photo bubbles at Twilio, and delete any MMS file already copied into storage. */
export async function backfillInboundPhotos<T extends ThreadMessage>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  messages: T[],
): Promise<T[]> {
  const targets = messages.filter(m => needsSid(m) || hasStoredCopy(m));
  if (!targets.length) return messages;

  const creds = await getTwilioCreds(supabase, userId);
  if (!creds) return messages;

  const client = twilio(creds.accountSid, creds.authToken);
  const store = serviceClient();

  for (const message of targets) {
    if (!message.twilio_sid) continue;
    try {
      const list = await client.messages(message.twilio_sid).media.list({ limit: 10 });
      const previous = Array.isArray(message.media_items) ? message.media_items : [];
      const items: MediaItem[] = [];
      for (const media of list) {
        const type = String(media.contentType || 'image/jpeg');
        if (!isPhoto(type)) continue;
        const prev = previous[items.length];
        items.push({
          sid: media.sid,
          type: type.split(';')[0].trim(),
          savedAt: prev?.savedAt ?? null,
        });
      }
      if (!items.length) continue;

      const { error } = await supabase
        .from('inbox_messages')
        .update({ media_items: items })
        .eq('id', message.id);
      if (error) {
        console.error('[mms backfill] Run add-inbox-mms.sql.', error.message);
        continue;
      }
      message.media_items = items;

      const stale = previous.map(item => item?.path).filter((path): path is string => Boolean(path && path.includes('/mms/')));
      if (stale.length) {
        const { error: rmErr } = await store.storage.from('lead-attachments').remove(stale);
        if (rmErr) console.error('[mms backfill] remove stored copy', rmErr);
      }
    } catch (err) {
      console.error('[mms backfill]', message.twilio_sid, err);
    }
  }
  return messages;
}
