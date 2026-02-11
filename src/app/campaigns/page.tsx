import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

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
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Campaigns
            </h1>
            <p className="text-gray-600">
              Manage your outreach campaigns
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            + Create
          </Link>
        </div>

        {!campaigns || campaigns.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-lg text-gray-900 mb-2">No campaigns yet</p>
            <p className="text-sm text-gray-600 mb-6">
              Create your first campaign to start sending
            </p>
            <Link
              href="/campaigns/new"
              className="inline-block px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaignsWithStats.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-400 transition-all group"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-gray-700">
                    {campaign.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{campaign.sent}</span> / {campaign.total} sent
                  </div>
                  <span
                    className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                      campaign.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : campaign.status === 'paused'
                        ? 'bg-yellow-100 text-yellow-800'
                        : campaign.status === 'completed'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {campaign.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
