import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import DeleteCampaignButton from './DeleteCampaignButton';
import ActivateButton from './ActivateButton';
import RequeueButton from './RequeueButton';
import ProcessQueueButton from './ProcessQueueButton';
import AutoProcessor from './AutoProcessor';
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

  // Fetch email queue
  const { data: queueItems, error: queueError } = await supabase
    .from('email_queue')
    .select('*, leads(name, email)')
    .eq('campaign_id', id)
    .order('scheduled_for', { ascending: true });

  if (queueError) {
    console.error('Error fetching queue:', queueError);
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
          set() {
            // No-op: cookies can only be read in Server Actions
          },
          remove() {
            // No-op: cookies can only be read in Server Actions
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
          set() {
            // No-op: cookies can only be read in Server Actions
          },
          remove() {
            // No-op: cookies can only be read in Server Actions
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

  // Check if campaign is active but has no queue items (needs re-queuing)
  const needsRequeue = campaign.status === 'active' && 
    (!queueItems || queueItems.length === 0) && 
    statusCounts.pending > 0;

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
              <Link
                href="/hot-leads"
                className="text-orange-600 hover:text-orange-700 font-medium"
              >
                🔥 Hot Leads
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
                <ActivateButton campaignId={campaign.id} />
              )}
              {campaign.status === 'active' && (
                <>
                  {needsRequeue && (
                    <RequeueButton campaignId={campaign.id} />
                  )}
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
                </>
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
              <DeleteCampaignButton
                campaignId={campaign.id}
                onDelete={deleteCampaign}
              />
            </div>
          </div>

          {/* Warning if campaign is active but no queue */}
          {needsRequeue && (
            <div className="border-t border-gray-200 pt-6 pb-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Campaign is active but emails aren't queued
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        Click <strong>"Re-queue Emails"</strong> above to schedule all {statusCounts.pending} pending leads for sending.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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

        {/* Process Queue Button - Only show if campaign is active and has queue */}
        {campaign.status === 'active' && queueItems && queueItems.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-2">Manual Send (Optional)</h3>
                <p className="text-sm text-gray-600">
                  Emails send automatically every minute. Click to send immediately instead of waiting.
                </p>
              </div>
              <ProcessQueueButton />
            </div>
          </div>
        )}

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

        {/* Email Queue (if campaign is active) */}
        {campaign.status === 'active' && queueItems && queueItems.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold">Email Queue Schedule</h3>
              <p className="text-sm text-gray-600 mt-1">
                Next {queueItems.filter(q => q.status === 'pending').length} emails to send
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scheduled For
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {queueItems.slice(0, 10).map((item: any) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.leads?.name || 'Unknown'}
                        <div className="text-xs text-gray-500">{item.leads?.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(item.scheduled_for).toLocaleString()}
                        <div className="text-xs text-gray-500">
                          {new Date(item.scheduled_for) > new Date() 
                            ? `In ${Math.round((new Date(item.scheduled_for).getTime() - new Date().getTime()) / 1000 / 60)} minutes`
                            : 'Ready to send'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            item.status === 'sent'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'sending'
                              ? 'bg-blue-100 text-blue-800'
                              : item.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {queueItems.length > 10 && (
              <div className="px-6 py-3 bg-gray-50 text-sm text-gray-600 text-center">
                Showing 10 of {queueItems.length} queued emails
              </div>
            )}
          </div>
        )}

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
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        <div>{cl.leads?.name || 'N/A'}</div>
                        <EngagementStats campaignLeadId={cl.id} />
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

      {/* Auto-processor: automatically sends emails on schedule */}
      <AutoProcessor enabled={campaign.status === 'active' && queueItems && queueItems.length > 0} />
    </main>
  );
}
