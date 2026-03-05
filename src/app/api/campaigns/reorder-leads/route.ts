import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const { campaignId, leadOrder } = await req.json();

    if (!campaignId || !leadOrder || !Array.isArray(leadOrder)) {
      return NextResponse.json(
        { error: 'Missing campaignId or leadOrder' },
        { status: 400 }
      );
    }

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

    // Verify campaign belongs to user
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Update positions for all leads
    const updates = leadOrder.map((leadId: string, index: number) => 
      supabase
        .from('campaign_leads')
        .update({ position: index })
        .eq('id', leadId)
        .eq('campaign_id', campaignId)
    );

    await Promise.all(updates);

    console.log(`Reordered ${leadOrder.length} leads for campaign ${campaignId}`);

    return NextResponse.json({ 
      success: true, 
      message: `Reordered ${leadOrder.length} leads` 
    });
  } catch (error: any) {
    console.error('Error reordering leads:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
