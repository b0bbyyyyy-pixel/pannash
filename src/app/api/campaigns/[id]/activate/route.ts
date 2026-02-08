import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateScheduledTimes } from '@/lib/queue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name, options) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get all pending leads for this campaign
    const { data: campaignLeads, error: leadsError } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      return NextResponse.json({ error: 'No pending leads to queue' }, { status: 400 });
    }

    // Generate scheduled times for all leads
    const scheduledTimes = generateScheduledTimes(campaignLeads.length);

    // Create queue items
    const queueItems = campaignLeads.map((cl, index) => ({
      campaign_id: campaignId,
      lead_id: cl.lead_id,
      scheduled_for: scheduledTimes[index],
      status: 'pending' as const,
      attempts: 0,
    }));

    const { error: queueError } = await supabase
      .from('email_queue')
      .insert(queueItems);

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    // Update campaign_leads status to 'queued'
    const { error: updateError } = await supabase
      .from('campaign_leads')
      .update({ status: 'queued' })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update campaign status to 'active'
    await supabase
      .from('campaigns')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', campaignId);

    return NextResponse.json({
      success: true,
      queued: campaignLeads.length,
      message: `${campaignLeads.length} emails queued for sending`,
    });
  } catch (err: any) {
    console.error('Activate campaign error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
