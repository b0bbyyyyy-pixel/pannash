import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import TimezoneClient from './TimezoneClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TimezonePage() {
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

  // Get browser timezone (server-side fallback)
  const browserTimezone = 'America/New_York'; // Default, will be overridden on client

  // Fetch user's saved timezone
  const { data: settings } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-8 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Timezone Settings
          </h1>
          <p className="text-gray-600">
            Set your timezone for accurate email scheduling and timers
          </p>
        </div>

        <TimezoneClient 
          browserTimezone={browserTimezone} 
          savedTimezone={settings?.timezone || null}
        />
      </main>
    </div>
  );
}
