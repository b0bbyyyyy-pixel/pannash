import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: row, error } = await supabase
    .from('document_vault')
    .select('file_path, file_name, file_type')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const asUrl = req.nextUrl.searchParams.get('url') === '1';
  if (asUrl) {
    const { data: signed, error: signedError } = await supabase.storage
      .from('lead-attachments')
      .createSignedUrl(row.file_path, 3600);
    if (signedError || !signed) return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl, fileName: row.file_name, fileType: row.file_type });
  }

  const { data: blob, error: dlError } = await supabase.storage
    .from('lead-attachments')
    .download(row.file_path);

  if (dlError || !blob) return NextResponse.json({ error: 'Failed to download' }, { status: 500 });

  const buf = await blob.arrayBuffer();
  const safeName = row.file_name.replace(/[^\w.\- ()]/g, '_');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': row.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  });
}
