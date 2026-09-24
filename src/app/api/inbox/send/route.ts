import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { leadId, body } = await req.json();
  if (!leadId || !body?.trim()) {
    return NextResponse.json({ error: 'leadId and body required' }, { status: 400 });
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, phone, name, company, sms_opt_out')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
  if (lead.sms_opt_out) return NextResponse.json({ error: 'Lead has opted out of SMS' }, { status: 400 });

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

  const preview = body.length > 100 ? body.slice(0, 97) + '…' : body;
  const { data: msg, error: msgErr } = await supabase
    .from('inbox_messages')
    .insert({
      conversation_id: conv.id,
      lead_id: leadId,
      direction: 'outbound',
      body: body.trim(),
      status: 'queued',
      sent_by: 'user',
    })
    .select()
    .single();

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
      message: msg,
      status: 'queued',
      noConnection: true,
      error: 'No Twilio connection — message saved but not sent.',
    });
  }

  try {
    const sent = await sendTwilioSms(creds, lead.phone, body.trim());

    await recordOutboundInboxSms(supabase, {
      existingMessageId: msg.id,
      userId: user.id,
      leadId: leadId,
      toPhone: lead.phone,
      body: body.trim(),
      twilioSid: sent.sid,
      status: sent.status,
      errorMessage: sent.error ?? null,
      sentBy: 'user',
    });

    if (sent.status !== 'failed') {
      await supabase
        .from('leads')
        .update({ sms_sent_at: msg.created_at, last_contact: msg.created_at })
        .eq('id', leadId);
    }

    return NextResponse.json({
      message: { ...msg, status: sent.status, twilio_sid: sent.sid, error_message: sent.error ?? null },
      ...(sent.error ? { error: sent.error } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Twilio error';
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
