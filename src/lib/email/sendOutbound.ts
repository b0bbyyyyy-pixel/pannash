import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type StreamTransport from 'nodemailer/lib/stream-transport';
import { google } from 'googleapis';
import { refreshGmailToken, isTokenExpired } from '@/lib/gmail-refresh';
import { mailboxEmail, resolveFromHeader } from '@/lib/email-from';
import { type SendConnection } from '@/lib/email/sendAccounts';

export type OutboundAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendOutboundResult = {
  sent: boolean;
  from?: string;
  error?: string;
};

function toRawBase64(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function errMessage(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return err instanceof Error ? err.message : 'Send failed';
}

async function buildRfc2822(opts: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  attachments?: OutboundAttachment[];
}): Promise<Buffer> {
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  } as StreamTransport.Options);
  const info = await transporter.sendMail({
    from: opts.from,
    to: opts.to,
    cc: opts.cc || undefined,
    subject: opts.subject,
    html: opts.html,
    attachments: (opts.attachments || []).map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return info.message as Buffer;
}

export async function sendOutboundMail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    userId: string;
    connection: SendConnection;
    to: string;
    cc?: string | null;
    subject: string;
    html: string;
    attachments?: OutboundAttachment[];
    settingsFromName?: string | null;
    extraName?: string | null;
  },
): Promise<SendOutboundResult> {
  const conn = args.connection;
  const { from } = resolveFromHeader({
    connection: conn,
    settingsFromName: args.settingsFromName,
    extraName: args.extraName,
  });

  const isGmail = conn.provider === 'gmail' && !!(conn.access_token || conn.refresh_token);
  if (isGmail) {
    try {
      let accessToken = (conn.access_token as string | null) || null;
      const refreshToken = (conn.refresh_token as string | null) || null;
      const expiry = (conn.expiry_date || conn.expires_at) as string | null;
      if (refreshToken && isTokenExpired(expiry)) {
        const refreshed = await refreshGmailToken(args.userId, refreshToken, supabase, {
          connectionId: conn.id,
        });
        if (refreshed) accessToken = refreshed.access_token;
      }
      if (!accessToken) {
        return { sent: false, error: `Gmail token expired for ${mailboxEmail(conn) || 'this mailbox'} — reconnect in Settings` };
      }
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
      const raw = await buildRfc2822({
        from,
        to: args.to,
        cc: args.cc || undefined,
        subject: args.subject,
        html: args.html,
        attachments: args.attachments,
      });
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: toRawBase64(raw) },
      });
      return { sent: true, from };
    } catch (err: unknown) {
      return { sent: false, error: errMessage(err) };
    }
  }

  if (conn.smtp_host) {
    try {
      const transporter = nodemailer.createTransport({
        host: conn.smtp_host,
        port: conn.smtp_port || 587,
        secure: conn.smtp_port === 465,
        auth: {
          user: conn.smtp_username || '',
          pass: conn.smtp_password || '',
        },
      } as SMTPTransport.Options);
      await transporter.sendMail({
        from,
        to: args.to,
        cc: args.cc || undefined,
        subject: args.subject,
        html: args.html,
        attachments: (args.attachments || []).map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return { sent: true, from };
    } catch (err: unknown) {
      return { sent: false, error: errMessage(err) };
    }
  }

  return { sent: false, error: 'This mailbox cannot send' };
}
