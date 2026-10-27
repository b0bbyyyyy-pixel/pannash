import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';
import CampaignTable, { Campaign } from './CampaignTable';
import CampaignLeadsView, { CampaignLead } from './CampaignLeadsView';
import CampaignRenameWrapperComponent from './CampaignRenameWrapper';
import NewCampaignModal from './NewCampaignModal';
import CampaignOverviewInsights from './CampaignOverviewInsights';
import { guessLeadSource, resolveListSource } from '@/lib/smsDrip/leadSources';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const params = await searchParams;
  const selectedListId = params.list;

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

  // ── Fetch campaigns with outreach stats ──────────────────────────────────
  const { data: leadLists } = await supabase
    .from('lead_lists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const inboundRes = await supabase
    .from('inbox_conversations')
    .select('lead_id, last_inbound_at, last_direction')
    .eq('user_id', user.id)
    .or('last_inbound_at.not.is.null,last_direction.eq.inbound')
    .limit(10000);

  let inboundRows = inboundRes.data as { lead_id: string; last_inbound_at?: string | null; last_direction?: string | null }[] | null;
  if (inboundRes.error) {
    const retry = await supabase
      .from('inbox_conversations')
      .select('lead_id, last_direction')
      .eq('user_id', user.id)
      .eq('last_direction', 'inbound')
      .limit(10000);
    inboundRows = retry.data as typeof inboundRows;
  }

  const repliedIds = new Set(
    (inboundRows ?? [])
      .filter(c => c.last_inbound_at || c.last_direction === 'inbound')
      .map(c => c.lead_id),
  );

  const campaignStats = await Promise.all(
    (leadLists || []).map(async (list) => {
      const { data: stats } = await supabase
        .from('leads')
        .select('id, sms_sent_at, call_made_at')
        .eq('list_id', list.id);
      const total = stats?.length || 0;
      const smsCount = stats?.filter((l) => l.sms_sent_at).length || 0;
      const callCount = stats?.filter((l) => l.call_made_at).length || 0;
      const touchedCount = stats?.filter((l) => l.sms_sent_at || l.call_made_at).length || 0;
      const replyCount = stats?.filter((l) => l.sms_sent_at && repliedIds.has(l.id)).length || 0;
      return { listId: list.id, total, smsCount, callCount, touchedCount, replyCount };
    })
  );

  const campaigns: Campaign[] = (leadLists || []).map((list) => {
    const stats = campaignStats.find((s) => s.listId === list.id) || {
      total: 0,
      smsCount: 0,
      callCount: 0,
      touchedCount: 0,
      replyCount: 0,
    };
    const source = resolveListSource(list);
    return {
      id: list.id,
      name: list.name,
      created_at: list.created_at,
      sourceKey: source.key,
      sourceLabel: source.label,
      total: stats.total,
      smsCount: stats.smsCount,
      callCount: stats.callCount,
      touchedCount: stats.touchedCount,
      replyCount: stats.replyCount,
    };
  });

  // ── Fetch leads for selected campaign ────────────────────────────────────
  let campaignLeads: CampaignLead[] = [];
  const selectedList = leadLists?.find((l) => l.id === selectedListId);

  if (selectedListId) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, phone, company, notes, sms_sent_at, call_made_at, last_contact, created_at, underwriting_data')
      .eq('list_id', selectedListId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    campaignLeads = (leads || []) as CampaignLead[];
  }

  // ── Server action: create campaign ────────────────────────────────────────
  async function createCampaign() {
    'use server';
    const today = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('lead_lists').insert({
      name: today,
      user_id: user.id,
    });

    revalidatePath('/leads');
  }

  // ── Server action: create named campaign ──────────────────────────────────
  async function createCampaignNamed(name: string, sourceCategory?: string): Promise<string | null> {
    'use server';
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const source = String(sourceCategory || '').trim() || guessLeadSource(name)?.key || null;
    let { data, error } = await supabase
      .from('lead_lists')
      .insert({ name, user_id: user.id, ...(source ? { source_category: source } : {}) })
      .select('id')
      .single();
    if (error && /source_category/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('lead_lists')
        .insert({ name, user_id: user.id })
        .select('id')
        .single());
    }
    if (error || !data) return null;
    revalidatePath('/leads');
    return data.id;
  }

  // ── Server action: delete lead ─────────────────────────────────────────
  async function deleteLead(formData: FormData) {
    'use server';
    const leadId = formData.get('leadId') as string;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    await supabase.from('leads').delete().eq('id', leadId);
    revalidatePath('/leads');
  }

  // ── Server action: delete list ─────────────────────────────────────────
  async function deleteList(formData: FormData) {
    'use server';
    const listId = formData.get('listId') as string;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    await supabase.from('lead_lists').delete().eq('id', listId);
    revalidatePath('/leads');
    redirect('/leads');
  }

  // ── Server action: delete list with leads ─────────────────────────────
  async function deleteListWithLeads(formData: FormData) {
    'use server';
    const listId = formData.get('listId') as string;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('leads').delete().eq('list_id', listId).eq('user_id', user.id);
    await supabase.from('lead_lists').delete().eq('id', listId);
    revalidatePath('/leads');
  }

  // ── Server action: rename campaign ────────────────────────────────────
  async function renameCampaign(formData: FormData) {
    'use server';
    const listId = formData.get('listId') as string;
    const newName = formData.get('newName') as string;
    if (!listId || !newName?.trim()) return;

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('lead_lists')
      .update({ name: newName.trim() })
      .eq('id', listId)
      .eq('user_id', user.id);

    revalidatePath('/leads');
  }

  // Suppress unused-warning for server actions we keep for completeness
  void deleteLead;
  void deleteList;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />

      <main className="max-w-[1600px] mx-auto px-12 pt-28 pb-16">
        {/* Page header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Campaigns
            </h1>
          </div>

          {!selectedListId && (
            <div className="flex items-center gap-4">
              <CampaignOverviewInsights />
              <NewCampaignModal createCampaign={createCampaignNamed} />
            </div>
          )}
        </div>

        {/* Main content */}
        {selectedListId ? (
          <CampaignLeadsView
            leads={campaignLeads}
            campaignName={selectedList?.name || 'Campaign'}
            listId={selectedListId}
            sourceKey={resolveListSource(selectedList || {}).key}
            sourceLabel={resolveListSource(selectedList || {}).label}
            deleteCampaign={deleteListWithLeads}
          />
        ) : (
          <CampaignRenameWrapperComponent
            campaigns={campaigns}
            renameCampaign={renameCampaign}
          />
        )}
      </main>
    </div>
  );
}

