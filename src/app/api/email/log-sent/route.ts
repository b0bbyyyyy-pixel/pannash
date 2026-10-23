import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { getMailboxMessage, MailboxError } from '@/lib/email/mailbox';
import { appendEmailSent } from '@/lib/leads/fileActivity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
  const user = await getRequestUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let messageId = '';
  let leadId = '';
  try {
    const body = await req.json();
    messageId = String(body.messageId || '').trim();
    leadId = String(body.leadId || '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!messageId || !leadId) {
    return NextResponse.json({ error: 'messageId and leadId required' }, { status: 400 });
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  let message;
  try {
    message = await getMailboxMessage(supabase, user.id, messageId);
  } catch (err) {
    const box = err instanceof MailboxError ? err : new MailboxError('Could not read that email.');
    return NextResponse.json(
      { error: box.message, needsReconnect: box.needsReconnect },
      { status: box.needsReconnect ? 403 : 500 },
    );
  }

  const sentAt = message.date ? new Date(message.date) : new Date();
  await appendEmailSent(supabase, {
    userId: user.id,
    leadId,
    to: message.to,
    subject: message.subject,
    at: Number.isNaN(sentAt.getTime()) ? undefined : sentAt.toISOString(),
  });

  return NextResponse.json({ ok: true, subject: message.subject, to: message.to });
}
