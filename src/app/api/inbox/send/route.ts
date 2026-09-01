import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import twilio from 'twilio';

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

  // Get lead info
  const { data: lead } = await supabase
    .from('leads')
    .select('id, phone, name, company, sms_opt_out')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
  if (lead.sms_opt_out) return NextResponse.json({ error: 'Lead has opted out of SMS' }, { status: 400 });

  // Get or create conversation
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

  // Insert message as queued
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

  // Update conversation preview immediately
  await supabase
    .from('inbox_conversations')
    .update({
      last_message_at: msg.created_at,
      last_message_preview: preview,
      last_direction: 'outbound',
    })
    .eq('id', conv.id);

  // Try to send via Twilio (using user's phone_connections)
  const { data: phoneConn } = await supabase
    .from('phone_connections')
    .select('account_sid, auth_token, phone_number')
    .eq('user_id', user.id)
    .single();

  if (!phoneConn?.account_sid || !phoneConn?.auth_token || !phoneConn?.phone_number) {
    // No connection — message stays queued
    return NextResponse.json({ message: msg, status: 'queued', noConnection: true });
  }

  try {
    const client = twilio(phoneConn.account_sid, phoneConn.auth_token);
    const sent = await client.messages.create({
      body: body.trim(),
      from: phoneConn.phone_number,
      to: lead.phone,
    });

    // Update message with SID and sent status
    await supabase
      .from('inbox_messages')
      .update({ status: 'sent', twilio_sid: sent.sid })
      .eq('id', msg.id);

    return NextResponse.json({ message: { ...msg, status: 'sent', twilio_sid: sent.sid } });
  } catch (err: any) {
    // Mark failed
    await supabase
      .from('inbox_messages')
      .update({ status: 'failed', error_message: err?.message ?? 'Twilio error' })
      .eq('id', msg.id);

    return NextResponse.json(
      { message: { ...msg, status: 'failed' }, error: err?.message },
      { status: 200 } // Return 200 so client shows the failed message
    );
  }
}
