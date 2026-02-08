import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';

export default async function CampaignsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // No-op: cookies are read-only in Server Components
        },
        remove() {
          // No-op: cookies are read-only in Server Components
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth');
  }

  // Fetch user's campaigns
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
  }

  // Fetch campaign stats (count of leads per campaign)
  const campaignStats = campaigns ? await Promise.all(
    campaigns.map(async (campaign) => {
      const { count } = await supabase
        .from('campaign_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id);
      
      const { count: sentCount } = await supabase
        .from('campaign_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent');

      return {
        ...campaign,
        totalLeads: count || 0,
        sentLeads: sentCount || 0,
      };
    })
  ) : [];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="text-2xl font-bold text-blue-600">
              Pannash
            </Link>
            <div className="flex gap-4">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/leads"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Leads
              </Link>
              <Link
                href="/campaigns"
                className="text-blue-600 font-medium"
              >
                Campaigns
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-gray-600 mt-2">
              Manage your outreach campaigns and track performance
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            + Create Campaign
          </Link>
        </div>

        {/* Campaigns List */}
        {!campaigns || campaigns.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">📧</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              No campaigns yet
            </h3>
            <p className="text-gray-600 mb-6">
              Create your first outreach campaign to start sending emails
            </p>
            <Link
              href="/campaigns/new"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Create Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {campaignStats.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {campaign.name}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
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
                    <p className="text-gray-600 mb-4">
                      <strong>Subject:</strong> {campaign.subject}
                    </p>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">Total Leads:</span>{' '}
                        <strong className="text-gray-900">{campaign.totalLeads}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Sent:</span>{' '}
                        <strong className="text-gray-900">{campaign.sentLeads}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Pending:</span>{' '}
                        <strong className="text-gray-900">
                          {campaign.totalLeads - campaign.sentLeads}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
