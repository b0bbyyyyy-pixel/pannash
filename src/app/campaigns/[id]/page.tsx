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
import AutoSMSProcessor from '@/components/AutoSMSProcessor';
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

  // Fetch campaign leads - first get campaign_leads
  const { data: campaignLeadsRaw, error: leadsError } = await supabase
    .from('campaign_leads')
    .select('*')
    .eq('campaign_id', id)
    .order('position', { ascending: true });

  if (leadsError) {
    console.error('Error fetching campaign leads:', leadsError);
  }

  // Then fetch all leads separately to avoid RLS issues with joins
  let campaignLeads: any[] = [];
  if (campaignLeadsRaw && campaignLeadsRaw.length > 0) {
    const leadIds = campaignLeadsRaw.map(cl => cl.lead_id);
    const { data: leadsData, error: leadsDataError } = await supabase
      .from('leads')
      .select('id, name, email, phone, company')
      .in('id', leadIds);

    if (leadsDataError) {
      console.error('Error fetching leads data:', leadsDataError);
    }

    // Merge the data
    campaignLeads = campaignLeadsRaw.map(cl => ({
      ...cl,
      leads: leadsData?.find(l => l.id === cl.lead_id) || null
    }));
  }

  console.log('Campaign leads fetched:', campaignLeads?.length || 0);

  // Fetch queue items from appropriate table based on campaign type
  const queueTable = campaign.type === 'sms' ? 'sms_queue' : 'email_queue';
  const { data: queueItems } = await supabase
    .from(queueTable)
    .select('*')
    .eq('campaign_id', id)
    .eq('status', 'pending');

  // Sort leads by send priority: pending/queued leads by scheduled_for, then sent leads by sent_at
  if (campaignLeads && queueItems) {
    campaignLeads.sort((a, b) => {
      const aQueue = queueItems.find(q => q.campaign_lead_id === a.id);
      const bQueue = queueItems.find(q => q.campaign_lead_id === b.id);

      // Both have queue items - sort by scheduled_for (soonest first)
      if (aQueue && bQueue) {
        return new Date(aQueue.scheduled_for).getTime() - new Date(bQueue.scheduled_for).getTime();
      }

      // Only a has queue item - a goes first
      if (aQueue) return -1;
      if (bQueue) return 1;

      // Neither has queue - sort sent items by sent_at, others by position
      if (a.sent_at && b.sent_at) {
        return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
      }
      if (a.sent_at) return -1;
      if (b.sent_at) return 1;

      // Fallback to position
      return (a.position || 0) - (b.position || 0);
    });
  }

  // Fetch user settings for loop_after_days
  const { data: settings } = await supabase
    .from('automation_settings')
    .select('loop_after_days')
    .eq('user_id', user.id)
    .single();

  // Calculate stats
  const total = campaignLeads?.length || 0;
  const sent = campaignLeads?.filter(l => ['sent', 'delivered', 'opened', 'replied', 'clicked'].includes(l.status)).length || 0;
  const delivered = campaignLeads?.filter(l => ['delivered', 'opened', 'replied', 'clicked'].includes(l.status)).length || 0;
  const opened = campaignLeads?.filter(l => ['opened', 'replied', 'clicked'].includes(l.status)).length || 0;
  const replied = campaignLeads?.filter(l => l.status === 'replied').length || 0;
  const bounced = campaignLeads?.filter(l => l.status === 'bounced').length || 0;
  const failed = campaignLeads?.filter(l => l.status === 'failed').length || 0;
  const pending = campaignLeads?.filter(l => ['pending', 'queued'].includes(l.status)).length || 0;

  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

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
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      <AutoProcessor />
      <AutoSMSProcessor />
      <TrackLastViewed campaignId={id} />
      
      <main className="max-w-[1600px] mx-auto px-12 pt-28 pb-16">
        {/* Back Link */}
        <Link
          href="/campaigns"
          className="inline-flex items-center text-sm text-[#6b6b6b] hover:text-[#1a1a1a] mb-8 transition-colors"
        >
          ← All Campaigns
        </Link>

        {/* Email Connection Alert */}
        <EmailConnectionAlert />

        {/* Campaign Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2 tracking-tight">
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
                campaignType={campaign.type}
                subject={campaign.subject}
                emailBody={campaign.email_body}
                smsBody={campaign.sms_body}
                aiDirective={campaign.ai_directive}
                aiRepliesEnabled={campaign.ai_replies_enabled}
                updateStatus={updateStatus}
                deleteCampaign={deleteCampaign}
              />
            </div>
          </div>

          {/* Stats Grid */}
          {campaign.type === 'sms' ? (
            // SMS Campaign Stats
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#1a1a1a] mb-0.5">{total}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Total</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#5a7fc7] mb-0.5">{pending}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Pending</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#6b8e6b] mb-0.5">{sent}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Sent</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#8a7fc7] mb-0.5">{delivered}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Delivered</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#7f6ba8] mb-0.5">{replied}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Replied</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#6b8e6b] mb-0.5">{replyRate}%</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Reply Rate</div>
              </div>
            </div>
          ) : (
            // Email Campaign Stats
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#1a1a1a] mb-0.5">{total}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Total</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#5a7fc7] mb-0.5">{pending}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Pending</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#6b8e6b] mb-0.5">{sent}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Sent</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#8a7a6b] mb-0.5">{opened}</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Opened</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#8a7a6b] mb-0.5">{openRate}%</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Open Rate</div>
              </div>
              <div className="bg-white border border-[#e5e5e5] rounded-md p-5">
                <div className="text-2xl font-bold text-[#6b8e6b] mb-0.5">{replyRate}%</div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider">Reply Rate</div>
              </div>
            </div>
          )}
        </div>

        {/* Leads Table */}
        <CampaignLeadsTable 
          campaignId={id}
          campaignStatus={campaign.status}
          leads={campaignLeads || []} 
          queueItems={queueItems || []} 
        />
      </main>
    </div>
  );
}
