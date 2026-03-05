import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Navbar from '@/components/Navbar';
import CampaignForm from './CampaignForm';

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

  // Check if user has phone connection
  const { data: phoneConnections } = await supabase
    .from('phone_connections')
    .select('*')
    .eq('user_id', user.id);

  const hasPhoneConnection = phoneConnections && phoneConnections.length > 0;

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

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-3xl mx-auto px-12 pt-28 pb-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[#1a1a1a] mb-1 tracking-tight">Create Campaign</h1>
          <p className="text-sm text-[#6b6b6b]">
            Choose email or SMS, then set up your outreach
          </p>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-md p-8">
          <CampaignForm
            hasEmailConnection={hasEmailConnection}
            hasPhoneConnection={hasPhoneConnection}
            leadLists={listsWithCounts || []}
          />
        </div>
      </main>
    </div>
  );
}
