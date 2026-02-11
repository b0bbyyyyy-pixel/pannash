import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateScheduledTimes } from '@/lib/queue';

// Use service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Daily scheduler - runs at 9 AM to queue emails for the day
 * Can be triggered by:
 * 1. Vercel Cron Job (production)
 * 2. External cron service (cron-job.org)
 * 3. Manual API call (testing)
 */
export async function POST(req: NextRequest) {
  try {
    // Get all active campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, user_id, name')
      .eq('status', 'active');

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ 
        message: 'No active campaigns to schedule',
        scheduled: 0 
      });
    }

    let totalScheduled = 0;

    for (const campaign of campaigns) {
      // Get user's daily limit setting (default to 75)
      // TODO: Fetch from user_settings table when created
      const dailyLimit = 75;
      const spreadThroughoutDay = true;

      // Get pending leads that haven't been queued yet
      const { data: pendingLeads, error: leadsError } = await supabase
        .from('campaign_leads')
        .select('id, lead_id')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .limit(dailyLimit);

      if (leadsError || !pendingLeads || pendingLeads.length === 0) {
        console.log(`[Daily Schedule] No pending leads for campaign ${campaign.name}`);
        continue;
      }

      // Generate scheduled times for today
      const startTime = new Date();
      startTime.setHours(9, 0, 0, 0); // Start at 9 AM today
      
      const scheduledTimes = generateScheduledTimes(
        pendingLeads.length,
        startTime,
        spreadThroughoutDay
      );

      // Create queue items
      const queueItems = pendingLeads.map((lead, index) => ({
        campaign_id: campaign.id,
        campaign_lead_id: lead.id,
        lead_id: lead.lead_id,
        scheduled_for: scheduledTimes[index],
        status: 'pending',
      }));

      const { error: queueError } = await supabase
        .from('email_queue')
        .insert(queueItems);

      if (queueError) {
        console.error(`[Daily Schedule] Error queuing for campaign ${campaign.name}:`, queueError);
        continue;
      }

      // Update campaign_leads status to queued
      const leadIds = pendingLeads.map(l => l.id);
      await supabase
        .from('campaign_leads')
        .update({ status: 'queued' })
        .in('id', leadIds);

      totalScheduled += pendingLeads.length;
      console.log(`[Daily Schedule] Queued ${pendingLeads.length} emails for campaign: ${campaign.name}`);
    }

    return NextResponse.json({
      message: `Daily schedule complete: ${totalScheduled} emails queued across ${campaigns.length} campaigns`,
      campaigns: campaigns.length,
      scheduled: totalScheduled,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Daily schedule error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET endpoint to check status
 */
export async function GET() {
  return NextResponse.json({
    message: 'Daily scheduler endpoint is active',
    description: 'POST to this endpoint to queue emails for active campaigns',
    schedule: 'Should run daily at 9 AM (via cron job)',
  });
}
