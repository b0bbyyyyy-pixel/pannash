import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import LeadSelector from './LeadSelector';

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
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Fetch user's leads to select from
  const { data: leads } = await supabase
    .from('leads')
    .select('*, lead_lists(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

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
    const selectedLeads = formData.getAll('leads[]') as string[];
    const status = formData.get('status') as string; // 'draft' or 'active'

    if (!name || !subject || !emailBody) {
      return;
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        name,
        subject,
        email_body: emailBody,
        status: status || 'draft',
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

      // If status is 'active', automatically populate the queue
      if (status === 'active') {
        // Import queue utilities dynamically
        const { generateScheduledTimes } = await import('@/lib/queue');
        
        // Generate scheduled times for all leads
        const scheduledTimes = generateScheduledTimes(selectedLeads.length);

        // Create queue items
        const queueItems = selectedLeads.map((leadId, index) => ({
          campaign_id: campaign.id,
          lead_id: leadId,
          scheduled_for: scheduledTimes[index],
          status: 'pending' as const,
          attempts: 0,
        }));

        const { error: queueError } = await supabase
          .from('email_queue')
          .insert(queueItems);

        if (queueError) {
          console.error('Error populating queue:', queueError);
        }

        // Update campaign_leads status to 'queued'
        await supabase
          .from('campaign_leads')
          .update({ status: 'queued' })
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending');
      }
    }

    revalidatePath('/campaigns');
    redirect(`/campaigns/${campaign.id}`);
  }

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
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Campaigns
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link
            href="/campaigns"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Campaigns
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mt-4">Create Campaign</h1>
          <p className="text-gray-600 mt-2">
            Create a new outreach campaign with AI-refined messaging
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use [Name], [Company], [Email], [Phone], [Notes] as placeholders
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>AI Refinement coming soon!</strong> For now, write your best template. We'll add AI-powered refinement and tone adjustment in the next update.
                </p>
              </div>
            </div>
          </div>

          {/* Select Leads */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">Select Leads</h3>
            {!leads || leads.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  You haven't uploaded any leads yet.
                </p>
                <Link
                  href="/leads"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Upload Leads →
                </Link>
              </div>
            ) : (
              <LeadSelector leads={leads} leadLists={leadLists || []} />
            )}
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex gap-4">
              <button
                type="submit"
                name="status"
                value="draft"
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Save as Draft
              </button>
              <button
                type="submit"
                name="status"
                value="active"
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Create & Activate Campaign
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Activating will queue emails to send at a human-like pace
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
