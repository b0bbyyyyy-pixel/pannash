import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import CampaignCard from './CampaignCard';

export default async function CampaignsPage() {
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

  // Fetch user's campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Get stats for each campaign
  const campaignsWithStats = await Promise.all(
    (campaigns || []).map(async (campaign) => {
      const { data: leads } = await supabase
        .from('campaign_leads')
        .select('status')
        .eq('campaign_id', campaign.id);

      const total = leads?.length || 0;
      const sent = leads?.filter(l => ['sent', 'opened', 'replied'].includes(l.status)).length || 0;

      return { ...campaign, total, sent };
    })
  );

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[1600px] mx-auto px-12 pt-28 pb-16">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Campaigns
            </h1>
            <p className="text-[#6b6b6b] text-sm">
              Manage your outreach campaigns
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="px-5 py-2.5 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
          >
            New Campaign
          </Link>
        </div>

        {!campaigns || campaigns.length === 0 ? (
          <div className="bg-white border border-[#e5e5e5] rounded-lg p-16 text-center">
            <p className="text-lg text-[#1a1a1a] mb-2 font-medium">No campaigns yet</p>
            <p className="text-sm text-[#6b6b6b] mb-8">
              Create your first campaign to start sending
            </p>
            <Link
              href="/campaigns/new"
              className="inline-block px-5 py-2.5 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {campaignsWithStats.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
