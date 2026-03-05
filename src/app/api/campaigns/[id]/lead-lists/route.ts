import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Get all unique lead list IDs from this campaign's leads
    const { data: campaignLeads } = await supabase
      .from('campaign_leads')
      .select('leads(list_id)')
      .eq('campaign_id', id);

    const leadListIds = [...new Set(
      (campaignLeads || [])
        .map((cl: any) => cl.leads?.list_id)
        .filter(id => id !== null)
    )];

    return NextResponse.json({ leadListIds });
  } catch (error: any) {
    console.error('Error fetching campaign lead lists:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
