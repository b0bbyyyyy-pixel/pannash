import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('document_vault')
    .select('id, file_name, file_path, file_size, file_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });

  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${user.id}/vault/${timestamp}_${sanitized}`;

  const buf = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('lead-attachments')
    .upload(filePath, buf, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadError) {
    console.error('[vault POST storage]', uploadError);
    return NextResponse.json({ error: 'Failed to upload' }, { status: 500 });
  }

  const { data: row, error: dbError } = await supabase
    .from('document_vault')
    .insert({
      user_id: user.id,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('lead-attachments').remove([filePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ file: row });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: row, error: fetchError } = await supabase
    .from('document_vault')
    .select('file_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.storage.from('lead-attachments').remove([row.file_path]);
  const { error } = await supabase
    .from('document_vault')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
