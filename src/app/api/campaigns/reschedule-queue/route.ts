import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateScheduledTimes } from '@/lib/queue';

// Reschedule pending emails in the queue based on new frequency settings
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

    // Verify user owns this campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get user's current frequency setting
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('email_frequency')
      .eq('user_id', user.id)
      .single();

    const emailFrequency = settings?.email_frequency || '2-5';

    // Get all pending queue items for this campaign
    const { data: queueItems } = await supabase
      .from('email_queue')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ 
        message: 'No pending emails to reschedule',
        rescheduled: 0 
      });
    }

    // Generate new scheduled times
    const newScheduledTimes = generateScheduledTimes(queueItems.length, undefined, emailFrequency);

    // Update each queue item with new scheduled time
    const updates = queueItems.map((item, index) => ({
      id: item.id,
      scheduled_for: newScheduledTimes[index],
    }));

    // Batch update
    for (const update of updates) {
      await supabase
        .from('email_queue')
        .update({ scheduled_for: update.scheduled_for })
        .eq('id', update.id);
    }

    return NextResponse.json({ 
      message: 'Queue rescheduled successfully',
      rescheduled: queueItems.length 
    });
  } catch (error: any) {
    console.error('Error rescheduling queue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
