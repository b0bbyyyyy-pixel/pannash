import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_FROM_NAME, mailboxEmail } from '@/lib/email-from';

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
    .select('email_signature, email_from_name')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const conn = connections?.find((c: { provider?: string }) => c.provider === 'gmail')
    || connections?.[0]
    || null;

  const fromName = (conn?.from_name || data?.email_from_name || DEFAULT_FROM_NAME || '').trim();
  const fromEmail = mailboxEmail(conn);

  return NextResponse.json({
    signature: data?.email_signature || '',
    fromName,
    fromEmail,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const hasSignature = typeof body.signature === 'string';
  const hasFromName = typeof body.fromName === 'string';
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : null;

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (hasSignature) payload.email_signature = body.signature;
  if (hasFromName) payload.email_from_name = body.fromName.trim();

  if (hasSignature || hasFromName) {
    const { error } = existing
      ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
      : await supabase.from('user_settings').insert({ user_id: user.id, ...payload });

    if (error) {
      console.error('[email-signature]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasFromName && connectionId) {
    await supabase
      .from('email_connections')
      .update({ from_name: body.fromName.trim() || null })
      .eq('id', connectionId)
      .eq('user_id', user.id);
  } else if (hasFromName) {
    const name = body.fromName.trim() || null;
    await supabase
      .from('email_connections')
      .update({ from_name: name })
      .eq('user_id', user.id);
  }

  return NextResponse.json({
    success: true,
    signature: hasSignature ? body.signature : undefined,
    fromName: hasFromName ? body.fromName.trim() : undefined,
  });
}
