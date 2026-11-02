import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_FROM_NAME, mailboxEmail } from '@/lib/email-from';
import { pickSendConnection, toSendAccountOptions, type SendConnection } from '@/lib/email/sendAccounts';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

async function loadSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const withPreferred = await supabase
    .from('user_settings')
    .select('email_signature, email_from_name, preferred_send_connection_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (withPreferred.error && /preferred_send_connection_id/i.test(withPreferred.error.message || '')) {
    const fallback = await supabase
      .from('user_settings')
      .select('email_signature, email_from_name')
      .eq('user_id', userId)
      .maybeSingle();
    return fallback.data as {
      email_signature?: string | null;
      email_from_name?: string | null;
      preferred_send_connection_id?: string | null;
    } | null;
  }
  return withPreferred.data as {
    email_signature?: string | null;
    email_from_name?: string | null;
    preferred_send_connection_id?: string | null;
  } | null;
}

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await loadSettings(supabase, user.id);

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const accounts = toSendAccountOptions(connections as SendConnection[] | null, {
    preferredId: data?.preferred_send_connection_id,
    fallbackSignature: data?.email_signature,
    fallbackFromName: data?.email_from_name || DEFAULT_FROM_NAME,
  });
  const picked = pickSendConnection(
    connections as SendConnection[] | null,
    data?.preferred_send_connection_id,
  );
  const active = accounts.find(a => a.id === picked?.id) || accounts[0] || null;

  return NextResponse.json({
    signature: active?.signature || data?.email_signature || '',
    fromName: active?.fromName || data?.email_from_name || DEFAULT_FROM_NAME || '',
    fromEmail: active?.email || mailboxEmail(picked) || '',
    preferredId: active?.id || data?.preferred_send_connection_id || null,
    accounts,
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
  const makePreferred = body.preferred === true;

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (hasSignature) payload.email_signature = body.signature;
  if (hasFromName) payload.email_from_name = body.fromName.trim();
  if (makePreferred && connectionId) payload.preferred_send_connection_id = connectionId;

  if (hasSignature || hasFromName || (makePreferred && connectionId)) {
    const { error } = existing
      ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
      : await supabase.from('user_settings').insert({ user_id: user.id, ...payload });

    if (error && /preferred_send_connection_id/i.test(error.message || '')) {
      delete payload.preferred_send_connection_id;
      const retry = existing
        ? await supabase.from('user_settings').update(payload).eq('user_id', user.id)
        : await supabase.from('user_settings').insert({ user_id: user.id, ...payload });
      if (retry.error) {
        console.error('[email-signature]', retry.error);
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
    } else if (error) {
      console.error('[email-signature]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (connectionId && (hasFromName || hasSignature)) {
    const connPatch: Record<string, unknown> = {};
    if (hasFromName) connPatch.from_name = body.fromName.trim() || null;
    if (hasSignature) connPatch.email_signature = body.signature;
    if (Object.keys(connPatch).length) {
      const { error: connErr } = await supabase
        .from('email_connections')
        .update(connPatch)
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connErr && /email_signature/i.test(connErr.message || '')) {
        delete connPatch.email_signature;
        if (Object.keys(connPatch).length) {
          await supabase
            .from('email_connections')
            .update(connPatch)
            .eq('id', connectionId)
            .eq('user_id', user.id);
        }
      }
    }
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
    preferredId: connectionId || undefined,
  });
}
