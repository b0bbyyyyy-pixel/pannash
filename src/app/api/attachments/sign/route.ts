import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;

function sanitizeFileName(name: string) {
  return String(name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 180);
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fileName = String(body.fileName || '').trim();
  const fileSize = Number(body.fileSize || 0);
  const leadId = String(body.leadId || '').trim();
  const columnField = String(body.columnField || 'documents').replace(/[^a-zA-Z0-9_-]/g, '');
  const temp = body.temp === true;

  if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 });
  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ error: `File is too large (${(fileSize / 1024 / 1024).toFixed(1)} MB). Max is 20 MB.` }, { status: 413 });
  }
  if (!temp && !leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  }

  const timestamp = Date.now();
  const sanitized = sanitizeFileName(fileName);
  const path = temp
    ? `${user.id}/tmp/${timestamp}_${sanitized}`
    : `${user.id}/${leadId}/${columnField || 'documents'}/${timestamp}_${sanitized}`;

  const { data, error } = await supabase.storage
    .from('lead-attachments')
    .createSignedUploadUrl(path);

  if (error || !data?.signedUrl || !data?.token) {
    return NextResponse.json(
      { error: error?.message || 'Could not create a storage upload URL' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    path: data.path || path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
