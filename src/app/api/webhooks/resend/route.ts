import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Resend webhook received:', body.type, body);

    const { type, data } = body;
    
    // Extract email address for logging
    const toEmail = data?.to?.[0] || data?.to || 'unknown';
    
    // Try to get campaign_lead_id from tags first (more reliable)
    let campaignLeadId = null;
    if (data?.tags) {
      const tagObj = data.tags.find((t: any) => t.name === 'campaign_lead_id');
      if (tagObj) {
        campaignLeadId = tagObj.value;
        console.log('Found campaign_lead_id from tags:', campaignLeadId);
      }
    }

    // If no tag, try to find by email
    if (!campaignLeadId) {
      if (!toEmail) {
        console.log('No email or tag found');
        return NextResponse.json({ received: true });
      }

      // Find the campaign_lead by email
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', toEmail)
        .single();

      if (!lead) {
        console.log(`No lead found for email: ${toEmail}`);
        return NextResponse.json({ received: true });
      }

      // Find campaign_lead for this email that was recently sent
      const { data: campaignLead } = await supabase
        .from('campaign_leads')
        .select('id, campaign_id, status')
        .eq('lead_id', lead.id)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (!campaignLead) {
        console.log(`No campaign_lead found for lead: ${lead.id}`);
        return NextResponse.json({ received: true });
      }
      
      campaignLeadId = campaignLead.id;
    }

    // Get the campaign_lead
    const { data: campaignLead } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, status')
      .eq('id', campaignLeadId)
      .single();

    if (!campaignLead) {
      console.log(`Campaign lead not found: ${campaignLeadId}`);
      return NextResponse.json({ received: true });
    }

    // Handle different webhook events
    switch (type) {
      case 'email.sent':
        console.log(`✅ Email sent to ${toEmail}`);
        // Already handled during actual send
        break;

      case 'email.delivered':
        console.log(`📬 Email delivered to ${toEmail}`);
        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'delivered',
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignLead.id)
          .eq('status', 'sent'); // Only update if currently 'sent'
        break;

      case 'email.delivery_delayed':
        console.log(`⏱️ Email delivery delayed for ${toEmail}`);
        // Keep as 'sent', just log it
        break;

      case 'email.bounced':
        console.log(`❌ Email bounced for ${toEmail}`);
        const bounceReason = data?.bounce?.message || 'Email bounced';
        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'bounced',
            bounced_at: new Date().toISOString(),
            bounce_reason: bounceReason,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignLead.id);
        
        // Log event
        await supabase
          .from('email_events')
          .insert({
            campaign_lead_id: campaignLead.id,
            event_type: 'bounced',
            metadata: { reason: bounceReason }
          });
        break;

      case 'email.complained':
        console.log(`🚫 Email marked as spam by ${toEmail}`);
        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'complained',
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignLead.id);
        break;

      case 'email.opened':
        console.log(`👁️ Email opened by ${toEmail}`);
        // Only update status if currently 'sent' or 'delivered', not if already 'replied' etc.
        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'opened',
            opened_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignLead.id)
          .in('status', ['sent', 'delivered']);
        
        // Log event
        await supabase
          .from('email_events')
          .insert({
            campaign_lead_id: campaignLead.id,
            event_type: 'opened',
            metadata: { timestamp: new Date().toISOString() }
          });
        break;

      case 'email.clicked':
        console.log(`🖱️ Email link clicked by ${toEmail}`);
        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'clicked',
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignLead.id)
          .in('status', ['sent', 'delivered', 'opened']);
        
        // Log event
        await supabase
          .from('email_events')
          .insert({
            campaign_lead_id: campaignLead.id,
            event_type: 'clicked',
            metadata: { url: data?.click?.link }
          });
        break;

      default:
        console.log(`Unknown event type: ${type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
