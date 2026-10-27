import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { getTwilioCreds, serviceClient } from '@/lib/telephony/twilio';
import { sendTwilioSms, refreshSmsStatuses } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { backfillThreadLanguage, ensureLeadSmsLanguage, insertInboxMessage, languageColumns, prepareOutboundForLead } from '@/lib/inbox/language';
import { backfillInboundPhotos } from '@/lib/inbox/saveInboundMms';
import { applySmsOptOutFromFailure, markPhoneDnc, smsSendBlockReason } from '@/lib/leads/dnc';
import { cancelPendingOutbox } from '@/lib/casper/outbox';
import {
  attachmentSmsBody,
  isOwnedMmsPath,
  mediaItemsFromOutbound,
  parseOutboundMedia,
  signedMmsFetchUrls,
} from '@/lib/inbox/outboundMms';

export const dynamic = 'force-dynamic';

const PAGE = 40;

async function ownLead(supabase: Awaited<ReturnType<typeof mobileClient>>['supabase'], userId: string, leadId: string) {
  const { data } = await supabase
    .from('leads')
    .select('id, phone, name, company, sms_opt_out, lead_status')
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
    'id, direction, body, status, error_message, created_at, twilio_sid, media_items, body_en, body_original, detected_lang',
  );
  if (error) {
    const mid = await runQuery('id, direction, body, status, error_message, created_at, twilio_sid, media_items');
    data = mid.data;
    error = mid.error;
  }
  if (error && /media_items/i.test(error.message)) {
    const retry = await runQuery('id, direction, body, status, error_message, created_at, twilio_sid');
    data = retry.data;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type ThreadRow = {
    id: string;
    direction: string;
    body: string;
    status: string;
    error_message: string | null;
    created_at: string;
    twilio_sid: string | null;
    media_items?: { sid?: string; path?: string; type: string; savedAt?: string | null }[] | null;
    body_en?: string | null;
    body_original?: string | null;
    detected_lang?: string | null;
  };
  let messages: ThreadRow[] = Array.isArray(data) ? data as unknown as ThreadRow[] : [];
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

  const nextCursor = messages.length === PAGE ? messages[messages.length - 1].created_at : null;
  messages = [...messages].reverse();
  messages = await backfillInboundPhotos(supabase, user.id, messages);
  messages = await backfillThreadLanguage(supabase, { leadId, messages });

  return NextResponse.json({
    messages,
    nextCursor,
    lead: { id: lead.id, name: lead.name, phone: lead.phone, company: (lead as { company?: string | null }).company ?? null },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const payload = await req.json().catch(() => ({ body: '' }));
  const text = String(payload.body ?? '').trim();
  const media = parseOutboundMedia(payload.media);
  if (!text && !media.length) return NextResponse.json({ error: 'body required' }, { status: 400 });
  if (media.some(item => !isOwnedMmsPath(item.path, user.id, leadId))) {
    return NextResponse.json({ error: 'Invalid attachment' }, { status: 400 });
  }

  const lead = await ownLead(supabase, user.id, leadId);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
  const blocked = await smsSendBlockReason(supabase, lead);
  if (blocked) {
    await markPhoneDnc(supabase, { userId: user.id, phone: lead.phone, leadId });
    return NextResponse.json({ error: blocked }, { status: 400 });
  }

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

  const leadLang = text ? await ensureLeadSmsLanguage(supabase, leadId) : null;
  const prep = text
    ? await prepareOutboundForLead(text, leadLang)
    : { body: '', bodyOriginal: '', bodyEn: '', lang: null, translated: false };
  console.log('[sms-lang] outbound', { leadId, lang: prep.lang, translated: prep.translated, media: media.length });
  const sendBody = prep.body;
  const storedBody = sendBody || attachmentSmsBody(media.map(m => m.type));
  const preview = storedBody.length > 100 ? `${storedBody.slice(0, 97)}…` : storedBody;
  const mediaItems = mediaItemsFromOutbound(media);
  const row = {
    conversation_id: conv.id,
    lead_id: leadId,
    direction: 'outbound',
    body: storedBody,
    status: 'queued',
    sent_by: 'user',
    ...(mediaItems.length ? { media_items: mediaItems } : {}),
    ...languageColumns(prep),
  };
  let { data: msg, error: msgErr } = await insertInboxMessage(
    supabase,
    row,
    'id, direction, body, status, error_message, created_at, twilio_sid, media_items, body_en, body_original, detected_lang',
  );
  if (msgErr && /media_items/i.test(msgErr.message || '')) {
    const withoutMedia = { ...row };
    delete (withoutMedia as { media_items?: unknown }).media_items;
    ({ data: msg, error: msgErr } = await insertInboxMessage(
      supabase,
      withoutMedia,
      'id, direction, body, status, error_message, created_at, twilio_sid, body_en, body_original, detected_lang',
    ));
  }

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
      message: { ...msg, status: 'failed', error_message: 'No Twilio connection', ...languageColumns(prep) },
      error: 'No Twilio connection — message saved but not sent.',
    });
  }

  try {
    const mediaUrls = media.length
      ? await signedMmsFetchUrls(serviceClient(), media.map(item => item.path))
      : [];
    const sent = await sendTwilioSms(creds, lead.phone, sendBody, mediaUrls);
    await applySmsOptOutFromFailure(supabase, {
      userId: user.id,
      phone: lead.phone,
      leadId,
      error: sent.error,
    });
    await recordOutboundInboxSms(supabase, {
      existingMessageId: msg.id as string,
      userId: user.id,
      leadId,
      toPhone: lead.phone,
      body: sendBody,
      twilioSid: sent.sid,
      status: sent.status,
      errorMessage: sent.error ?? null,
      sentBy: 'user',
      bodyOriginal: prep.bodyOriginal,
      bodyEn: prep.bodyEn,
      detectedLang: prep.lang,
    });
    if (sent.status !== 'failed') {
      await supabase.from('leads').update({
        sms_sent_at: msg.created_at,
        last_contact: msg.created_at,
      }).eq('id', leadId);
      await cancelPendingOutbox(supabase, { leadId, userId: user.id, reason: 'owner_replied' });
    }
    return NextResponse.json({
      message: {
        ...msg,
        status: sent.status,
        twilio_sid: sent.sid,
        error_message: sent.error ?? null,
        ...languageColumns(prep),
        ...(mediaItems.length ? { media_items: mediaItems } : {}),
      },
      ...(sent.error ? { error: sent.error } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Twilio error';
    await applySmsOptOutFromFailure(supabase, {
      userId: user.id,
      phone: lead.phone,
      leadId,
      error: message,
    });
    await supabase.from('inbox_messages').update({ status: 'failed', error_message: message }).eq('id', msg.id);
    return NextResponse.json({
      message: { ...msg, status: 'failed', error_message: message },
      error: message,
    });
  }
}
