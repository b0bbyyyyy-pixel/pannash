import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { refreshGmailToken, isTokenExpired } from '@/lib/gmail-refresh';
import { appendEmailSignature } from '@/lib/email-signature';
import { resolveFromHeader } from '@/lib/email-from';

export type SendLeadEmailResult = {
  sent: boolean;
  to?: string;
  from?: string;
  error?: string;
  needsGmail?: boolean;
};

function toHtml(body: string) {
  if (/<html[\s>]/i.test(body)) return body;
  const withBreaks = body.replace(/\n/g, '<br/>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;line-height:1.6;color:#333">${withBreaks}</body></html>`;
}

function encodeSubject(subject: string) {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function rfc2822(from: string, to: string, subject: string, html: string) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function errMessage(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return err instanceof Error ? err.message : 'Send failed';
}

function isScopeError(msg: string) {
  return /insufficient.*scope/i.test(msg);
}

/** Same send path as Comms → Send Email (`/api/leads/send-email`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendLeadEmail(
  supabase: any,
  args: { userId: string; leadId: string; to: string; subject: string; html: string },
): Promise<SendLeadEmailResult> {
  const to = args.to.trim();
  if (!to) return { sent: false, error: 'This lead has no email address' };

  const { data: settings } = await supabase
    .from('user_settings')
    .select('email_signature, email_from_name')
    .eq('user_id', args.userId)
    .maybeSingle();

  const htmlBody = toHtml(appendEmailSignature(args.html, settings?.email_signature));
  let lastError = '';
  let needsGmail = false;

  const markSent = async () => {
    await supabase
      .from('leads')
      .update({ last_contact: new Date().toISOString() })
      .eq('id', args.leadId)
      .eq('user_id', args.userId);
  };

  const { data: emailConns } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', args.userId);

  const gmailConn = (emailConns ?? []).find(
    (c: { provider?: string; access_token?: string; refresh_token?: string }) =>
      c.provider === 'gmail' && (c.access_token || c.refresh_token),
  );

  if (gmailConn) {
    try {
      let accessToken = (gmailConn.access_token as string | null) || null;
      const refreshToken = (gmailConn.refresh_token as string | null) || null;
      const expiry = (gmailConn.expiry_date || gmailConn.expires_at) as string | null;
      if (refreshToken && isTokenExpired(expiry)) {
        const refreshed = await refreshGmailToken(args.userId, refreshToken, supabase);
        if (refreshed) accessToken = refreshed.access_token;
      }
      if (!accessToken) {
        throw new Error('Gmail token expired — reconnect in Settings');
      }
      const { from } = resolveFromHeader({
        connection: gmailConn,
        settingsFromName: settings?.email_from_name,
      });
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`,
      );
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
      });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rfc2822(from, to, args.subject, htmlBody) },
      });
      await markSent();
      return { sent: true, to, from };
    } catch (err: unknown) {
      lastError = errMessage(err);
      if (isScopeError(lastError)) {
        needsGmail = true;
        lastError = 'Gmail is connected without send permission. Reconnect Gmail in Settings.';
      }
    }
  }

  const smtpConn = (emailConns ?? []).find(
    (c: { provider?: string; smtp_host?: string }) => c.provider === 'outlook' || c.smtp_host,
  );
  if (smtpConn?.smtp_host) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpConn.smtp_host,
        port: smtpConn.smtp_port || 587,
        secure: smtpConn.smtp_port === 465,
        auth: { user: smtpConn.smtp_username, pass: smtpConn.smtp_password },
      });
      const { from } = resolveFromHeader({
        connection: smtpConn,
        settingsFromName: settings?.email_from_name,
      });
      await transporter.sendMail({ from, to, subject: args.subject, html: htmlBody });
      await markSent();
      return { sent: true, to, from };
    } catch (err: unknown) {
      lastError = errMessage(err);
    }
  }

  return {
    sent: false,
    error: lastError || 'Connect Gmail in Settings, then try Send Now again.',
    needsGmail: true,
  };
}
