import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decodeTrackingId } from '@/lib/email-tracking';

// Use service role key for server-side operations (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trackingId } = await params;
    const campaignLeadId = decodeTrackingId(trackingId);

    // Log the open event
    await supabase.from('email_events').insert({
      campaign_lead_id: campaignLeadId,
      event_type: 'opened',
      event_data: {
        user_agent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        timestamp: new Date().toISOString(),
      },
    });

    // Update campaign_leads status if not already opened/replied
    const { data: campaignLead } = await supabase
      .from('campaign_leads')
      .select('status')
      .eq('id', campaignLeadId)
      .single();

    if (campaignLead && campaignLead.status === 'sent') {
      await supabase
        .from('campaign_leads')
        .update({
          status: 'opened',
          opened_at: new Date().toISOString(),
        })
        .eq('id', campaignLeadId);
    }

    console.log(`[Tracking] Email opened: ${campaignLeadId}`);

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
      },
    });
  } catch (err: any) {
    console.error('Tracking pixel error:', err);
    
    // Still return a pixel even on error (don't break email display)
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    
    return new NextResponse(pixel, {
      headers: { 'Content-Type': 'image/gif' },
    });
  }
}
