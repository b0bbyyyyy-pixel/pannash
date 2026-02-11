import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Reset leads for looping
 * Runs periodically (e.g., every 14 days or monthly) to reset sent leads back to pending
 * This allows continuous outreach to the same lead list
 */
export async function POST(req: NextRequest) {
  try {
    // Get all active campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, user_id, name, created_at')
      .eq('status', 'active');

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ 
        message: 'No active campaigns to loop',
        reset: 0 
      });
    }

    let totalReset = 0;

    for (const campaign of campaigns) {
      // Get user's loop setting (default to 14 days)
      // TODO: Fetch from user_settings table when created
      const loopAfterDays = 14;
      const loopDate = new Date();
      loopDate.setDate(loopDate.getDate() - loopAfterDays);

      // Find leads that were sent more than X days ago and haven't replied
      const { data: oldLeads, error: leadsError } = await supabase
        .from('campaign_leads')
        .select('id, sent_at')
        .eq('campaign_id', campaign.id)
        .in('status', ['sent', 'opened', 'clicked'])
        .lt('sent_at', loopDate.toISOString())
        .not('status', 'eq', 'replied'); // Don't reset leads that replied

      if (leadsError || !oldLeads || oldLeads.length === 0) {
        console.log(`[Lead Loop] No old leads to reset for campaign ${campaign.name}`);
        continue;
      }

      // Reset these leads back to pending
      const leadIds = oldLeads.map(l => l.id);
      const { error: updateError } = await supabase
        .from('campaign_leads')
        .update({
          status: 'pending',
          sent_at: null,
          opened_at: null,
          replied_at: null,
        })
        .in('id', leadIds);

      if (updateError) {
        console.error(`[Lead Loop] Error resetting leads for campaign ${campaign.name}:`, updateError);
        continue;
      }

      totalReset += oldLeads.length;
      console.log(`[Lead Loop] Reset ${oldLeads.length} leads for campaign: ${campaign.name}`);
    }

    return NextResponse.json({
      message: `Lead loop complete: ${totalReset} leads reset across ${campaigns.length} campaigns`,
      campaigns: campaigns.length,
      reset: totalReset,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Lead loop error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET endpoint to check status
 */
export async function GET() {
  return NextResponse.json({
    message: 'Lead loop endpoint is active',
    description: 'POST to this endpoint to reset old leads back to pending for re-sending',
    schedule: 'Should run every 14 days or monthly (via cron job)',
  });
}
