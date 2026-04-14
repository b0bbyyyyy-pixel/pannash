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
    const formData = await req.formData();
    
    const messageSid = formData.get('MessageSid') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const to = formData.get('To') as string;

    console.log(`[SMS Status] SID: ${messageSid}, Status: ${messageStatus}, To: ${to}`);

    if (!messageSid || !messageStatus) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Update sms_queue status
    const { data: queueItem } = await supabase
      .from('sms_queue')
      .select('id, campaign_lead_id')
      .eq('twilio_sid', messageSid)
      .single();

    if (queueItem) {
      // Map Twilio status to our status
      let newStatus = 'sent';
      let campaignLeadStatus = 'sent';

      if (messageStatus === 'failed' || messageStatus === 'undelivered') {
        newStatus = 'failed';
        campaignLeadStatus = 'failed';
      } else if (messageStatus === 'delivered') {
        newStatus = 'sent';
        campaignLeadStatus = 'delivered';
      }

      // Update queue item
      await supabase
        .from('sms_queue')
        .update({ status: newStatus })
        .eq('id', queueItem.id);

      // Update campaign_lead
      await supabase
        .from('campaign_leads')
        .update({ 
          status: campaignLeadStatus,
          delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : undefined
        })
        .eq('id', queueItem.campaign_lead_id);

      console.log(`[SMS Status] Updated queue ${queueItem.id} and campaign_lead ${queueItem.campaign_lead_id} to ${campaignLeadStatus}`);
    }

    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error: any) {
    console.error('[SMS Status] Error:', error);
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}
