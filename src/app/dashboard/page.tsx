import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
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
  if (!user) redirect('/auth');

  // Check for main campaign first
  let { data: mainCampaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_main', true)
    .single();

  // If no main campaign, check for last viewed campaign from cookie
  if (!mainCampaign) {
    const lastViewedId = cookieStore.get('lastViewedCampaign')?.value;
    
    if (lastViewedId) {
      // Verify this campaign exists and belongs to user
      const { data: lastViewed } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', lastViewedId)
        .eq('user_id', user.id)
        .single();
      
      if (lastViewed) {
        mainCampaign = lastViewed;
      }
    }
  }

  // If still no campaign, get most recent active/paused campaign
  if (!mainCampaign) {
    const { data } = await supabase
      .from('campaigns')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    mainCampaign = data;
  }

  // If user has a campaign, redirect to it
  if (mainCampaign) {
    redirect(`/campaigns/${mainCampaign.id}`);
  }

  // Otherwise show campaigns list
  redirect('/campaigns');
}
