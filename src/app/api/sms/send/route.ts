import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import twilio from 'twilio';

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

    const { to, body } = await req.json();

    if (!to || !body) {
      return NextResponse.json({ error: 'Missing to or body' }, { status: 400 });
    }

    // Get user's Twilio connection
    const { data: connection } = await supabase
      .from('phone_connections')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!connection) {
      return NextResponse.json({ error: 'No phone connection found. Please connect Twilio first.' }, { status: 400 });
    }

    // Send SMS via Twilio
    const client = twilio(connection.account_sid, connection.auth_token);

    const message = await client.messages.create({
      body: body,
      from: connection.phone_number,
      to: to,
    });

    console.log(`SMS sent to ${to}, SID: ${message.sid}`);

    return NextResponse.json({ 
      success: true, 
      messageSid: message.sid,
      status: message.status 
    });
  } catch (error: any) {
    console.error('SMS send error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
