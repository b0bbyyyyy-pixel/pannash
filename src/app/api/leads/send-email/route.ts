import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { refreshGmailToken, isTokenExpired } from '@/lib/gmail-refresh';
import { appendEmailSignature } from '@/lib/email-signature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

async function sendViaGmail(opts: {
  accessToken: string;
  refreshToken?: string | null;
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
  );
  oauth2Client.setCredentials({
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken || undefined,
  });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rfc2822(opts.from, opts.to, opts.subject, opts.html) },
  });
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

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId, subject, html } = await req.json();
    if (!leadId || !subject || !html) {
      return NextResponse.json({ error: 'Missing lead, subject, or body' }, { status: 400 });
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, email, name')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!lead.email) return NextResponse.json({ error: 'This lead has no email address' }, { status: 400 });

    const { data: settings } = await supabase
      .from('user_settings')
      .select('email_signature')
      .eq('user_id', user.id)
      .maybeSingle();

    const htmlBody = toHtml(appendEmailSignature(html, settings?.email_signature));
    let lastError = '';
    let needsGmail = false;

    const markSent = async () => {
      await supabase
        .from('leads')
        .update({ last_contact: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('user_id', user.id);
    };

    const { data: emailConns } = await supabase
      .from('email_connections')
      .select('*')
      .eq('user_id', user.id);

    // 1. Gmail send OAuth (Settings → Connect Gmail)
    const gmailConn = emailConns?.find(
      (c) => c.provider === 'gmail' && (c.access_token || c.refresh_token)
    );

    if (gmailConn) {
      try {
        let accessToken = (gmailConn.access_token as string | null) || null;
        const refreshToken = (gmailConn.refresh_token as string | null) || null;
        const expiry = (gmailConn.expiry_date || gmailConn.expires_at) as string | null;
        if (refreshToken && isTokenExpired(expiry)) {
          const refreshed = await refreshGmailToken(user.id, refreshToken, supabase);
          if (refreshed) accessToken = refreshed.access_token;
        }
        if (!accessToken) {
          throw new Error('Gmail token expired — reconnect in Settings');
        }
        const from = (gmailConn.email || gmailConn.from_email || gmailConn.email_address || 'me') as string;
        const result = await sendViaGmail({
          accessToken,
          refreshToken,
          from,
          to: lead.email,
          subject,
          html: htmlBody,
        });
        await markSent();
        return NextResponse.json({
          success: true,
          to: lead.email,
          from,
          messageId: result.data.id,
        });
      } catch (err: unknown) {
        lastError = errMessage(err);
        if (isScopeError(lastError)) {
          needsGmail = true;
          lastError = 'Gmail is connected without send permission. Reconnect Gmail in Settings.';
        }
        console.error('[send-email] email_connections send failed:', lastError);
      }
    }

    // 2. SMTP
    const smtpConn = emailConns?.find((c) => c.provider === 'outlook' || c.smtp_host);
    if (smtpConn?.smtp_host) {
      const transporter = nodemailer.createTransport({
        host: smtpConn.smtp_host,
        port: smtpConn.smtp_port || 587,
        secure: smtpConn.smtp_port === 465,
        auth: { user: smtpConn.smtp_username, pass: smtpConn.smtp_password },
      });
      const from = smtpConn.from_name
        ? `${smtpConn.from_name} <${smtpConn.from_email || smtpConn.smtp_username}>`
        : (smtpConn.from_email || smtpConn.smtp_username);
      await transporter.sendMail({ from, to: lead.email, subject, html: htmlBody });
      await markSent();
      return NextResponse.json({ success: true, to: lead.email, from });
    }

    needsGmail = true;
    return NextResponse.json({
      error: lastError || 'Connect Gmail in Settings, then try Send Now again.',
      needsGmail,
    }, { status: 400 });
  } catch (err: unknown) {
    const message = errMessage(err);
    console.error('[send-email]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
