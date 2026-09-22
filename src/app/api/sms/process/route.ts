import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { replaceTemplateVariables } from '@/lib/queue';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch pending SMS that are ready to send (scheduled_for <= now)
    // ONLY for active SMS campaigns
    const now = new Date().toISOString();
    const { data: queueItems, error: queueError } = await supabase
      .from('sms_queue')
      .select(`
        *,
        campaigns!inner(user_id, sms_body, status, type)
      `)
      .eq('status', 'pending')
      .eq('campaigns.status', 'active')
      .eq('campaigns.type', 'sms')
      .lte('scheduled_for', now)
      .limit(10);
    
    // Fetch lead data separately
    let enrichedQueueItems: any[] = [];
    if (queueItems && queueItems.length > 0) {
      const leadIds = queueItems.map(item => item.lead_id);
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, name, company, email, phone, notes')
        .in('id', leadIds);
      
      enrichedQueueItems = queueItems.map(item => ({
        ...item,
        leads: leadsData?.find(l => l.id === item.lead_id) || null
      }));
    }

    if (queueError) {
      console.error('SMS Queue fetch error:', queueError);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!enrichedQueueItems || enrichedQueueItems.length === 0) {
      return NextResponse.json({ message: 'No SMS to send', processed: 0 });
    }

    const creds = await getTwilioCreds(supabase, user.id);
    if (!creds) {
      return NextResponse.json({ error: 'No Twilio connection found' }, { status: 400 });
    }

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Process each SMS
    for (const item of enrichedQueueItems) {
      try {
        const lead = item.leads;
        const campaign = item.campaigns;

        if (!lead?.phone) {
          console.log(`Skipping lead without phone: ${lead?.email || 'unknown'}`);
          await supabase
            .from('sms_queue')
            .update({ 
              status: 'failed', 
              last_error: 'No phone number',
              attempts: item.attempts + 1 
            })
            .eq('id', item.id);
          failureCount++;
          continue;
        }

        // Mark as sending
        await supabase
          .from('sms_queue')
          .update({ status: 'sending', updated_at: new Date().toISOString() })
          .eq('id', item.id);

        // Replace template variables in the body
        const personalizedBody = replaceTemplateVariables(item.sms_body, lead);

        const message = await sendTwilioSms(creds, lead.phone, personalizedBody);
        if (message.status === 'failed') {
          throw new Error(message.error || 'Twilio delivery failed');
        }

        console.log(`SMS sent to ${lead.phone}, SID: ${message.sid}`);

        // Update queue status
        await supabase
          .from('sms_queue')
          .update({ 
            status: 'sent', 
            twilio_sid: message.sid,
            updated_at: new Date().toISOString() 
          })
          .eq('id', item.id);

        // Update campaign_lead status
        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'sent', 
            sent_at: new Date().toISOString() 
          })
          .eq('id', item.campaign_lead_id);

        // Log to sms_messages
        await supabase
          .from('sms_messages')
          .insert({
            campaign_lead_id: item.campaign_lead_id,
            direction: 'outbound',
            body: personalizedBody,
            from_number: creds.fromNumber,
            to_number: lead.phone,
            twilio_sid: message.sid,
            ai_generated: false,
          });

        successCount++;
      } catch (err: any) {
        console.error('Error sending SMS:', err);
        
        await supabase
          .from('sms_queue')
          .update({ 
            status: 'failed', 
            last_error: err.message,
            attempts: item.attempts + 1,
            updated_at: new Date().toISOString() 
          })
          .eq('id', item.id);

        await supabase
          .from('campaign_leads')
          .update({ 
            status: 'failed',
            error_message: err.message 
          })
          .eq('id', item.campaign_lead_id);

        failureCount++;
        if (!errors.includes(err.message)) {
          errors.push(err.message);
        }
      }
    }

    return NextResponse.json({
      message: `Processed ${successCount + failureCount} SMS`,
      success: successCount,
      failed: failureCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('SMS processor error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
