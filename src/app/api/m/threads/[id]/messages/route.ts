import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms, refreshSmsStatuses } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { backfillInboundPhotos } from '@/lib/inbox/saveInboundMms';

export const dynamic = 'force-dynamic';

const PAGE = 40;

async function ownLead(supabase: Awaited<ReturnType<typeof mobileClient>>['supabase'], userId: string, leadId: string) {
  const { data } = await supabase
    .from('leads')
    .select('id, phone, name, sms_opt_out')
    .eq('id', leadId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const lead = await ownLead(supabase, user.id, leadId);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let { data: conv } = await supabase
    .from('inbox_conversations')
    .select('id, unread_count')
    .eq('user_id', user.id)
    .eq('lead_id', leadId)
    .maybeSingle();

  if (!conv) {
    const { data: created } = await supabase
      .from('inbox_conversations')
      .insert({ user_id: user.id, lead_id: leadId })
      .select('id, unread_count')
      .single();
    conv = created;
  }
  if (!conv) return NextResponse.json({ messages: [], nextCursor: null });

  const cursor = req.nextUrl.searchParams.get('cursor');
  const runQuery = (cols: string) => {
    let query = supabase
      .from('inbox_messages')
      .select(cols)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (cursor) query = query.lt('created_at', cursor);
    return query;
  };

  let { data, error } = await runQuery(
    'id, direction, body, status, error_message, created_at, twilio_sid, media_items',
  );
  if (error && /media_items/i.test(error.message)) {
    const retry = await runQuery('id, direction, body, status, error_message, created_at, twilio_sid');
    data = retry.data;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let messages = data ?? [];
  if (!cursor && (conv.unread_count ?? 0) > 0) {
    await supabase.from('inbox_conversations').update({ unread_count: 0 }).eq('id', conv.id);
  }

  const pending = messages.filter(m =>
    m.direction === 'outbound' && m.twilio_sid && (m.status === 'queued' || m.status === 'sent')
  );
  if (pending.length) {
    const creds = await getTwilioCreds(supabase, user.id);
    if (creds) {
      const updates = await refreshSmsStatuses(creds, pending);
      for (const u of updates) {
        await supabase.from('inbox_messages').update({ status: u.status, error_message: u.error ?? null }).eq('id', u.id);
        const row = messages.find(m => m.id === u.id);
        if (row) {
          row.status = u.status;
          row.error_message = u.error ?? row.error_message;
        }
      }
    }
  }

  messages = [...messages].reverse();
  messages = await backfillInboundPhotos(supabase, user.id, messages);
  const nextCursor = (data?.length ?? 0) === PAGE ? data![data!.length - 1].created_at : null;

  return NextResponse.json({
    messages,
    nextCursor,
    lead: { id: lead.id, name: lead.name, phone: lead.phone },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { body } = await req.json().catch(() => ({ body: '' }));
  const text = String(body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const lead = await ownLead(supabase, user.id, leadId);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
  if (lead.sms_opt_out) return NextResponse.json({ error: 'Lead has opted out of SMS' }, { status: 400 });

  let { data: conv } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('user_id', user.id)
    .eq('lead_id', leadId)
    .maybeSingle();

  if (!conv) {
    const { data: created } = await supabase
      .from('inbox_conversations')
      .insert({ user_id: user.id, lead_id: leadId })
      .select('id')
      .single();
    conv = created;
  }
  if (!conv) return NextResponse.json({ error: 'Could not open thread' }, { status: 500 });

  const preview = text.length > 100 ? `${text.slice(0, 97)}…` : text;
  const { data: msg, error: msgErr } = await supabase
    .from('inbox_messages')
    .insert({
      conversation_id: conv.id,
      lead_id: leadId,
      direction: 'outbound',
      body: text,
      status: 'queued',
      sent_by: 'user',
    })
    .select('id, direction, body, status, error_message, created_at, twilio_sid')
    .single();

  if (msgErr || !msg) {
    return NextResponse.json({ error: msgErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  await supabase.from('inbox_conversations').update({
    last_message_at: msg.created_at,
    last_message_preview: preview,
    last_direction: 'outbound',
  }).eq('id', conv.id);

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) {
    return NextResponse.json({
      message: { ...msg, status: 'failed', error_message: 'No Twilio connection' },
      error: 'No Twilio connection — message saved but not sent.',
    });
  }

  try {
    const sent = await sendTwilioSms(creds, lead.phone, text);
    await recordOutboundInboxSms(supabase, {
      existingMessageId: msg.id,
      userId: user.id,
      leadId,
      toPhone: lead.phone,
      body: text,
      twilioSid: sent.sid,
      status: sent.status,
      errorMessage: sent.error ?? null,
      sentBy: 'user',
    });
    if (sent.status !== 'failed') {
      await supabase.from('leads').update({
        sms_sent_at: msg.created_at,
        last_contact: msg.created_at,
      }).eq('id', leadId);
    }
    return NextResponse.json({
      message: { ...msg, status: sent.status, twilio_sid: sent.sid, error_message: sent.error ?? null },
      ...(sent.error ? { error: sent.error } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Twilio error';
    await supabase.from('inbox_messages').update({ status: 'failed', error_message: message }).eq('id', msg.id);
    return NextResponse.json({
      message: { ...msg, status: 'failed', error_message: message },
      error: message,
    });
  }
}
