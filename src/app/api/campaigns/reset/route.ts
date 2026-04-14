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

    const { campaignId } = await req.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 });
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

    // 1. Get all campaign_lead IDs
    const { data: campaignLeads } = await supabase
      .from('campaign_leads')
      .select('id')
      .eq('campaign_id', campaignId);

    const leadIds = campaignLeads?.map(cl => cl.id) || [];

    // 2. Delete all email_events for these campaign leads
    if (leadIds.length > 0) {
      await supabase
        .from('email_events')
        .delete()
        .in('campaign_lead_id', leadIds);
    }

    // 3. Delete all email_queue items for this campaign
    await supabase
      .from('email_queue')
      .delete()
      .eq('campaign_id', campaignId);

    // 4. Reset all campaign_leads
    await supabase
      .from('campaign_leads')
      .update({
        status: 'pending',
        sent_at: null,
        opened_at: null,
        replied_at: null,
        next_email_at: null,
        loop_count: 0,
      })
      .eq('campaign_id', campaignId);

    // 5. Set campaign status to paused
    await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId);

    revalidatePath(`/campaigns/${campaignId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Campaign reset successfully'
    });
  } catch (error: any) {
    console.error('Error resetting campaign:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
