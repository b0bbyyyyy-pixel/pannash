import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, html } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Missing "to" email address' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: 'Pannash Test <onboarding@resend.dev>',
      to,
      subject: subject || 'Test Email from Pannash',
      html: html || '<p>This is a test email from your Pannash app!</p>',
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
    });
  } catch (err: any) {
    console.error('Server error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
