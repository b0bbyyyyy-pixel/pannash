import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeReplySentiment } from '@/lib/ai-followup';

// Use service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Webhook endpoint for reply detection
 * Supports Resend and SendGrid webhook formats
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Resend webhook format
    if (body.type === 'email.replied') {
      return await handleResendReply(body);
    }
    
    // SendGrid webhook format
    if (body.event === 'inbound') {
      return await handleSendGridReply(body);
    }
    
    // Generic format (for testing)
    if (body.reply_to && body.reply_text) {
      return await handleGenericReply(body);
    }

    return NextResponse.json({ 
      message: 'Webhook received but no handler matched' 
    });
  } catch (err: any) {
    console.error('Reply webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Handle Resend reply webhook
 */
async function handleResendReply(data: any) {
  const { to, from, subject, text } = data.data;
  
  // Find the campaign lead by recipient email
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', to)
    .single();

  if (!lead) {
    console.log(`[Reply Webhook] Lead not found for ${to}`);
    return NextResponse.json({ message: 'Lead not found' });
  }

  // Get the most recent campaign lead for this lead
  const { data: campaignLead } = await supabase
    .from('campaign_leads')
    .select('id, campaign_id')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!campaignLead) {
    console.log(`[Reply Webhook] Campaign lead not found for ${to}`);
    return NextResponse.json({ message: 'Campaign lead not found' });
  }

  return await processReply(campaignLead.id, campaignLead.campaign_id, text, from);
}

/**
 * Handle SendGrid reply webhook
 */
async function handleSendGridReply(data: any) {
  const { to, from, subject, text } = data;
  
  // Similar logic to Resend
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', to)
    .single();

  if (!lead) {
    return NextResponse.json({ message: 'Lead not found' });
  }

  const { data: campaignLead } = await supabase
    .from('campaign_leads')
    .select('id, campaign_id')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!campaignLead) {
    return NextResponse.json({ message: 'Campaign lead not found' });
  }

  return await processReply(campaignLead.id, campaignLead.campaign_id, text, from);
}

/**
 * Handle generic reply format (for testing)
 */
async function handleGenericReply(data: any) {
  const { campaign_lead_id, reply_text, from } = data;
  
  const { data: campaignLead } = await supabase
    .from('campaign_leads')
    .select('campaign_id')
    .eq('id', campaign_lead_id)
    .single();

  if (!campaignLead) {
    return NextResponse.json({ message: 'Campaign lead not found' }, { status: 404 });
  }

  return await processReply(campaign_lead_id, campaignLead.campaign_id, reply_text, from);
}

/**
 * Process a reply (shared logic)
 */
async function processReply(
  campaignLeadId: string,
  campaignId: string,
  replyText: string,
  fromEmail: string
) {
  // Log the reply event
  await supabase.from('email_events').insert({
    campaign_lead_id: campaignLeadId,
    event_type: 'replied',
    event_data: {
      from: fromEmail,
      reply_text: replyText,
      timestamp: new Date().toISOString(),
    },
  });

  // Analyze sentiment
  const sentiment = await analyzeReplySentiment(replyText);

  // Update campaign_leads status
  await supabase
    .from('campaign_leads')
    .update({
      status: 'replied',
      replied_at: new Date().toISOString(),
    })
    .eq('id', campaignLeadId);

  // Cancel any pending follow-ups (they replied, no need to follow up!)
  await supabase
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('campaign_lead_id', campaignLeadId)
    .in('status', ['draft', 'scheduled']);

  // If positive sentiment, add to hot leads
  if (sentiment.sentiment === 'positive') {
    // Check if already in hot_leads
    const { data: existing } = await supabase
      .from('hot_leads')
      .select('id')
      .eq('campaign_lead_id', campaignLeadId)
      .single();

    if (!existing) {
      // Get lead info
      const { data: campaignLead } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('id', campaignLeadId)
        .single();

      if (campaignLead) {
        await supabase.from('hot_leads').insert({
          campaign_lead_id: campaignLeadId,
          lead_id: campaignLead.lead_id,
          campaign_id: campaignId,
          engagement_score: 100, // Reply = instant hot
          reasoning: `Replied with ${sentiment.sentiment} sentiment: ${sentiment.summary}`,
          status: 'new',
        });
      }
    }
  }

  console.log(`[Reply Processed] Campaign Lead: ${campaignLeadId}, Sentiment: ${sentiment.sentiment}`);

  return NextResponse.json({
    message: 'Reply processed successfully',
    sentiment: sentiment.sentiment,
  });
}

/**
 * GET endpoint to test the webhook
 */
export async function GET() {
  return NextResponse.json({
    message: 'Reply webhook endpoint is active',
    supported_formats: ['resend', 'sendgrid', 'generic'],
    example: {
      generic: {
        campaign_lead_id: 'uuid-here',
        reply_text: 'Thanks for reaching out!',
        from: 'lead@example.com',
      },
    },
  });
}
