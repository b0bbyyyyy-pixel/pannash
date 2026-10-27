import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds, serviceClient } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { ensureLeadSmsLanguage, insertInboxMessage, languageColumns, prepareOutboundForLead } from '@/lib/inbox/language';
import { applySmsOptOutFromFailure, markPhoneDnc, smsSendBlockReason } from '@/lib/leads/dnc';
import { cancelPendingOutbox } from '@/lib/casper/outbox';
import {
  attachmentSmsBody,
  isOwnedMmsPath,
  mediaItemsFromOutbound,
  parseOutboundMedia,
  signedMmsFetchUrls,
} from '@/lib/inbox/outboundMms';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  const leadId = String(payload.leadId || '').trim();
  const draft = String(payload.body || '').trim();
  const media = parseOutboundMedia(payload.media);
  if (!leadId || (!draft && !media.length)) {
    return NextResponse.json({ error: 'leadId and a message or attachment required' }, { status: 400 });
  }
  if (media.some(item => !isOwnedMmsPath(item.path, user.id, leadId))) {
    return NextResponse.json({ error: 'Invalid attachment' }, { status: 400 });
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, phone, name, company, sms_opt_out, lead_status')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
  const blocked = await smsSendBlockReason(supabase, lead);
  if (blocked) {
    await markPhoneDnc(supabase, { userId: user.id, phone: lead.phone, leadId: lead.id });
    return NextResponse.json({ error: blocked }, { status: 400 });
  }

  let { data: conv } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('user_id', user.id)
    .eq('lead_id', leadId)
    .single();

  if (!conv) {
    const { data: newConv } = await supabase
      .from('inbox_conversations')
      .insert({ user_id: user.id, lead_id: leadId })
      .select('id')
      .single();
    conv = newConv;
  }

  if (!conv) return NextResponse.json({ error: 'Could not create conversation' }, { status: 500 });

  const leadLang = draft ? await ensureLeadSmsLanguage(supabase, leadId) : null;
  const prep = draft
    ? await prepareOutboundForLead(draft, leadLang)
    : { body: '', bodyOriginal: '', bodyEn: '', lang: null, translated: false };
  console.log('[sms-lang] outbound', { leadId, lang: prep.lang, translated: prep.translated, media: media.length });
  const sendBody = prep.body;
  const storedBody = sendBody || attachmentSmsBody(media.map(m => m.type));
  const preview = storedBody.length > 100 ? storedBody.slice(0, 97) + '…' : storedBody;
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
  let { data: msg, error: msgErr } = await insertInboxMessage(supabase, row);
  if (msgErr && /media_items/i.test(msgErr.message || '')) {
    const withoutMedia = { ...row };
    delete (withoutMedia as { media_items?: unknown }).media_items;
    ({ data: msg, error: msgErr } = await insertInboxMessage(supabase, withoutMedia));
  }

  if (msgErr || !msg) {
    return NextResponse.json({ error: msgErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  const { data: leadRow } = await supabase
    .from('leads')
    .select('list_id, in_pipeline, lead_status')
    .eq('id', leadId)
    .maybeSingle();
  const campaignHold =
    !!leadRow?.list_id &&
    !leadRow.in_pipeline &&
    (!leadRow.lead_status || leadRow.lead_status === 'New Lead');

  // Campaign threads stay off Inbox until a reply (drip already skips last_message_at).
  await supabase
    .from('inbox_conversations')
    .update({
      ...(campaignHold ? {} : { last_message_at: msg.created_at }),
      last_message_preview: preview,
      last_direction: 'outbound',
    })
    .eq('id', conv.id);

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) {
    return NextResponse.json({
      message: { ...msg, ...languageColumns(prep) },
      status: 'queued',
      noConnection: true,
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
      leadId: leadId,
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
      await supabase
        .from('leads')
        .update({ sms_sent_at: msg.created_at, last_contact: msg.created_at })
        .eq('id', leadId);
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
    await supabase
      .from('inbox_messages')
      .update({ status: 'failed', error_message: message })
      .eq('id', msg.id);

    return NextResponse.json({
      message: { ...msg, status: 'failed', error_message: message },
      error: message,
    });
  }
}
