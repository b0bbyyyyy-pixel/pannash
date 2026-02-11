import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import SettingsForm from './SettingsForm';

export default async function BrainsPage() {
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
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-8 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Brains
          </h1>
          <p className="text-gray-600">
            Control your automation & AI settings
          </p>
        </div>

        <SettingsForm />
      </main>
    </div>
  );
}
