import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { listMailbox, MailboxError, type MailFolder } from '@/lib/email/mailbox';

export const dynamic = 'force-dynamic';

function folderOf(raw: string | null): MailFolder {
  return raw === 'sent' ? 'sent' : 'inbox';
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
  const user = await getRequestUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const folder = folderOf(req.nextUrl.searchParams.get('folder'));
  const q = req.nextUrl.searchParams.get('q') || '';
  const pageToken = req.nextUrl.searchParams.get('pageToken') || '';

  try {
    const { messages, nextPageToken } = await listMailbox(supabase, user.id, {
      folder,
      q,
      pageToken,
    });
    return NextResponse.json({ messages, nextPageToken });
  } catch (err) {
    const box = err instanceof MailboxError ? err : new MailboxError('Could not read Gmail.');
    return NextResponse.json(
      { error: box.message, needsReconnect: box.needsReconnect },
      { status: box.needsReconnect ? 403 : 500 },
    );
  }
}
