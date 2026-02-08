import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

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
        set(name, value, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name, options) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth');
  }

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
  const { data: campaignLeads, error: leadsError } = await supabase
    .from('campaign_leads')
    .select('*, leads(*)')
    .eq('campaign_id', id)
    .order('created_at', { ascending: false });

  if (leadsError) {
    console.error('Error fetching campaign leads:', leadsError);
  }

  // Server Action: Update campaign status
  async function updateStatus(formData: FormData) {
    'use server';
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name, options) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const newStatus = formData.get('status') as string;
    const campaignId = formData.get('campaign_id') as string;

    const { error } = await supabase
      .from('campaigns')
      .update({ status: newStatus })
      .eq('id', campaignId);

    if (error) {
      console.error('Error updating campaign status:', error);
    }

    revalidatePath(`/campaigns/${campaignId}`);
  }

  // Server Action: Delete campaign
  async function deleteCampaign(formData: FormData) {
    'use server';
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name, options) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const campaignId = formData.get('campaign_id') as string;

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) {
      console.error('Error deleting campaign:', error);
    }

    redirect('/campaigns');
  }

  const statusCounts = {
    pending: campaignLeads?.filter(cl => cl.status === 'pending').length || 0,
    queued: campaignLeads?.filter(cl => cl.status === 'queued').length || 0,
    sent: campaignLeads?.filter(cl => cl.status === 'sent').length || 0,
    opened: campaignLeads?.filter(cl => cl.status === 'opened').length || 0,
    replied: campaignLeads?.filter(cl => cl.status === 'replied').length || 0,
    bounced: campaignLeads?.filter(cl => cl.status === 'bounced').length || 0,
    failed: campaignLeads?.filter(cl => cl.status === 'failed').length || 0,
  };

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
        <div className="mb-8">
          <Link
            href="/campaigns"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Campaigns
          </Link>
        </div>

        {/* Campaign Header */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-gray-900">
                  {campaign.name}
                </h1>
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
              <p className="text-gray-600">
                Created on {new Date(campaign.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              {campaign.status === 'draft' && (
                <form action={updateStatus}>
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <input type="hidden" name="status" value="active" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                  >
                    Activate
                  </button>
                </form>
              )}
              {campaign.status === 'active' && (
                <form action={updateStatus}>
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <input type="hidden" name="status" value="paused" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium"
                  >
                    Pause
                  </button>
                </form>
              )}
              {campaign.status === 'paused' && (
                <form action={updateStatus}>
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <input type="hidden" name="status" value="active" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                  >
                    Resume
                  </button>
                </form>
              )}
              <form action={deleteCampaign}>
                <input type="hidden" name="campaign_id" value={campaign.id} />
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
                  onClick={(e) => {
                    if (!confirm('Are you sure you want to delete this campaign?')) {
                      e.preventDefault();
                    }
                  }}
                >
                  Delete
                </button>
              </form>
            </div>
          </div>

          {/* Email Template Preview */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-bold mb-2">Email Template</h3>
            <div className="bg-gray-50 rounded-md p-4 mb-4">
              <p className="text-sm text-gray-600 mb-1">
                <strong>Subject:</strong>
              </p>
              <p className="text-gray-900">{campaign.subject}</p>
            </div>
            <div className="bg-gray-50 rounded-md p-4">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Body:</strong>
              </p>
              <pre className="text-gray-900 whitespace-pre-wrap font-sans">
                {campaign.email_body}
              </pre>
            </div>
          </div>
        </div>

        {/* Campaign Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Total Leads</p>
            <p className="text-3xl font-bold text-gray-900">
              {campaignLeads?.length || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Sent</p>
            <p className="text-3xl font-bold text-green-600">{statusCounts.sent}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Opened</p>
            <p className="text-3xl font-bold text-blue-600">{statusCounts.opened}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Replied</p>
            <p className="text-3xl font-bold text-purple-600">{statusCounts.replied}</p>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-xl font-bold">Campaign Leads</h3>
          </div>
          {!campaignLeads || campaignLeads.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No leads in this campaign yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent At
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {campaignLeads.map((cl: any) => (
                    <tr key={cl.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {cl.leads?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {cl.leads?.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {cl.leads?.company || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            cl.status === 'sent'
                              ? 'bg-green-100 text-green-800'
                              : cl.status === 'opened'
                              ? 'bg-blue-100 text-blue-800'
                              : cl.status === 'replied'
                              ? 'bg-purple-100 text-purple-800'
                              : cl.status === 'bounced'
                              ? 'bg-red-100 text-red-800'
                              : cl.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {cl.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {cl.sent_at
                          ? new Date(cl.sent_at).toLocaleString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
