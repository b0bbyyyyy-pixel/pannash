import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { to, body } = await req.json();

  if (!to || !body) {
    return NextResponse.json({ error: 'Missing to or body' }, { status: 400 });
  }

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) {
    return NextResponse.json({ error: 'No phone connection found. Please connect Twilio first.' }, { status: 400 });
  }

  try {
    const sent = await sendTwilioSms(creds, to, body);
    await recordOutboundInboxSms(supabase, {
      userId: user.id,
      toPhone: to,
      body,
      twilioSid: sent.sid,
      status: sent.status,
      errorMessage: sent.error ?? null,
      sentBy: 'user',
    });

    return NextResponse.json({
      success: sent.status !== 'failed',
      messageSid: sent.sid,
      status: sent.status,
      ...(sent.error ? { error: sent.error } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'SMS send error';
    console.error('SMS send error:', error);
    await recordOutboundInboxSms(supabase, {
      userId: user.id,
      toPhone: to,
      body,
      status: 'failed',
      errorMessage: message,
      sentBy: 'user',
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
