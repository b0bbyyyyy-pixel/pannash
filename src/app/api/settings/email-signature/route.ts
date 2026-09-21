import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('user_settings')
    .select('email_signature')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ signature: data?.email_signature || '' });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { signature } = await req.json();
  const value = typeof signature === 'string' ? signature : '';

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload = { email_signature: value, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
    : await supabase.from('user_settings').insert({ user_id: user.id, ...payload });

  if (error) {
    console.error('[email-signature]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, signature: value });
}
