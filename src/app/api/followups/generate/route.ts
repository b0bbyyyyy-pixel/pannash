import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { analyzeEngagement, generateFollowUp } from '@/lib/ai-followup';
import { calculateFollowUpDate, shouldFollowUp, DEFAULT_FOLLOWUP_RULES, getABTestVariant } from '@/lib/followup-scheduler';

/**
 * Auto-generate follow-ups for warm leads
 * This API scans all sent emails and creates follow-ups for leads that need them
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all sent campaign leads that don't have pending/scheduled follow-ups
    const { data: campaignLeads, error: leadsError } = await supabase
      .from('campaign_leads')
      .select(`
        id,
        lead_id,
        campaign_id,
        status,
        sent_at,
        campaigns(user_id, subject, email_body),
        leads(name, company, email)
      `)
      .eq('campaigns.user_id', user.id)
      .in('status', ['sent', 'opened', 'clicked'])
      .not('sent_at', 'is', null);

    if (leadsError) {
      console.error('Error fetching campaign leads:', leadsError);
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      return NextResponse.json({ 
        message: 'No leads to follow up with', 
        generated: 0 
      });
    }

    let generatedCount = 0;

    for (const campaignLead of campaignLeads) {
      // Check if already has a pending/scheduled follow-up
      const { data: existingFollowUp } = await supabase
        .from('follow_ups')
        .select('id')
        .eq('campaign_lead_id', campaignLead.id)
        .in('status', ['draft', 'scheduled'])
        .single();

      if (existingFollowUp) {
        continue; // Skip if already has a follow-up
      }

      // Get engagement stats
      const { data: events } = await supabase
        .from('email_events')
        .select('event_type, created_at')
        .eq('campaign_lead_id', campaignLead.id);

      const opens = events?.filter((e) => e.event_type === 'opened').length || 0;
      const clicks = events?.filter((e) => e.event_type === 'clicked').length || 0;
      const replies = events?.filter((e) => e.event_type === 'replied').length || 0;
      
      const lastActivityAt = events && events.length > 0
        ? events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : undefined;

      // Analyze engagement
      const analysis = await analyzeEngagement({ opens, clicks, replies, lastActivityAt });

      // Skip if hot (they'll be handled manually) or cold (no engagement)
      if (analysis.isHot || analysis.score < 5) {
        continue;
      }

      // Find matching follow-up rule
      const matchingRule = DEFAULT_FOLLOWUP_RULES.find(rule => 
        shouldFollowUp(analysis.score, rule)
      );

      if (!matchingRule) {
        continue;
      }

      // Get A/B test variant
      const variant = getABTestVariant(campaignLead.id);

      // Generate follow-up using AI
      const lead = campaignLead.leads as any;
      const campaign = campaignLead.campaigns as any;
      
      const followUp = await generateFollowUp({
        leadName: lead.name,
        leadCompany: lead.company,
        initialEmail: campaign.email_body,
        engagement: { opens, clicks, replies, lastActivityAt },
      });

      // Calculate when to send
      const scheduledFor = calculateFollowUpDate(
        new Date(campaignLead.sent_at!),
        matchingRule.timing
      );

      // Create follow-up record
      await supabase.from('follow_ups').insert({
        campaign_lead_id: campaignLead.id,
        lead_id: campaignLead.lead_id,
        campaign_id: campaignLead.campaign_id,
        subject: followUp.subject,
        body: followUp.body,
        scheduled_for: scheduledFor.toISOString(),
        status: 'scheduled',
        ab_variant: variant,
        engagement_score: analysis.score,
      });

      generatedCount++;
      console.log(`[Follow-up Generated] ${lead.name} - Score: ${analysis.score}, Variant: ${variant}, Send: ${scheduledFor.toLocaleDateString()}`);
    }

    return NextResponse.json({
      message: `Generated ${generatedCount} follow-ups`,
      checked: campaignLeads.length,
      generated: generatedCount,
    });
  } catch (err: any) {
    console.error('Follow-up generation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
