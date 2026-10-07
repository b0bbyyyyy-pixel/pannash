import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { maybeMarkDocsIn } from '@/lib/leads/markDocsIn';

// GET: Fetch attachments for a lead (optionally filtered by column field)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  const columnField = searchParams.get('columnField'); // optional — omit to get all

  if (!leadId) {
    return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let query = supabase
    .from('lead_attachments')
    .select('*')
    .eq('lead_id', leadId);
  if (columnField) query = query.eq('column_field', columnField);
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching attachments:', error);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }

  return NextResponse.json({ attachments: data });
}

// POST: Upload a new attachment
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const leadId = formData.get('leadId') as string;
  const columnField = formData.get('columnField') as string;

  if (!file || !leadId || !columnField) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Create unique filename with timestamp
  const timestamp = Date.now();
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${user.id}/${leadId}/${columnField}/${timestamp}_${sanitizedFileName}`;

  // Upload to Supabase Storage
  const fileBuffer = await file.arrayBuffer();
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('lead-attachments')
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Error uploading file:', uploadError);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  // Save attachment metadata to database
  const { data: attachment, error: dbError } = await supabase
    .from('lead_attachments')
    .insert({
      user_id: user.id,
      lead_id: leadId,
      column_field: columnField,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error saving attachment metadata:', dbError);
    await supabase.storage.from('lead-attachments').remove([filePath]);
    return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 });
  }

  const docsIn = await maybeMarkDocsIn(supabase, { leadId, userId: user.id });

  try {
    const { onCasperDocsReceived } = await import('@/lib/casper/docs');
    await onCasperDocsReceived(supabase, {
      userId: user.id,
      leadId,
      fileName: file.name,
      columnField,
      filePath,
      attachmentId: attachment.id,
    });
  } catch (casperErr) {
    console.error('[attachments] casper docs hook', casperErr);
  }

  return NextResponse.json({ attachment, docsIn });
}

// PUT: Rename an attachment
export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, file_name } = await request.json();
  if (!id || !file_name) return NextResponse.json({ error: 'Missing id or file_name' }, { status: 400 });

  const { data, error } = await supabase
    .from('lead_attachments')
    .update({ file_name })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to rename' }, { status: 500 });
  return NextResponse.json({ attachment: data });
}

// PATCH: Replace file bytes (crop / rotate save)
export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const id = String(formData.get('id') || '');
  const file = formData.get('file');
  if (!id || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing id or file' }, { status: 400 });
  }

  const { data: attachment, error: fetchError } = await supabase
    .from('lead_attachments')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const newPath = `${user.id}/${attachment.lead_id}/${attachment.column_field}/${timestamp}_${sanitized}`;
  const buf = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('lead-attachments')
    .upload(newPath, buf, { contentType: file.type || 'image/jpeg', upsert: false });

  if (uploadError) {
    console.error('Error replacing attachment:', uploadError);
    return NextResponse.json({ error: 'Failed to upload replacement' }, { status: 500 });
  }

  const { data: updated, error: dbError } = await supabase
    .from('lead_attachments')
    .update({
      file_path: newPath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'image/jpeg',
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (dbError || !updated) {
    await supabase.storage.from('lead-attachments').remove([newPath]);
    return NextResponse.json({ error: 'Failed to update attachment' }, { status: 500 });
  }

  if (attachment.file_path && attachment.file_path !== newPath) {
    await supabase.storage.from('lead-attachments').remove([attachment.file_path]);
  }

  return NextResponse.json({ attachment: updated });
}

// DELETE: Remove an attachment
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get('id');

  if (!attachmentId) {
    return NextResponse.json({ error: 'Missing attachment ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get attachment info first
  const { data: attachment, error: fetchError } = await supabase
    .from('lead_attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('lead-attachments')
    .remove([attachment.file_path]);

  if (storageError) {
    console.error('Error deleting file from storage:', storageError);
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from('lead_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('user_id', user.id);

  if (dbError) {
    console.error('Error deleting attachment:', dbError);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
