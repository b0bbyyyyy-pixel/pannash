import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';
import CampaignActions from './CampaignActions';
import CampaignStartPause from './CampaignStartPause';
import CampaignLeadsTable from './CampaignLeadsTable';
import CampaignCountdown from './CampaignCountdown';
import AutoProcessor from '@/app/dashboard/AutoProcessor';
import TrackLastViewed from './TrackLastViewed';
import EmailConnectionAlert from '@/components/EmailConnectionAlert';

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

  // Store this as last viewed campaign (for fallback logic)
  // We'll use localStorage on the client side for this

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
      next_email_at,
      loop_count,
      leads(name, email, phone, company)
    `)
    .eq('campaign_id', id)
    .order('created_at', { ascending: true });

  // Fetch email queue
  const { data: queueItems } = await supabase
    .from('email_queue')
    .select('*')
    .eq('campaign_id', id)
    .eq('status', 'pending');

  // Fetch user settings for loop_after_days
  const { data: settings } = await supabase
    .from('automation_settings')
    .select('loop_after_days')
    .eq('user_id', user.id)
    .single();

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
      <AutoProcessor />
      <TrackLastViewed campaignId={id} />
      
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-12">
        {/* Back Link */}
        <Link
          href="/campaigns"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          ← All Campaigns
        </Link>

        {/* Email Connection Alert */}
        <EmailConnectionAlert />

        {/* Campaign Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                {campaign.name}
              </h1>
              <CampaignCountdown 
                queueItems={queueItems || []}
                campaignLeads={campaignLeads || []}
                loopAfterDays={settings?.loop_after_days || 14}
              />
            </div>
            <div className="flex items-center gap-3">
              <CampaignStartPause 
                campaignId={id}
                status={campaign.status}
              />
              <CampaignActions 
                campaignId={id}
                status={campaign.status}
                subject={campaign.subject}
                emailBody={campaign.email_body}
                updateStatus={updateStatus}
                deleteCampaign={deleteCampaign}
              />
            </div>
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
              <div className="text-2xl font-bold text-[#722F37]">{opened}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Opened</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-[#722F37]">{openRate}%</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Open Rate</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{replyRate}%</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Reply Rate</div>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <CampaignLeadsTable 
          leads={campaignLeads || []} 
          queueItems={queueItems || []} 
        />
      </main>
    </div>
  );
}
