import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { getTwilioCreds, serviceClient } from '@/lib/telephony/twilio';
import { downloadTwilioMedia, type MediaItem } from '@/lib/inbox/saveInboundMms';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { data: message } = await supabase
    .from('inbox_messages')
    .select('id, twilio_sid, media_items')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const index = Number(req.nextUrl.searchParams.get('i') || 0);
  const items: MediaItem[] = Array.isArray(message.media_items) ? message.media_items : [];
  const item = items[Number.isFinite(index) ? index : 0];
  if (!item) return NextResponse.json({ error: 'No photo' }, { status: 404 });

  if (item.path) {
    let blob: Blob | null = null;
    const userDl = await supabase.storage.from('lead-attachments').download(item.path);
    blob = userDl.data;
    if ((!blob || userDl.error) && item.path.startsWith(`${user.id}/`)) {
      const store = serviceClient();
      const fallback = await store.storage.from('lead-attachments').download(item.path);
      blob = fallback.data;
    }
    if (!blob) return NextResponse.json({ error: 'Photo missing' }, { status: 404 });
    const bytes = Buffer.from(await blob.arrayBuffer());
    const type = item.type || blob.type || 'application/octet-stream';
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  if (!item.sid || !message.twilio_sid) return NextResponse.json({ error: 'No photo' }, { status: 404 });

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) return NextResponse.json({ error: 'No Twilio connection' }, { status: 400 });

  const file = await downloadTwilioMedia(creds, message.twilio_sid, item.sid);
  if (!file) return NextResponse.json({ error: 'Photo missing' }, { status: 404 });

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.type || item.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
