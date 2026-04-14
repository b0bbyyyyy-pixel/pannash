import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AutomationForm from './AutomationForm';

export default async function AutomationSettingsPage() {
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

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-12 pt-28 pb-16">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Automation
          </h1>
          <p className="text-gray-600">
            Control automated sending, pacing, and AI behavior for email & SMS campaigns
          </p>
        </div>

        <AutomationForm />
      </main>
    </div>
  );
}
