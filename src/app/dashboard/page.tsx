import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import LeadsTable from './LeadsTable';
import OnboardingCheck from './OnboardingCheck';

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

  // Check if user has email connection
  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const hasEmailConnection = !!(connections && connections.length > 0);

  // Get user's main/active campaign
  const { data: activeCampaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // If no active campaign, get most recent campaign
  const campaign = activeCampaign || await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .then(res => res.data);

  let campaignLeads: any[] = [];
  let queueItems: any[] = [];
  let stats = { total: 0, sent: 0, replied: 0, hot: 0 };

  if (campaign) {
    // Get campaign leads with their details
    const { data: leads } = await supabase
      .from('campaign_leads')
      .select(`
        id,
        status,
        sent_at,
        opened_at,
        replied_at,
        leads(name, email, phone, company)
      `)
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });

    // Get queue items for pending/queued leads
    const { data: queue } = await supabase
      .from('email_queue')
      .select(`
        campaign_lead_id,
        scheduled_for,
        status
      `)
      .eq('campaign_id', campaign.id)
      .in('status', ['pending']);

    campaignLeads = leads || [];
    queueItems = queue || [];

    // Calculate stats
    stats.total = campaignLeads.length;
    stats.sent = campaignLeads.filter(l => l.status === 'sent' || l.status === 'opened' || l.status === 'replied').length;
    stats.replied = campaignLeads.filter(l => l.status === 'replied').length;
    
    // Get hot leads count
    const { data: hotLeads } = await supabase
      .from('hot_leads')
      .select('campaign_lead_id')
      .eq('campaign_id', campaign.id);
    stats.hot = hotLeads?.length || 0;
  }

  // Map queue items to campaign leads
  const leadsWithQueue = campaignLeads.map(lead => {
    const queueItem = queueItems.find(q => q.campaign_lead_id === lead.id);
    return {
      ...lead,
      scheduledFor: queueItem?.scheduled_for,
      queueStatus: queueItem?.status,
    };
  });

  // Get today's sent count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sentToday = campaignLeads.filter(l => {
    if (!l.sent_at) return false;
    const sentDate = new Date(l.sent_at);
    return sentDate >= today;
  }).length;

  const replyRate = stats.sent > 0 
    ? Math.round((stats.replied / stats.sent) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-12">
        {/* Check onboarding status and show warning if needed */}
        <OnboardingCheck hasEmailConnection={hasEmailConnection} />
        
        {!campaign ? (
          // No campaign state
          <div className="text-center py-32">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              No campaigns yet
            </h2>
            <p className="text-gray-600 mb-8">
              Create your first campaign to start sending
            </p>
            <Link
              href="/campaigns"
              className="inline-block px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <>
            {/* Campaign Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">
                    {campaign.name}
                  </h1>
                  <p className="text-gray-500">
                    {campaign.status === 'active' ? '🟢 Active' : '⚪ Paused'}
                  </p>
                </div>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
                >
                  View Details
                </Link>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {stats.total}
                  </div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide">
                    Total Leads
                  </div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {sentToday}
                  </div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide">
                    Sent Today
                  </div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {replyRate}%
                  </div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide">
                    Reply Rate
                  </div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="text-3xl font-bold text-red-600 mb-1">
                    {stats.hot}
                  </div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide">
                    Hot Leads
                  </div>
                </div>
              </div>
            </div>

            {/* Leads Table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <LeadsTable leads={leadsWithQueue} campaignId={campaign.id} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
