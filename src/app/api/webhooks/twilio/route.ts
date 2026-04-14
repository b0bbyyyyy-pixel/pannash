import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import twilio from 'twilio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Lazy initialization to avoid build-time errors
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    console.log(`[SMS Webhook] Incoming SMS from ${from}: ${body}`);

    if (!from || !body) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Find the lead by phone number
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', from)
      .single();

    if (!lead) {
      console.log(`No lead found for phone: ${from}`);
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Find the most recent campaign_lead for this lead
    const { data: campaignLead } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, campaigns(ai_directive, type, ai_replies_enabled, user_id)')
      .eq('lead_id', lead.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (!campaignLead) {
      console.log(`No campaign_lead found for lead: ${lead.id}`);
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const campaign = campaignLead.campaigns as any;

    // Only process if this is an SMS campaign
    if (campaign?.type !== 'sms') {
      console.log('Not an SMS campaign, ignoring');
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Check if AI replies are enabled for this campaign
    if (!campaign?.ai_replies_enabled) {
      console.log(`AI replies disabled for campaign ${campaignLead.campaign_id}`);
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Log the incoming message
    await supabase
      .from('sms_messages')
      .insert({
        campaign_lead_id: campaignLead.id,
        direction: 'inbound',
        body: body,
        from_number: from,
        to_number: to,
        twilio_sid: messageSid,
        ai_generated: false,
      });

    // Update campaign_lead status to 'replied'
    await supabase
      .from('campaign_leads')
      .update({ 
        status: 'replied',
        replied_at: new Date().toISOString()
      })
      .eq('id', campaignLead.id);

    console.log(`Lead ${campaignLead.id} replied via SMS`);

    // Get user's AI response delay settings
    const userId = campaign?.user_id;
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('ai_response_delay_min, ai_response_delay_max')
      .eq('user_id', userId)
      .single();

    const delayMin = settings?.ai_response_delay_min || 2; // minutes
    const delayMax = settings?.ai_response_delay_max || 8; // minutes

    // Calculate random delay in milliseconds
    const delayMinutes = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
    const delayMs = delayMinutes * 60 * 1000;

    console.log(`Will reply in ${delayMinutes} minutes (${delayMin}-${delayMax} min range)`);

    // Generate AI reply based on directive
    const aiDirective = campaign?.ai_directive || 'Be helpful and professional';
    
    // Get conversation history
    const { data: history } = await supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .eq('campaign_lead_id', campaignLead.id)
      .order('created_at', { ascending: true })
      .limit(10);

    const conversationContext = history?.map(msg => 
      `${msg.direction === 'outbound' ? 'You' : 'Lead'}: ${msg.body}`
    ).join('\n') || '';

    // Generate AI response
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a sales assistant having a text message conversation with a lead. 
Your directive: ${aiDirective}

Conversation so far:
${conversationContext}

Lead just replied: "${body}"

Generate a brief, natural text message response (keep it under 160 characters if possible, max 320). Be conversational and follow the directive. Do not use emojis unless specifically instructed.`
        },
        {
          role: 'user',
          content: body
        }
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    const aiReply = completion.choices[0].message.content || 'Thanks for your message!';

    console.log(`AI generated reply: ${aiReply}`);

    // Schedule the AI reply with human-like delay
    setTimeout(async () => {
      try {
        // Get Twilio connection to send reply
        const { data: connection } = await supabase
          .from('phone_connections')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (connection) {
          const client = twilio(connection.account_sid, connection.auth_token);
          
          const replyMessage = await client.messages.create({
            body: aiReply,
            from: to, // Reply from the number they texted
            to: from, // Send to the lead
          });

          console.log(`AI reply sent after ${delayMinutes} minutes, SID: ${replyMessage.sid}`);

          // Log the outbound AI reply
          await supabase
            .from('sms_messages')
            .insert({
              campaign_lead_id: campaignLead.id,
              direction: 'outbound',
              body: aiReply,
              from_number: to,
              to_number: from,
              twilio_sid: replyMessage.sid,
              ai_generated: true,
            });
        } else {
          console.log('No Twilio connection found for user');
        }
      } catch (error) {
        console.error('Error sending delayed AI reply:', error);
      }
    }, delayMs);

    // Return empty TwiML response (we already sent via API)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error: any) {
    console.error('Twilio webhook error:', error);
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}
