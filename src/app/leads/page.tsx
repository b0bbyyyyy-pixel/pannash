import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';
import UploadForm from './UploadForm';
import CreateListButton from './CreateListButton';
import LeadListSelector from './LeadListSelector';
import LeadsTableWrapper from './LeadsTableWrapper';
import EmailToolsBar from './EmailToolsBar';
import AddLeadButton from './AddLeadButton';
import ExportListButton from './ExportListButton';

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

  // Fetch user's lead lists
  const { data: leadLists } = await supabase
    .from('lead_lists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Fetch user's leads (filtered by list if selected)
  let leadsQuery = supabase
    .from('leads')
    .select('*, lead_lists(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (selectedListId) {
    leadsQuery = leadsQuery.eq('list_id', selectedListId);
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

  // Count leads without a list
  const { count: unlistedCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('list_id', null);

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

  // Server action to delete list
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

  const totalLeads = leads?.length || 0;
  const selectedList = leadLists?.find(l => l.id === selectedListId);

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Leads
            </h1>
            <p className="text-gray-600">
              Upload and organize your contact lists
            </p>
          </div>
          <div className="flex gap-3">
            <AddLeadButton selectedListId={selectedListId} />
            <ExportListButton 
              leads={leads || []} 
              listName={selectedList?.name || 'All_Leads'} 
            />
            <CreateListButton />
          </div>
        </div>

        {/* Email Quality Tools */}
        <EmailToolsBar />

        {/* Lead Lists Tabs */}
        <LeadListSelector 
          lists={leadLists || []}
          selectedListId={selectedListId}
          listCounts={listCounts}
          unlistedCount={unlistedCount || 0}
          deleteList={deleteList}
        />

        {/* Upload Section */}
        {leadLists && leadLists.length > 0 ? (
          selectedListId && selectedListId !== 'unlisted' ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Upload Leads
                {selectedList && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    to {selectedList.name}
                  </span>
                )}
              </h2>
              <UploadForm selectedListId={selectedListId} />
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 mb-8 text-center">
              <div className="max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Select a List to Upload Leads
                </h2>
                <p className="text-gray-600 mb-4">
                  Click on a list tab above to organize your leads properly. Avoid uncategorized leads by selecting a specific list.
                </p>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-3">Need a new category?</p>
                  <CreateListButton />
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 rounded-lg p-12 mb-8 text-center">
            <div className="max-w-md mx-auto">
              <div className="text-5xl mb-4">📋</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Create Your First Lead List
              </h2>
              <p className="text-gray-600 mb-6">
                Before uploading leads, create a list to organize them. Lists help you manage different campaigns, sources, or categories.
              </p>
              <div className="flex flex-col gap-3 items-center">
                <CreateListButton />
                <p className="text-sm text-gray-500">
                  Examples: "Q1 Prospects", "Warm Leads", "Trade Show Contacts"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Leads Table */}
        <LeadsTableWrapper
          leads={leads || []}
          selectedListName={selectedList ? selectedList.name : 'All Leads'}
          selectedListDescription={selectedList?.description}
          totalLeads={totalLeads}
          deleteLead={deleteLead}
          deleteMultipleLeads={deleteMultipleLeads}
        />
      </main>
    </div>
  );
}
