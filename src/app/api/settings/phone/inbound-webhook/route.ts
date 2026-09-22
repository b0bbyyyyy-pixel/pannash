import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { configureInboundSmsWebhooks } from '@/lib/telephony/sms';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) return NextResponse.json({ error: 'Connect Twilio first.' }, { status: 400 });

  const result = await configureInboundSmsWebhooks(creds);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, smsUrl: result.smsUrl }, { status: 500 });
  }
  return NextResponse.json(result);
}
