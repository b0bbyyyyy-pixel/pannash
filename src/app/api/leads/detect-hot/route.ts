import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { analyzeEngagement } from '@/lib/ai-followup';

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

    // Get all sent campaign leads that aren't already marked hot
    const { data: campaignLeads, error: leadsError } = await supabase
      .from('campaign_leads')
      .select(`
        id,
        lead_id,
        campaign_id,
        status,
        campaigns(user_id, subject, email_body),
        leads(name, company, email)
      `)
      .eq('campaigns.user_id', user.id)
      .in('status', ['sent', 'opened', 'clicked']);

    if (leadsError) {
      console.error('Error fetching campaign leads:', leadsError);
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      return NextResponse.json({ message: 'No leads to check', detected: 0 });
    }

    let detectedCount = 0;

    // Check engagement for each lead
    for (const campaignLead of campaignLeads) {
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

      // If hot, add to hot_leads table
      if (analysis.isHot) {
        // Check if already in hot_leads
        const { data: existing } = await supabase
          .from('hot_leads')
          .select('id')
          .eq('campaign_lead_id', campaignLead.id)
          .single();

        if (!existing) {
          await supabase.from('hot_leads').insert({
            campaign_lead_id: campaignLead.id,
            lead_id: campaignLead.lead_id,
            campaign_id: campaignLead.campaign_id,
            engagement_score: analysis.score,
            reasoning: analysis.reasoning,
            status: 'new',
          });

          // Update campaign_leads status
          await supabase
            .from('campaign_leads')
            .update({ status: 'hot' })
            .eq('id', campaignLead.id);

          detectedCount++;
          console.log(`[Hot Lead Detected] ${(campaignLead.leads as any)?.name || 'Unknown'} - Score: ${analysis.score}`);
        }
      }
    }

    return NextResponse.json({
      message: `Checked ${campaignLeads.length} leads, detected ${detectedCount} hot leads`,
      checked: campaignLeads.length,
      detected: detectedCount,
    });
  } catch (err: any) {
    console.error('Hot lead detection error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
