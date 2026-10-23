import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// GET: Get signed URL for downloading an attachment
export async function GET(request: Request) {
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

  // Get attachment info
  const { data: attachment, error: fetchError } = await supabase
    .from('lead_attachments')
    .select('file_path, file_name, file_type')
    .eq('id', attachmentId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Same-origin bytes so the browser can render or save without Storage CORS.
  if (searchParams.get('raw') === '1' || searchParams.get('download') === '1') {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('lead-attachments')
      .download(attachment.file_path);
    if (dlErr || !blob) {
      return NextResponse.json({ error: 'Could not download file' }, { status: 502 });
    }
    const asDownload = searchParams.get('download') === '1';
    const safe = String(attachment.file_name || 'download').replace(/["\r\n]/g, '_');
    const encoded = encodeURIComponent(attachment.file_name || 'download');
    return new NextResponse(blob, {
      headers: {
        'Content-Type': attachment.file_type || blob.type || 'application/pdf',
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // Generate signed URL (valid for 1 hour)
  const { data: signedData, error: signedError } = await supabase.storage
    .from('lead-attachments')
    .createSignedUrl(attachment.file_path, 3600);

  if (signedError || !signedData) {
    console.error('Error creating signed URL:', signedError);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({ 
    url: signedData.signedUrl,
    fileName: attachment.file_name 
  });
}
