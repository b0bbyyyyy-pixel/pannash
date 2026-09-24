import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import twilio from 'twilio';
import { toE164 } from '@/lib/dialer/e164';
import { promoteCampaignLeadOnReply } from '@/lib/inbox/promoteCampaignReply';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function emptyTwiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function last10(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

function phoneVariants(raw: string): string[] {
  const e164 = toE164(raw);
  const d = last10(raw);
  return [...new Set([raw, e164, d, d ? `+1${d}` : '', d ? `1${d}` : ''].filter(Boolean))] as string[];
}

async function findLeadByPhone(from: string, userId: string | null) {
  const variants = phoneVariants(from);
  const from10 = last10(from);

  const tryMatch = async (uid: string | null) => {
    let q = supabase.from('leads').select('id, user_id, phone').in('phone', variants);
    if (uid) q = q.eq('user_id', uid);
    const { data } = await q.limit(5);
    if (data?.[0]) return data[0];

    if (uid && from10.length === 10) {
      const { data: all } = await supabase
        .from('leads')
        .select('id, user_id, phone')
        .eq('user_id', uid)
        .not('phone', 'is', null);
      return (all ?? []).find(l => last10(l.phone) === from10) ?? null;
    }
    return null;
  };

  return (await tryMatch(userId)) || (await tryMatch(null));
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: 'twilio-inbound-sms' });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const from = String(formData.get('From') ?? '');
    const to = String(formData.get('To') ?? '');
    const body = String(formData.get('Body') ?? '');
    const messageSid = String(formData.get('MessageSid') ?? '');

    console.log(`[SMS Webhook] Incoming SMS from ${from}: ${body}`);

    if (!from || !body) return emptyTwiml();

    // SECURITY DEFINER RPC — works even when the webhook has no login / RLS blocks reads.
    const { data: ingested, error: ingestErr } = await supabase.rpc('ingest_inbound_sms', {
      p_from: from,
      p_to: to,
      p_body: body,
      p_sid: messageSid,
    });
    if (ingestErr) console.error('[SMS Webhook] ingest_inbound_sms:', ingestErr);
    else console.log('[SMS Webhook] ingest_inbound_sms:', ingested);

    const to10 = last10(to);

    const { data: conns } = await supabase
      .from('phone_connections')
      .select('user_id, phone_number');
    const conn = (conns ?? []).find(c => last10(c.phone_number) === to10) ?? conns?.[0] ?? null;
    const userId = conn?.user_id ?? null;

    const lead = await findLeadByPhone(from, userId);

    if (!lead) {
      console.log(`[SMS Webhook] No lead for From=${from} To=${to} user=${userId ?? 'none'}`);
      return emptyTwiml();
    }

    const ownerId = userId || lead.user_id;

    if (body.match(/^(STOP|UNSUBSCRIBE|CANCEL|QUIT|END)\s*$/i)) {
      await supabase.from('leads').update({ sms_opt_out: true }).eq('id', lead.id);
    }

    const rpcOk = Boolean(ingested && typeof ingested === 'object' && (ingested as { ok?: boolean }).ok);
    try { await promoteCampaignLeadOnReply(supabase, lead.id); } catch { /* ignore */ }

    // Fallback write if the SQL function isn't installed yet
    if (rpcOk) {
      // already stored
    } else try {
      let { data: conv } = await supabase
        .from('inbox_conversations')
        .select('id, unread_count')
        .eq('user_id', ownerId)
        .eq('lead_id', lead.id)
        .maybeSingle();

      if (!conv) {
        const { data: newConv } = await supabase
          .from('inbox_conversations')
          .insert({ user_id: ownerId, lead_id: lead.id })
          .select('id, unread_count')
          .single();
        conv = newConv;
      }

      if (conv) {
        const preview = body.length > 100 ? body.slice(0, 97) + '…' : body;
        const { data: existing } = messageSid
          ? await supabase.from('inbox_messages').select('id').eq('twilio_sid', messageSid).maybeSingle()
          : { data: null };

        if (!existing) {
          const { error: insertErr } = await supabase.from('inbox_messages').insert({
            conversation_id: conv.id,
            lead_id: lead.id,
            direction: 'inbound',
            body,
            status: 'received',
            sent_by: 'user',
            twilio_sid: messageSid || null,
          });
          if (insertErr) console.error('[SMS Webhook] inbox_messages insert:', insertErr);
        }

        const nowIso = new Date().toISOString();
        const { error: convUpdateErr } = await supabase
          .from('inbox_conversations')
          .update({
            last_message_at: nowIso,
            last_inbound_at: nowIso,
            last_message_preview: preview,
            last_direction: 'inbound',
            unread_count: (conv.unread_count ?? 0) + 1,
          })
          .eq('id', conv.id);
        if (convUpdateErr) {
          // last_inbound_at column may not exist yet — retry without it
          await supabase
            .from('inbox_conversations')
            .update({
              last_message_at: nowIso,
              last_message_preview: preview,
              last_direction: 'inbound',
              unread_count: (conv.unread_count ?? 0) + 1,
            })
            .eq('id', conv.id);
        }
      }

      // Reply stops the drip for this lead (RPC does this too; fallback mirrors it)
      try {
        await supabase
          .from('sms_drip_sends')
          .update({ sms_status: 'replied' })
          .eq('lead_id', lead.id)
          .in('sms_status', ['queued', 'scheduled', 'sent']);
      } catch {
        // Drip tables not created yet — fine
      }
    } catch (inboxErr) {
      console.error('[Inbox] Failed to write inbound to inbox_messages:', inboxErr);
    }

    const { data: casperRow } = await supabase
      .from('user_settings')
      .select('casper_enabled')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (!casperRow?.casper_enabled) {
      return emptyTwiml();
    }

    // Optional: campaign AI auto-reply (only if this lead is on an active SMS campaign)
    const { data: campaignLead } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, campaigns(ai_directive, type, ai_replies_enabled, user_id)')
      .eq('lead_id', lead.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const campaign = campaignLead?.campaigns as {
      type?: string;
      ai_replies_enabled?: boolean;
      ai_directive?: string;
      user_id?: string;
    } | null;

    if (!campaignLead || campaign?.type !== 'sms' || !campaign.ai_replies_enabled) {
      return emptyTwiml();
    }

    await supabase.from('sms_messages').insert({
      campaign_lead_id: campaignLead.id,
      direction: 'inbound',
      body,
      from_number: from,
      to_number: to,
      twilio_sid: messageSid,
      ai_generated: false,
    });

    await supabase
      .from('campaign_leads')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', campaignLead.id);

    const campaignUserId = campaign.user_id || ownerId;
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('ai_response_delay_min, ai_response_delay_max')
      .eq('user_id', campaignUserId)
      .maybeSingle();

    const delayMin = settings?.ai_response_delay_min || 2;
    const delayMax = settings?.ai_response_delay_max || 8;
    const delayMinutes = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
    const delayMs = delayMinutes * 60 * 1000;

    const { data: history } = await supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .eq('campaign_lead_id', campaignLead.id)
      .order('created_at', { ascending: true })
      .limit(10);

    const conversationContext = history?.map(msg =>
      `${msg.direction === 'outbound' ? 'You' : 'Lead'}: ${msg.body}`
    ).join('\n') || '';

    const openai = getAIClient();
    const completion = await openai.chat.completions.create({
      model: GROK_MINI_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a sales assistant having a text message conversation with a lead.
Your directive: ${campaign.ai_directive || 'Be helpful and professional'}

Conversation so far:
${conversationContext}

Lead just replied: "${body}"

Generate a brief, natural text message response (keep it under 160 characters if possible, max 320). Be conversational and follow the directive. Do not use emojis unless specifically instructed.`,
        },
        { role: 'user', content: body },
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    const aiReply = completion.choices[0].message.content || 'Thanks for your message!';

    setTimeout(async () => {
      try {
        const { data: connection } = await supabase
          .from('phone_connections')
          .select('*')
          .eq('user_id', campaignUserId)
          .limit(1)
          .maybeSingle();

        if (!connection) return;
        const client = twilio(connection.account_sid, connection.auth_token);
        const replyMessage = await client.messages.create({
          body: aiReply,
          from: to,
          to: from,
          ...(connection.messaging_service_sid
            ? { messagingServiceSid: connection.messaging_service_sid }
            : {}),
        });

        await supabase.from('sms_messages').insert({
          campaign_lead_id: campaignLead.id,
          direction: 'outbound',
          body: aiReply,
          from_number: to,
          to_number: from,
          twilio_sid: replyMessage.sid,
          ai_generated: true,
        });
      } catch (error) {
        console.error('Error sending delayed AI reply:', error);
      }
    }, delayMs);

    return emptyTwiml();
  } catch (error) {
    console.error('Twilio webhook error:', error);
    return emptyTwiml();
  }
}
