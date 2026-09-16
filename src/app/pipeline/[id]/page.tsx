import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import LeadWorkspaceClient from './LeadWorkspaceClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelineLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modal?: string; edit?: string; from?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isModal = sp.modal === '1';
  const fromLeads = sp.from === 'leads';

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

  // Fetch the specific lead
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !lead) {
    notFound();
  }

  // Fetch all pipeline lead IDs for prev/next navigation (in created_at order)
  const { data: pipelineLeads } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', user.id)
    .or('in_pipeline.eq.true,month_key.not.is.null')
    .order('created_at', { ascending: false });

  const pipelineIds = (pipelineLeads || []).map((l: { id: string }) => l.id);

  const userName = user.email?.split('@')[0] || 'User';

  if (isModal) {
    // Stripped-down render for iframe overlay — no nav, no extra padding
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <LeadWorkspaceClient
            lead={lead}
            allLeadIds={pipelineIds}
            userId={user.id}
            userName={userName}
            fromLeads={fromLeads}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={userName} />
      <main className="pt-20 min-h-screen bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <LeadWorkspaceClient
            lead={lead}
            allLeadIds={pipelineIds}
            userId={user.id}
            userName={userName}
          />
        </div>
      </main>
    </div>
  );
}
