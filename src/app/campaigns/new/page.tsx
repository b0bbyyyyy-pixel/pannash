import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';

export default async function NewCampaignPage() {
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

  // Check if user has email connection
  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const hasEmailConnection = connections && connections.length > 0;

  // Fetch user's lead lists
  const { data: leadLists } = await supabase
    .from('lead_lists')
    .select('*, leads(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Get count of leads per list
  const listsWithCounts = await Promise.all(
    (leadLists || []).map(async (list) => {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);
      return { ...list, leadCount: count || 0 };
    })
  );

  // Server Action: Create campaign
  async function createCampaign(formData: FormData) {
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      redirect('/auth');
    }

    const name = formData.get('name') as string;
    const subject = formData.get('subject') as string;
    const emailBody = formData.get('email_body') as string;
    const leadListId = formData.get('lead_list_id') as string;

    if (!name || !subject || !emailBody || !leadListId) {
      return;
    }

    // Fetch all leads from the selected list
    const { data: leadsFromList } = await supabase
      .from('leads')
      .select('id')
      .eq('list_id', leadListId);

    const selectedLeads = (leadsFromList || []).map(lead => lead.id);

    // Don't create campaign if no leads in the list
    if (selectedLeads.length === 0) {
      console.error('No leads found in selected list');
      return;
    }

    // Check if this is the user's first campaign
    const { count: existingCount } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const isFirstCampaign = !existingCount || existingCount === 0;

    // Create campaign (always start as 'paused' - user must manually start)
    // Set as main if it's the first campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        name,
        subject,
        email_body: emailBody,
        status: 'paused', // Always start paused
        is_main: isFirstCampaign, // Auto-set first campaign as main
      })
      .select()
      .single();

    if (campaignError || !campaign) {
      console.error('Error creating campaign:', campaignError);
      return;
    }

    // Add leads to campaign
    if (selectedLeads.length > 0) {
      const campaignLeadsData = selectedLeads.map((leadId) => ({
        campaign_id: campaign.id,
        lead_id: leadId,
        status: 'pending',
      }));

      const { error: leadsError } = await supabase
        .from('campaign_leads')
        .insert(campaignLeadsData);

      if (leadsError) {
        console.error('Error adding leads to campaign:', leadsError);
      }
    }

    revalidatePath('/campaigns');
    redirect(`/campaigns/${campaign.id}`);
  }

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="mb-8">
          <Link
            href="/campaigns"
            className="text-gray-900 hover:text-gray-600 font-medium inline-flex items-center"
          >
            ← Back to Campaigns
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mt-4">Create Campaign</h1>
          <p className="text-gray-600 mt-2">
            Create a new outreach campaign
          </p>
        </div>

        {/* Email Connection Warning */}
        {!hasEmailConnection && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-yellow-900 mb-1">
                  ⚠️ No Email Connected
                </div>
                <div className="text-sm text-yellow-700">
                  You need to connect an email account before you can send campaigns
                </div>
              </div>
              <Link
                href="/settings/connections"
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors"
              >
                Connect Email
              </Link>
            </div>
          </div>
        )}

        <form action={createCampaign} className="space-y-8">
          {/* Campaign Name */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">Campaign Details</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="e.g., Q1 Outbound Sales, Product Launch"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Email Template */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">Email Template</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  required
                  placeholder="e.g., Quick question about [Company]"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use [Name], [Company], [Email] as placeholders
                </p>
              </div>
              <div>
                <label htmlFor="email_body" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Body
                </label>
                <textarea
                  id="email_body"
                  name="email_body"
                  required
                  rows={12}
                  placeholder="Hi [Name],&#10;&#10;I noticed [Company] is doing great work in...&#10;&#10;[Your personalized message]&#10;&#10;Best,&#10;Your Name"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use [Name], [Company], [Email], [Phone], [Notes] as placeholders
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  💡 <strong>Tip:</strong> Use placeholders like [Name], [Company], [Email] to personalize emails automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Select Lead List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">Select Lead List</h3>
            {!listsWithCounts || listsWithCounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  You haven't created any lead lists yet.
                </p>
                <Link
                  href="/leads"
                  className="text-gray-900 hover:text-gray-600 font-medium"
                >
                  Create Lead List →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="lead_list_id" className="block text-sm font-medium text-gray-700 mb-2">
                    Choose which list to target with this campaign
                  </label>
                  <select
                    id="lead_list_id"
                    name="lead_list_id"
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="">Select a lead list...</option>
                    {listsWithCounts.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.leadCount} lead{list.leadCount !== 1 ? 's' : ''})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    All leads from the selected list will be added to this campaign
                  </p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700">
                    💡 <strong>Tip:</strong> Manage your leads and lists on the <Link href="/leads" className="underline font-semibold hover:text-gray-900">Leads page</Link>. Create new lists, upload more leads, or organize existing ones.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-lg shadow p-6">
            <button
              type="submit"
              className="w-full px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Create Campaign
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Campaign will be created in paused state. Go to your Dashboard to start sending.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
