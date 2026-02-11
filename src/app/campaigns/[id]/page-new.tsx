import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';
import CampaignActions from './CampaignActions';
import EngagementStats from './EngagementStats';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  if (!user) redirect('/auth');

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (campaignError || !campaign) {
    redirect('/campaigns');
  }

  // Fetch campaign leads
  const { data: campaignLeads } = await supabase
    .from('campaign_leads')
    .select(`
      id,
      status,
      sent_at,
      opened_at,
      replied_at,
      leads(name, email, phone, company)
    `)
    .eq('campaign_id', id)
    .order('created_at', { ascending: true });

  // Fetch email queue
  const { data: queueItems } = await supabase
    .from('email_queue')
    .select('*')
    .eq('campaign_id', id);

  // Calculate stats
  const total = campaignLeads?.length || 0;
  const sent = campaignLeads?.filter(l => ['sent', 'opened', 'replied'].includes(l.status)).length || 0;
  const opened = campaignLeads?.filter(l => ['opened', 'replied'].includes(l.status)).length || 0;
  const replied = campaignLeads?.filter(l => l.status === 'replied').length || 0;
  const pending = total - sent;

  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;

  // Server actions
  async function updateStatus(formData: FormData) {
    'use server';
    const newStatus = formData.get('status') as string;
    
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

    await supabase
      .from('campaigns')
      .update({ status: newStatus })
      .eq('id', id);

    revalidatePath(`/campaigns/${id}`);
  }

  async function deleteCampaign() {
    'use server';
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

    await supabase.from('campaigns').delete().eq('id', id);
    redirect('/campaigns');
  }

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-12">
        {/* Back Link */}
        <Link
          href="/campaigns"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          ← Back to Campaigns
        </Link>

        {/* Campaign Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                {campaign.name}
              </h1>
              <p className="text-gray-500">
                Created {new Date(campaign.created_at).toLocaleDateString()}
              </p>
            </div>
            <CampaignActions 
              campaignId={id}
              status={campaign.status}
              updateStatus={updateStatus}
              deleteCampaign={deleteCampaign}
            />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{total}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{pending}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Pending</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{sent}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Sent</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">{opened}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Opened</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">{openRate}%</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Open Rate</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{replyRate}%</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Reply Rate</div>
            </div>
          </div>
        </div>

        {/* Campaign Template */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Template</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Subject</div>
              <div className="text-gray-900">{campaign.subject}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Body</div>
              <div className="text-gray-900 whitespace-pre-wrap">{campaign.email_body}</div>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Campaign Leads</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {campaignLeads?.map((cl: any) => (
                <tr key={cl.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium text-gray-900">{cl.leads?.name}</div>
                    <EngagementStats campaignLeadId={cl.id} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cl.leads?.email}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cl.leads?.company || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                      cl.status === 'replied' ? 'bg-green-100 text-green-800' :
                      cl.status === 'opened' ? 'bg-blue-100 text-blue-800' :
                      cl.status === 'sent' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {cl.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cl.sent_at ? new Date(cl.sent_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
