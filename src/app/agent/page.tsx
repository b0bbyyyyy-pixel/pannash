import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AgentClient from './AgentClient';

export const metadata = { title: 'Agent · Gostwrk' };
export const dynamic = 'force-dynamic';

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ modal?: string }>;
}) {
  const sp = await searchParams;
  const isModal = sp.modal === '1';

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
  if (!user) redirect('/auth');

  if (isModal) {
    // Stripped-down render for iframe overlay — no nav, no top padding
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <AgentClient />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      <div className="pt-20">
        <AgentClient />
      </div>
    </div>
  );
}
