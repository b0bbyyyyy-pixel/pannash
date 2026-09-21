import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PipelineClient from './PipelineClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinePage() {
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

  // Pipeline = explicitly sent (in_pipeline) OR legacy CRM leads (month_key, no campaign list).
  // Campaign leads stay out unless they were sent here (in_pipeline = true).
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', user.id)
    .or('in_pipeline.eq.true,and(month_key.not.is.null,list_id.is.null)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pipeline leads:', error);
  }

  const userName = user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={userName} />
      <main className="pt-20 min-h-screen bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-6 py-8">
          <PipelineClient leads={leads || []} userId={user.id} />
        </div>
      </main>
    </div>
  );
}
