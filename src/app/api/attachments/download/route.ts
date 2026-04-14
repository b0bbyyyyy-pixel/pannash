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
    .select('file_path, file_name')
    .eq('id', attachmentId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
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
