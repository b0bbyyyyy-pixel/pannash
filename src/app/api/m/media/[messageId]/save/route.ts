import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { downloadTwilioMedia, type MediaItem } from '@/lib/inbox/saveInboundMms';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const index = Number(body.index ?? 0);

  const { data: message } = await supabase
    .from('inbox_messages')
    .select('id, lead_id, twilio_sid, media_items')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items: MediaItem[] = Array.isArray(message.media_items) ? message.media_items : [];
  const item = items[index];
  if (!item?.sid || !message.twilio_sid) return NextResponse.json({ error: 'No photo' }, { status: 400 });
  if (item.savedAt) return NextResponse.json({ ok: true, savedAt: item.savedAt });

  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', message.lead_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) return NextResponse.json({ error: 'No Twilio connection' }, { status: 400 });
  const file = await downloadTwilioMedia(creds, message.twilio_sid, item.sid);
  if (!file) return NextResponse.json({ error: 'Photo missing' }, { status: 404 });

  const png = (file.type || item.type || '').includes('png');
  const ext = png ? 'png' : 'jpg';
  const mime = png ? 'image/png' : 'image/jpeg';
  const fileName = `Text photo.${ext}`;
  const filePath = `${user.id}/${lead.id}/documents/${Date.now()}_${fileName.replace(/\s/g, '_')}`;
  const bytes = file.bytes;

  const { error: uploadErr } = await supabase.storage.from('lead-attachments').upload(filePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploadErr) {
    console.error('[m/media save]', uploadErr);
    return NextResponse.json({ error: 'Could not save to Documents' }, { status: 500 });
  }

  const { data: attachment, error: dbErr } = await supabase
    .from('lead_attachments')
    .insert({
      user_id: user.id,
      lead_id: lead.id,
      column_field: 'documents',
      file_name: fileName,
      file_path: filePath,
      file_size: bytes.byteLength,
      file_type: mime,
    })
    .select('id')
    .single();

  if (dbErr || !attachment) {
    await supabase.storage.from('lead-attachments').remove([filePath]);
    return NextResponse.json({ error: 'Could not save to Documents' }, { status: 500 });
  }

  const earlyStages = new Set([
    'New Lead', 'Contacted', 'Callback Scheduled', 'Revisit', 'App Out',
    'Application Acknowledgement', 'Docs Requested', 'Missing Docs/info', '',
  ]);
  const { data: leadRow } = await supabase
    .from('leads')
    .select('lead_status, stage')
    .eq('id', lead.id)
    .eq('user_id', user.id)
    .maybeSingle();
  const current = leadRow?.lead_status || leadRow?.stage || '';
  if (earlyStages.has(current)) {
    await supabase.from('leads').update({ lead_status: 'Docs In' }).eq('id', lead.id).eq('user_id', user.id);
  }

  const savedAt = new Date().toISOString();
  items[index] = { ...item, savedAt };
  await supabase.from('inbox_messages').update({ media_items: items }).eq('id', messageId);

  return NextResponse.json({ ok: true, savedAt, attachmentId: attachment.id });
}
