import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

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

    const { campaignId, leadListIds } = await req.json();

    if (!campaignId || !leadListIds || !Array.isArray(leadListIds)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Verify campaign ownership
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get all leads from selected lists
    const { data: leadsFromLists } = await supabase
      .from('leads')
      .select('id')
      .in('list_id', leadListIds);

    if (!leadsFromLists || leadsFromLists.length === 0) {
      return NextResponse.json({ error: 'No leads found in selected lists' }, { status: 400 });
    }

    // Get existing lead IDs in this campaign
    const { data: existingCampaignLeads } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', campaignId);

    const existingLeadIds = new Set((existingCampaignLeads || []).map((cl: any) => cl.lead_id));

    // Filter out leads already in campaign
    const newLeadIds = leadsFromLists
      .map(lead => lead.id)
      .filter(id => !existingLeadIds.has(id));

    if (newLeadIds.length === 0) {
      return NextResponse.json({ 
        added: 0,
        message: 'All leads from selected lists are already in this campaign'
      });
    }

    // Add new leads to campaign
    const campaignLeadsData = newLeadIds.map((leadId) => ({
      campaign_id: campaignId,
      lead_id: leadId,
      status: 'pending',
    }));

    const { error } = await supabase
      .from('campaign_leads')
      .insert(campaignLeadsData);

    if (error) {
      console.error('Error adding leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath(`/campaigns/${campaignId}`);

    return NextResponse.json({ 
      success: true,
      added: newLeadIds.length,
      message: `Added ${newLeadIds.length} new leads to campaign`
    });
  } catch (error: any) {
    console.error('Error in add leads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
