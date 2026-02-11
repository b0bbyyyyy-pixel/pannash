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
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all hot lead IDs for this user
    const { data: hotLeads } = await supabase
      .from('hot_leads')
      .select('campaign_lead_id')
      .eq('campaigns.user_id', user.id);

    const hotLeadIds = hotLeads?.map(hl => hl.campaign_lead_id) || [];

    return NextResponse.json({ hotLeadIds });
  } catch (err: any) {
    console.error('Check hot leads error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
