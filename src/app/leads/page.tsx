import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import CreateListButton from './CreateListButton';
import LeadListSelector from './LeadListSelector';
import LeadsTableWrapper from './LeadsTableWrapper';
import AddLeadButton from './AddLeadButton';
import ExportListButton from './ExportListButton';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; showCrm?: string }>;
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

  // Fetch user's lead lists
  const { data: leadLists } = await supabase
    .from('lead_lists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Fetch user's leads (filtered by list if selected)
  // showCrm param controls whether dashboard CRM leads are visible here
  const showCrm = params.showCrm === '1';

  let leadsQuery = supabase
    .from('leads')
    .select('*, lead_lists(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (selectedListId) {
    if (selectedListId === 'unlisted') {
      // Uncategorized: no list AND no CRM month_key (unless showCrm)
      leadsQuery = leadsQuery.is('list_id', null);
      if (!showCrm) leadsQuery = leadsQuery.is('month_key', null);
    } else {
      // Specific list: leads with list_id are always contact leads, no extra filter needed
      leadsQuery = leadsQuery.eq('list_id', selectedListId);
    }
  } else {
    // "All" view — hide CRM leads unless showCrm is on
    if (!showCrm) leadsQuery = leadsQuery.not('list_id', 'is', null);
  }

  const { data: leads } = await leadsQuery;

  // Get counts per list
  const listCounts = await Promise.all(
    (leadLists || []).map(async (list) => {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);
      return { listId: list.id, count: count || 0 };
    })
  );

  // Per-list calling progress: phone_total and attempted (last_contact set)
  const { data: progressRaw } = await supabase
    .from('leads')
    .select('list_id, phone, last_contact')
    .eq('user_id', user.id)
    .not('list_id', 'is', null);

  const listProgress = (leadLists || []).map(list => {
    const listLeads = (progressRaw || []).filter(l => l.list_id === list.id);
    const withPhone = listLeads.filter(l => {
      const p = (l.phone || '').trim();
      return p && p !== '-' && p !== '--';
    });
    const attempted = withPhone.filter(l => l.last_contact != null);
    return { listId: list.id, total: withPhone.length, attempted: attempted.length };
  });

  // Count uncategorized contact-list leads (no list_id, no month_key unless showCrm)
  let unlistedQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('list_id', null);
  if (!showCrm) unlistedQuery = unlistedQuery.is('month_key', null);
  const { count: unlistedCount } = await unlistedQuery;

  // Server action to delete lead
  async function deleteLead(formData: FormData) {
    'use server';
    const leadId = formData.get('leadId') as string;
    
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
      .from('leads')
      .delete()
      .eq('id', leadId);

    revalidatePath('/leads');
  }

  // Server action to delete multiple leads
  async function deleteMultipleLeads(formData: FormData) {
    'use server';
    const leadIds = formData.getAll('leadIds[]') as string[];
    
    if (leadIds.length === 0) return;

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
      .from('leads')
      .delete()
      .in('id', leadIds);

    revalidatePath('/leads');
  }

  // Server action to delete list (keeps leads, they become uncategorized)
  async function deleteList(formData: FormData) {
    'use server';
    const listId = formData.get('listId') as string;
    
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
      .from('lead_lists')
      .delete()
      .eq('id', listId);

    revalidatePath('/leads');
    redirect('/leads');
  }

  // Server action to delete list AND all its leads
  async function deleteListWithLeads(formData: FormData) {
    'use server';
    const listId = formData.get('listId') as string;
    
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
    if (!user) return;

    // First delete all leads in this list
    await supabase
      .from('leads')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', user.id);

    // Then delete the list
    await supabase
      .from('lead_lists')
      .delete()
      .eq('id', listId);

    revalidatePath('/leads');
    redirect('/leads');
  }

  const totalLeads = leads?.length || 0;
  const selectedList = leadLists?.find(l => l.id === selectedListId);

  // Collect unique folder names for the CreateListButton picker
  const existingFolders = [
    ...new Set(
      (leadLists || [])
        .map((l: { folder_name?: string | null }) => l.folder_name)
        .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
    ),
  ];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[1600px] mx-auto px-12 pt-28 pb-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Leads
            </h1>
            <p className="text-[#6b6b6b] text-sm">
              Upload and organize your contact lists
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/campaigns"
              className="px-4 py-2.5 rounded-md text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Campaigns
            </Link>
            <AddLeadButton selectedListId={selectedListId} />
            <ExportListButton 
              leads={leads || []} 
              listName={selectedList?.name || 'All_Leads'} 
            />
            <CreateListButton existingFolders={existingFolders} />
            {/* Toggle to show/hide dashboard CRM leads in this list */}
            <Link
              href={showCrm ? `/leads${selectedListId ? `?list=${selectedListId}` : ''}` : `/leads?${selectedListId ? `list=${selectedListId}&` : ''}showCrm=1`}
              className={`px-4 py-2.5 rounded-md text-sm font-medium border transition-colors ${
                showCrm
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
              title={showCrm ? 'Currently showing dashboard leads — click to hide' : 'Show dashboard leads here'}
            >
              {showCrm ? 'Hide Dashboard Leads' : 'Show Dashboard Leads'}
            </Link>
          </div>
        </div>

        {/* Lead Lists Tabs */}
        <LeadListSelector 
          lists={leadLists || []}
          selectedListId={selectedListId}
          listCounts={listCounts}
          listProgress={listProgress}
          unlistedCount={unlistedCount || 0}
          deleteList={deleteList}
          deleteListWithLeads={deleteListWithLeads}
        />

        {/* Leads Table */}
        <LeadsTableWrapper
          leads={leads || []}
          selectedListName={selectedList ? selectedList.name : 'All Leads'}
          selectedListDescription={selectedList?.description}
          totalLeads={totalLeads}
          selectedListId={selectedListId}
          deleteLead={deleteLead}
          deleteMultipleLeads={deleteMultipleLeads}
        />
      </main>
    </div>
  );
}
