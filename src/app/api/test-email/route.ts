import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { to, subject, html } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Missing "to" email address' },
        { status: 400 }
      );
    }

    // Check for email connections (Gmail OAuth or Outlook SMTP)
    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('user_id', user.id);

    const gmailConnection = connections?.find((c) => c.provider === 'gmail');
    const outlookConnection = connections?.find((c) => c.provider === 'outlook');

    // Priority: Gmail OAuth > Outlook SMTP > Resend fallback
    if (gmailConnection) {
      // Send via Gmail OAuth
      console.log('Sending via Gmail OAuth:', gmailConnection.email);

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
      );

      oauth2Client.setCredentials({
        access_token: gmailConnection.access_token,
        refresh_token: gmailConnection.refresh_token,
        expiry_date: gmailConnection.expiry_date
          ? new Date(gmailConnection.expiry_date).getTime()
          : undefined,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Create email in RFC 2822 format
      const emailLines = [
        `From: ${gmailConnection.email}`,
        `To: ${to}`,
        `Subject: ${subject || 'Test Email from Pannash'}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        html || '<p>This is a test email from your Pannash app!</p>',
      ];

      const email = emailLines.join('\r\n');
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
      });

      return NextResponse.json({
        success: true,
        messageId: result.data.id,
        method: 'gmail_oauth',
        from: gmailConnection.email,
      });
    } else if (outlookConnection) {
      // Send via Outlook SMTP
      console.log('Sending via Outlook SMTP:', outlookConnection.from_email);

      const transporter = nodemailer.createTransport({
        host: outlookConnection.smtp_host,
        port: outlookConnection.smtp_port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: outlookConnection.smtp_username,
          pass: outlookConnection.smtp_password,
        },
      });

      const fromAddress = outlookConnection.from_name
        ? `${outlookConnection.from_name} <${outlookConnection.from_email}>`
        : outlookConnection.from_email;

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject: subject || 'Test Email from Pannash',
        html: html || '<p>This is a test email from your Pannash app!</p>',
      });

      return NextResponse.json({
        success: true,
        messageId: info.messageId,
        method: 'outlook_smtp',
        from: outlookConnection.from_email,
      });
    } else {
      // Fall back to Resend (no connections configured)
      console.log('Sending via Resend (no connections configured)');

      const { data, error } = await resend.emails.send({
        from: 'Pannash Test <onboarding@resend.dev>',
        to,
        subject: subject || 'Test Email from Pannash',
        html: html || '<p>This is a test email from your Pannash app!</p>',
      });

      if (error) {
        console.error('Resend error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        messageId: data?.id,
        method: 'resend',
      });
    }
  } catch (err: any) {
    console.error('Server error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
