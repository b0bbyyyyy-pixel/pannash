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
      // Get campaign type
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('type, subject, email_body, sms_body')
        .eq('id', campaignId)
        .single();

      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      const isEmailCampaign = campaign.type === 'email';
      const isSMSCampaign = campaign.type === 'sms';

      // Get user's automation settings
      let { data: settings } = await supabase
        .from('automation_settings')
        .select('email_frequency, sms_frequency')
        .eq('user_id', user.id)
        .single();

      // Default frequencies (moderate = recommended)
      const emailFrequency = settings?.email_frequency || '5-10';
      const smsFrequency = settings?.sms_frequency || '5-10';

      // Check if appropriate queue is already populated
      const queueTable = isEmailCampaign ? 'email_queue' : 'sms_queue';
      const { data: existingQueue } = await supabase
        .from(queueTable)
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .limit(1);

      // Only populate if queue is empty
      if (!existingQueue || existingQueue.length === 0) {
        // Get all pending campaign leads ordered by position
        const { data: campaignLeads } = await supabase
          .from('campaign_leads')
          .select('id, lead_id, position, leads(name, email, company, phone)')
          .eq('campaign_id', campaignId)
          .eq('status', 'pending')
          .order('position', { ascending: true });

        if (campaignLeads && campaignLeads.length > 0) {
          // Generate scheduled times with user's frequency setting
          const frequency = isEmailCampaign ? emailFrequency : smsFrequency;
          const scheduledTimes = generateScheduledTimes(campaignLeads.length, undefined, frequency);

          if (isEmailCampaign) {
            // Create email queue items
            const queueItems = campaignLeads.map((campaignLead, index) => {
              const lead = campaignLead.leads as any;
              
              const personalizedSubject = campaign.subject
                ?.replace(/\[Name\]/g, lead?.name || '')
                .replace(/\[Company\]/g, lead?.company || '') || '';
              
              const personalizedBody = campaign.email_body
                ?.replace(/\[Name\]/g, lead?.name || '')
                .replace(/\[Company\]/g, lead?.company || '') || '';

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
              console.error('Error populating email queue:', queueError);
              return NextResponse.json({ error: 'Failed to populate email queue' }, { status: 500 });
            }
          } else if (isSMSCampaign) {
            // Create SMS queue items
            const queueItems = campaignLeads.map((campaignLead, index) => {
              const lead = campaignLead.leads as any;
              
              const personalizedBody = campaign.sms_body
                ?.replace(/\[Name\]/g, lead?.name || '')
                .replace(/\[Company\]/g, lead?.company || '')
                .replace(/\[Phone\]/g, lead?.phone || '') || '';

              return {
                campaign_id: campaignId,
                campaign_lead_id: campaignLead.id,
                lead_id: campaignLead.lead_id,
                sms_body: personalizedBody,
                scheduled_for: scheduledTimes[index],
                status: 'pending' as const,
                attempts: 0,
              };
            });

            const { error: queueError } = await supabase
              .from('sms_queue')
              .insert(queueItems);

            if (queueError) {
              console.error('Error populating SMS queue:', queueError);
              return NextResponse.json({ error: 'Failed to populate SMS queue' }, { status: 500 });
            }
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
