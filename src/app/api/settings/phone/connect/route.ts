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

    const { account_sid, auth_token, phone_number } = await req.json();

    if (!account_sid || !auth_token || !phone_number) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

    // Save connection
    const { error: insertError } = await supabase
      .from('phone_connections')
      .insert({
        user_id: user.id,
        provider: 'twilio',
        account_sid,
        auth_token,
        phone_number,
      });

    if (insertError) {
      console.error('Error saving phone connection:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Phone connection error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
