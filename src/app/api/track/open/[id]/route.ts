import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decodeTrackingId } from '@/lib/email-tracking';

// Create a Supabase client with service role key if available, otherwise anon key
// For tracking to work without service role key, we need to ensure RLS policies allow it
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// If using service role key, create admin client, otherwise regular client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trackingId } = await params;
    let campaignLeadId;
    
    try {
      campaignLeadId = decodeTrackingId(trackingId);
      console.log(`[Tracking] Decoded tracking ID: ${trackingId} -> ${campaignLeadId}`);
    } catch (decodeError) {
      console.error(`[Tracking] Failed to decode tracking ID: ${trackingId}`, decodeError);
      return returnTrackingPixel();
    }

    console.log(`[Tracking] Processing open for campaign_lead: ${campaignLeadId}`);

    // First, verify the campaign_lead exists and get campaign info
    const { data: campaignLead, error: leadError } = await supabase
      .from('campaign_leads')
      .select('id, status, campaign_id, lead_id')
      .eq('id', campaignLeadId)
      .single();

    console.log(`[Tracking] Query result - Data:`, campaignLead, 'Error:', leadError);

    if (leadError || !campaignLead) {
      console.error(`[Tracking] Campaign lead not found: ${campaignLeadId}`, leadError);
      // Still return pixel to avoid breaking email display
      return returnTrackingPixel();
    }

    console.log(`[Tracking] Found campaign_lead with status: ${campaignLead.status}`);

    // Log the open event
    const { error: eventError } = await supabase
      .from('email_events')
      .insert({
        campaign_lead_id: campaignLeadId,
        event_type: 'opened',
        event_data: {
          user_agent: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          timestamp: new Date().toISOString(),
        },
      });

    if (eventError) {
      console.error('[Tracking] Error inserting email event:', eventError);
    } else {
      console.log('[Tracking] Email event logged successfully');
    }

    // Update campaign_leads status if currently 'sent' or 'delivered'
    console.log(`[Tracking] About to update status. Current status: ${campaignLead.status}`);
    
    if (['sent', 'delivered'].includes(campaignLead.status)) {
      console.log(`[Tracking] Attempting to update campaign_lead ${campaignLeadId} to 'opened'`);
      
      const { data: updateData, error: updateError } = await supabase
        .from('campaign_leads')
        .update({
          status: 'opened',
          opened_at: new Date().toISOString(),
        })
        .eq('id', campaignLeadId)
        .select();

      console.log(`[Tracking] Update result - Data:`, updateData, 'Error:', updateError);

      if (updateError) {
        console.error('[Tracking] ❌ Error updating campaign_lead status:', updateError);
      } else {
        console.log(`[Tracking] ✅ Successfully updated campaign_lead ${campaignLeadId} to 'opened'`);
      }
    } else {
      console.log(`[Tracking] ⚠️ Campaign lead status is '${campaignLead.status}', not updating (only updates from sent/delivered)`);
    }

    return returnTrackingPixel();
  } catch (err: any) {
    console.error('[Tracking] Tracking pixel error:', err);
    return returnTrackingPixel();
  }
}

function returnTrackingPixel() {
  // Return a transparent 1x1 GIF pixel
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new NextResponse(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Expires': '0',
      'Pragma': 'no-cache',
    },
  });
}
