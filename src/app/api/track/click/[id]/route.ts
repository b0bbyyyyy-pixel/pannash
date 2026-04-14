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
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
    }

    // Log the click event
    await supabase.from('email_events').insert({
      campaign_lead_id: campaignLeadId,
      event_type: 'clicked',
      event_data: {
        url: targetUrl,
        user_agent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[Tracking] Link clicked: ${campaignLeadId} -> ${targetUrl}`);

    // Redirect to the original URL
    return NextResponse.redirect(targetUrl);
  } catch (err: any) {
    console.error('Click tracking error:', err);
    
    // Still redirect even on error (don't break user experience)
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');
    
    if (targetUrl) {
      return NextResponse.redirect(targetUrl);
    }
    
    return NextResponse.json({ error: 'Invalid tracking link' }, { status: 400 });
  }
}
