import { toE164 } from '@/lib/dialer/e164';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { getTwilioCreds } from '@/lib/telephony/twilio';

export type PingKind = 'chat' | 'alert' | 'calendar' | 'needs_human' | 'docs' | 'test';

export type PingSettings = {
  enabled: boolean;
  phone: string;
};

export function pingDigits(raw: string | null | undefined) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const da = pingDigits(a);
  const db = pingDigits(b);
  return da.length === 10 && da === db;
}

export async function getPingSettings(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<PingSettings> {
  let enabled = false;
  let phone = '';

  try {
    const { data } = await supabase
      .from('user_settings')
      .select('casper_ping_enabled, casper_ping_phone')
      .eq('user_id', userId)
      .maybeSingle();
    enabled = !!data?.casper_ping_enabled;
    phone = String(data?.casper_ping_phone || '').trim();
  } catch {
    // columns not added yet
  }

  if (!phone) {
    try {
      const { data } = await supabase
        .from('mobile_text_settings')
        .select('personal_alert_number')
        .eq('user_id', userId)
        .maybeSingle();
      phone = String(data?.personal_alert_number || '').trim();
    } catch {
      // table optional
    }
  }

  return { enabled, phone };
}

export async function findUserByPingPhone(
  supabase: { from: (table: string) => any },
  from: string,
): Promise<string | null> {
  const digits = pingDigits(from);
  if (digits.length !== 10) return null;

  const { data: settings, error: settingsErr } = await supabase
    .from('user_settings')
    .select('user_id, casper_ping_phone');
  if (settingsErr) console.warn('[ping] settings lookup', settingsErr.message);
  for (const row of settings ?? []) {
    if (phonesMatch(row.casper_ping_phone, from)) return row.user_id as string;
  }

  const { data: mobile, error: mobileErr } = await supabase
    .from('mobile_text_settings')
    .select('user_id, personal_alert_number');
  if (mobileErr) console.warn('[ping] mobile lookup', mobileErr.message);
  for (const row of mobile ?? []) {
    if (phonesMatch(row.personal_alert_number, from)) return row.user_id as string;
  }

  return null;
}

/** Pull replies that were filed on a lead who shares your personal cell. */
export async function recoverPingRepliesFromInbox(
  supabase: { from: (table: string) => any },
  userId: string,
  phone: string,
) {
  const digits = pingDigits(phone);
  if (digits.length !== 10) return 0;

  const { data: leads } = await supabase
    .from('leads')
    .select('id, phone')
    .eq('user_id', userId)
    .not('phone', 'is', null);
  const leadIds = (leads ?? [])
    .filter((l: { phone?: string | null }) => phonesMatch(l.phone, phone))
    .map((l: { id: string }) => l.id);
  if (!leadIds.length) return 0;

  const { data: inbox } = await supabase
    .from('inbox_messages')
    .select('body, created_at, twilio_sid')
    .eq('direction', 'inbound')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: true })
    .limit(40);
  if (!inbox?.length) return 0;

  const { data: existing } = await supabase
    .from('casper_ping_messages')
    .select('body, twilio_sid, created_at')
    .eq('user_id', userId)
    .eq('direction', 'inbound');
  const seen = new Set(
    (existing ?? []).map((m: { twilio_sid?: string | null; body?: string }) =>
      m.twilio_sid || String(m.body || '').trim(),
    ),
  );

  let copied = 0;
  for (const row of inbox) {
    const key = row.twilio_sid || String(row.body || '').trim();
    if (!key || seen.has(key)) continue;
    await recordPingMessage(supabase, {
      userId,
      direction: 'inbound',
      body: row.body,
      kind: 'chat',
      status: 'received',
      twilioSid: row.twilio_sid || null,
    });
    seen.add(key);
    copied += 1;
  }
  return copied;
}

export async function recordPingMessage(
  supabase: { from: (table: string) => any },
  args: {
    userId: string;
    direction: 'inbound' | 'outbound';
    body: string;
    kind?: PingKind;
    status?: string;
    twilioSid?: string | null;
    error?: string | null;
  },
) {
  const { error } = await supabase.from('casper_ping_messages').insert({
    user_id: args.userId,
    direction: args.direction,
    body: args.body,
    kind: args.kind || 'chat',
    status: args.status || 'sent',
    twilio_sid: args.twilioSid || null,
    error: args.error || null,
  });
  if (error) console.warn('[ping] record', error.message);
}

export async function sendCasperPing(
  supabase: { from: (table: string) => any },
  args: {
    userId: string;
    body: string;
    kind?: PingKind;
    toPhone?: string | null;
    requireEnabled?: boolean;
  },
): Promise<{ sent: boolean; reason?: string }> {
  const settings = await getPingSettings(supabase, args.userId);
  const to = toE164(args.toPhone || settings.phone);
  if (!to) return { sent: false, reason: 'no_phone' };
  if (args.requireEnabled !== false && !settings.enabled) return { sent: false, reason: 'disabled' };

  const text = args.body.trim().slice(0, 480);
  if (!text) return { sent: false, reason: 'empty' };

  const creds = await getTwilioCreds(supabase, args.userId);
  if (!creds) return { sent: false, reason: 'no_twilio' };

  try {
    const sent = await sendTwilioSms(creds, to, text);
    await recordPingMessage(supabase, {
      userId: args.userId,
      direction: 'outbound',
      body: text,
      kind: args.kind || 'alert',
      status: sent.status === 'failed' ? 'failed' : 'sent',
      twilioSid: sent.sid,
      error: sent.error || null,
    });
    return { sent: sent.status !== 'failed', reason: sent.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed';
    await recordPingMessage(supabase, {
      userId: args.userId,
      direction: 'outbound',
      body: text,
      kind: args.kind || 'alert',
      status: 'failed',
      error: message,
    });
    return { sent: false, reason: message };
  }
}
