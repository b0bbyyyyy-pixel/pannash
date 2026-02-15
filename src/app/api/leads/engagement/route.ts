import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
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

    const campaignLeadId = req.nextUrl.searchParams.get('campaignLeadId');
    
    if (!campaignLeadId) {
      return NextResponse.json({ error: 'Missing campaignLeadId' }, { status: 400 });
    }

    // Get email events for this campaign lead
    const { data: events } = await supabase
      .from('email_events')
      .select('event_type')
      .eq('campaign_lead_id', campaignLeadId);

    const opens = events?.filter(e => e.event_type === 'open').length || 0;
    const clicks = events?.filter(e => e.event_type === 'click').length || 0;

    return NextResponse.json({ opens, clicks });
  } catch (error: any) {
    console.error('Error fetching engagement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
