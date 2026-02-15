import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateScheduledTimes } from '@/lib/queue';

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId, status } = await req.json();

    if (!campaignId || !status) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    if (status !== 'active' && status !== 'paused') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // If activating campaign, populate the queue if needed
    if (status === 'active') {
      // Get user's automation settings
      let { data: settings } = await supabase
        .from('automation_settings')
        .select('email_frequency')
        .eq('user_id', user.id)
        .single();

      // Default to '2-5' if no settings
      const emailFrequency = settings?.email_frequency || '2-5';

      // Check if queue is already populated
      const { data: existingQueue } = await supabase
        .from('email_queue')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .limit(1);

      // Only populate if queue is empty
      if (!existingQueue || existingQueue.length === 0) {
        // Get campaign details
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('subject, email_body')
          .eq('id', campaignId)
          .single();

        if (!campaign) {
          return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        // Get all pending campaign leads
        const { data: campaignLeads } = await supabase
          .from('campaign_leads')
          .select('id, lead_id, leads(name, email, company)')
          .eq('campaign_id', campaignId)
          .eq('status', 'pending');

        if (campaignLeads && campaignLeads.length > 0) {
          // Generate scheduled times with user's frequency setting
          const scheduledTimes = generateScheduledTimes(campaignLeads.length, undefined, emailFrequency);

          // Create queue items with personalized emails
          const queueItems = campaignLeads.map((campaignLead, index) => {
            const lead = campaignLead.leads;
            
            // Replace template variables
            const personalizedSubject = campaign.subject
              .replace(/\[Name\]/g, lead.name || '')
              .replace(/\[Company\]/g, lead.company || '');
            
            const personalizedBody = campaign.email_body
              .replace(/\[Name\]/g, lead.name || '')
              .replace(/\[Company\]/g, lead.company || '');

            return {
              campaign_id: campaignId,
              campaign_lead_id: campaignLead.id,
              lead_id: campaignLead.lead_id,
              email_subject: personalizedSubject,
              email_body: personalizedBody,
              scheduled_for: scheduledTimes[index],
              status: 'pending' as const,
              attempts: 0,
            };
          });

          const { error: queueError } = await supabase
            .from('email_queue')
            .insert(queueItems);

          if (queueError) {
            console.error('Error populating queue:', queueError);
            return NextResponse.json({ error: 'Failed to populate queue' }, { status: 500 });
          }

          // Update campaign_leads status to 'queued'
          await supabase
            .from('campaign_leads')
            .update({ status: 'queued' })
            .eq('campaign_id', campaignId)
            .eq('status', 'pending');
        }
      }
    }

    // Update campaign status
    const { error } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', campaignId)
      .eq('user_id', user.id); // Ensure user owns the campaign

    if (error) {
      console.error('Error updating campaign status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      message: `Campaign ${status === 'active' ? 'activated' : 'paused'}`,
      status 
    });
  } catch (error) {
    console.error('Error in toggle campaign status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
