import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const FOLDER_TYPE = 'folder';
const VAULT_SELECT = 'id, file_name, file_path, file_size, file_type, created_at, folder';
const VAULT_SELECT_SLIM = 'id, file_name, file_path, file_size, file_type, created_at';

function cleanFolderName(raw: unknown) {
  const name = String(raw ?? '').trim().replace(/[/\\]+/g, ' ').replace(/\s+/g, ' ');
  if (!name || name === '.' || name === '..') return '';
  return name.slice(0, 80);
}

function cleanFolderPath(raw: unknown) {
  const parts = String(raw ?? '')
    .split('/')
    .map(p => p.trim())
    .filter(p => p && p !== '.' && p !== '..');
  return parts.join('/');
}

function childPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function isInsideFolder(folder: string | null | undefined, path: string) {
  const value = String(folder || '');
  return value === path || value.startsWith(`${path}/`);
}

function missingFolderColumn(message: string) {
  return /column .*folder/i.test(message) || /folder.*does not exist/i.test(message);
}

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

  const full = await supabase
    .from('document_vault')
    .select(VAULT_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (full.error) {
    const slim = await supabase
      .from('document_vault')
      .select(VAULT_SELECT_SLIM)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (slim.error) return NextResponse.json({ error: slim.error.message }, { status: 500 });
    return NextResponse.json({ files: (slim.data ?? []).map(row => ({ ...row, folder: '' })) });
  }
  return NextResponse.json({ files: (full.data ?? []).map(row => ({ ...row, folder: row.folder || '' })) });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    const name = cleanFolderName(body.name);
    const parent = cleanFolderPath(body.folder);
    if (!name) return NextResponse.json({ error: 'Give the folder a name.' }, { status: 400 });

    const { data: siblings, error: siblingError } = await supabase
      .from('document_vault')
      .select('id, file_name, file_type, folder')
      .eq('user_id', user.id)
      .eq('folder', parent)
      .eq('file_type', FOLDER_TYPE)
      .ilike('file_name', name);
    if (siblingError) {
      if (missingFolderColumn(siblingError.message)) {
        return NextResponse.json({ error: 'Run add-vault-folders.sql in Supabase first.' }, { status: 400 });
      }
      return NextResponse.json({ error: siblingError.message }, { status: 500 });
    }
    if ((siblings ?? []).some(s => s.file_name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A folder with that name already exists here.' }, { status: 409 });
    }

    const { data: row, error: dbError } = await supabase
      .from('document_vault')
      .insert({
        user_id: user.id,
        file_name: name,
        file_path: '',
        file_size: 0,
        file_type: FOLDER_TYPE,
        folder: parent,
      })
      .select()
      .single();
    if (dbError) {
      if (missingFolderColumn(dbError.message)) {
        return NextResponse.json({ error: 'Run add-vault-folders.sql in Supabase first.' }, { status: 400 });
      }
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
    return NextResponse.json({ file: row, folder: row });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  const folder = cleanFolderPath(form.get('folder'));

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

  const insert: Record<string, unknown> = {
    user_id: user.id,
    file_name: file.name,
    file_path: filePath,
    file_size: file.size,
    file_type: file.type || 'application/octet-stream',
    folder,
  };
  const { data: row, error: dbError } = await supabase
    .from('document_vault')
    .insert(insert)
    .select()
    .single();

  if (dbError && missingFolderColumn(dbError.message)) {
    delete insert.folder;
    const retry = await supabase.from('document_vault').insert(insert).select().single();
    if (retry.error) {
      await supabase.storage.from('lead-attachments').remove([filePath]);
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    }
    return NextResponse.json({ file: retry.data });
  }

  if (dbError) {
    await supabase.storage.from('lead-attachments').remove([filePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ file: row });
}

export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, title, body, folder } = await req.json();
  if (id && typeof folder === 'string' && typeof body !== 'string') {
    const dest = cleanFolderPath(folder);
    if (dest) {
      const parts = dest.split('/');
      const name = parts.pop() as string;
      const parent = parts.join('/');
      const { data: destRow } = await supabase
        .from('document_vault')
        .select('id')
        .eq('user_id', user.id)
        .eq('file_type', FOLDER_TYPE)
        .eq('folder', parent)
        .eq('file_name', name)
        .maybeSingle();
      if (!destRow) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
    const { data: updated, error: moveError } = await supabase
      .from('document_vault')
      .update({ folder: dest })
      .eq('id', id)
      .eq('user_id', user.id)
      .neq('file_type', FOLDER_TYPE)
      .select()
      .single();
    if (moveError) {
      if (missingFolderColumn(moveError.message)) {
        return NextResponse.json({ error: 'Run add-vault-folders.sql in Supabase first.' }, { status: 400 });
      }
      return NextResponse.json({ error: moveError.message }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ file: updated });
  }

  if (!id || typeof body !== 'string') {
    return NextResponse.json({ error: 'Missing id or body' }, { status: 400 });
  }

  let row: { id: string; file_path: string; file_name: string } | null = null;
  const full = await supabase
    .from('document_vault')
    .select('id, file_path, file_name, folder')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (full.error) {
    const slim = await supabase
      .from('document_vault')
      .select('id, file_path, file_name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (slim.error || !slim.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    row = slim.data;
  } else {
    row = full.data;
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const name = (typeof title === 'string' && title.trim()
    ? title.trim().replace(/\.txt$/i, '')
    : row.file_name.replace(/\.txt$/i, '')) + '.txt';
  const bytes = new TextEncoder().encode(body);

  const { error: uploadError } = await supabase.storage
    .from('lead-attachments')
    .upload(row.file_path, bytes, { contentType: 'text/plain', upsert: true });

  if (uploadError) {
    console.error('[vault PUT storage]', uploadError);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }

  const { data: updated, error: dbError } = await supabase
    .from('document_vault')
    .update({
      file_name: name,
      file_size: bytes.byteLength,
      file_type: 'text/plain',
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ file: updated });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  type VaultRow = { id: string; file_path: string; file_name: string; file_type: string; folder?: string | null };
  let row: VaultRow | null = null;
  const full = await supabase
    .from('document_vault')
    .select('id, file_path, file_name, file_type, folder')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (full.error) {
    const slim = await supabase
      .from('document_vault')
      .select('id, file_path, file_name, file_type')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (slim.error || !slim.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    row = slim.data;
  } else {
    row = full.data;
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const toDelete = [row];
  if (row.file_type === FOLDER_TYPE) {
    const path = childPath(cleanFolderPath(row.folder), row.file_name);
    const { data: descendants } = await supabase
      .from('document_vault')
      .select('id, file_path, file_name, file_type, folder')
      .eq('user_id', user.id);
    for (const item of descendants ?? []) {
      if (item.id === row.id) continue;
      if (isInsideFolder(item.folder, path)) toDelete.push(item);
    }
  }

  const storagePaths = toDelete
    .map(item => item.file_path)
    .filter(path => path && path !== '' && !path.startsWith('__folder__'));
  if (storagePaths.length) {
    await supabase.storage.from('lead-attachments').remove(storagePaths);
  }

  const { error } = await supabase
    .from('document_vault')
    .delete()
    .eq('user_id', user.id)
    .in('id', toDelete.map(item => item.id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
