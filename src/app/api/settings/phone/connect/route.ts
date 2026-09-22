import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import twilio from 'twilio';
import { toE164 } from '@/lib/dialer/e164';
import { configureInboundSmsWebhooks } from '@/lib/telephony/sms';
import { getTwilioCreds } from '@/lib/telephony/twilio';

export async function POST(req: NextRequest) {
  try {
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

    const { account_sid, auth_token, phone_number, messaging_service_sid } = await req.json();

    if (!account_sid || !auth_token || !phone_number) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const e164 = toE164(phone_number);
    if (!e164) {
      return NextResponse.json({ error: 'Phone number must be a valid US number (10 digits or +1…).' }, { status: 400 });
    }

    // Validate credentials by making a test call to Twilio
    try {
      const client = twilio(account_sid, auth_token);
      
      // Test the connection by fetching account info
      await client.api.accounts(account_sid).fetch();
      
      console.log('Twilio credentials validated successfully');
    } catch (twilioError: any) {
      console.error('Twilio validation error:', twilioError);
      return NextResponse.json({ 
        error: 'Invalid Twilio credentials. Please check your Account SID and Auth Token.' 
      }, { status: 400 });
    }

    const row: Record<string, unknown> = {
      user_id: user.id,
      provider: 'twilio',
      account_sid,
      auth_token,
      phone_number: e164,
    };
    if (messaging_service_sid) row.messaging_service_sid = String(messaging_service_sid).trim();

    const { error: insertError } = await supabase
      .from('phone_connections')
      .insert(row);

    if (insertError) {
      console.error('Error saving phone connection:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const creds = await getTwilioCreds(supabase, user.id);
    if (creds) await configureInboundSmsWebhooks(creds);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Phone connection error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Update Messaging Service SID (and/or normalize From) on an existing Twilio connection. */
export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messaging_service_sid, phone_number } = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof messaging_service_sid === 'string') {
      update.messaging_service_sid = messaging_service_sid.trim() || null;
    }
    if (typeof phone_number === 'string' && phone_number.trim()) {
      const e164 = toE164(phone_number);
      if (!e164) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      update.phone_number = e164;
    }
    if (!Object.keys(update).length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('phone_connections')
      .update(update)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({
        error: error.message.includes('messaging_service_sid')
          ? 'Run add-sms-messaging-service.sql in Supabase, then try again.'
          : error.message,
      }, { status: 500 });
    }

    const creds = await getTwilioCreds(supabase, user.id);
    if (creds) await configureInboundSmsWebhooks(creds);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
