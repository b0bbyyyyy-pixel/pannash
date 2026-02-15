import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRandomDelay } from '@/lib/queue';

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

    const { name, email, phone, company, notes, list_id } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('leads')
      .insert({
        user_id: user.id,
        name,
        email,
        phone: phone || null,
        company: company || null,
        notes: notes || null,
        list_id: list_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-add to active campaigns using this lead list
    if (list_id) {
      const { data: activeCampaigns } = await supabase
        .from('campaigns')
        .select('id, subject, email_body')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (activeCampaigns && activeCampaigns.length > 0) {
        // For each active campaign, check if it uses this lead list
        for (const campaign of activeCampaigns) {
          // Get campaign leads to check if this campaign uses the same list
          const { data: campaignLeads } = await supabase
            .from('campaign_leads')
            .select('*, leads!inner(list_id)')
            .eq('campaign_id', campaign.id)
            .limit(1);

          // If campaign has leads from the same list, add this new lead
          if (campaignLeads && campaignLeads.length > 0 && 
              campaignLeads[0].leads.list_id === list_id) {
            
            // Add to campaign_leads
            const { data: campaignLead } = await supabase
              .from('campaign_leads')
              .insert({
                campaign_id: campaign.id,
                lead_id: data.id,
              })
              .select()
              .single();

            if (campaignLead) {
              // Get user's automation settings for scheduling
              const { data: settings } = await supabase
                .from('automation_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

              const frequencyRange = settings?.email_frequency || '2-5';
              
              // Get the last scheduled email time for this campaign
              const { data: lastEmail } = await supabase
                .from('email_queue')
                .select('scheduled_for')
                .eq('campaign_id', campaign.id)
                .order('scheduled_for', { ascending: false })
                .limit(1)
                .single();

              // Calculate delay based on frequency setting
              const delaySeconds = getRandomDelay(frequencyRange);
              
              // Schedule from last email or now
              const baseTime = lastEmail?.scheduled_for 
                ? new Date(lastEmail.scheduled_for)
                : new Date();
              
              const scheduledTime = new Date(baseTime.getTime() + delaySeconds * 1000);

              // Replace template variables
              const personalizedSubject = campaign.subject
                .replace(/\[Name\]/g, data.name || '')
                .replace(/\[Company\]/g, data.company || '');
              
              const personalizedBody = campaign.email_body
                .replace(/\[Name\]/g, data.name || '')
                .replace(/\[Company\]/g, data.company || '');

              // Add to email queue
              await supabase
                .from('email_queue')
                .insert({
                  campaign_id: campaign.id,
                  campaign_lead_id: campaignLead.id,
                  lead_id: data.id,
                  email_subject: personalizedSubject,
                  email_body: personalizedBody,
                  scheduled_for: scheduledTime.toISOString(),
                  status: 'pending',
                });

              console.log(`Auto-added lead ${data.id} to campaign ${campaign.id}`);
            }
          }
        }
      }
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    console.error('Error in create lead:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
