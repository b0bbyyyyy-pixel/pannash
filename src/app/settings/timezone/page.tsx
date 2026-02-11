import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';

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

  // Get browser timezone
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-8 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Timezone
          </h1>
          <p className="text-gray-600">
            Set your timezone for accurate email scheduling
          </p>
        </div>

        <div className="space-y-6">
          {/* Current Timezone */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Detected Timezone
            </h2>
            
            <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="font-medium text-gray-900 mb-1">
                {browserTimezone}
              </div>
              <div className="text-sm text-gray-600">
                Current time: {new Date().toLocaleString()}
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-600">
              All email schedules use this timezone for business hours (9 AM - 6 PM)
            </p>
          </div>

          {/* Timezone Settings (Coming Soon) */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Custom Timezone Settings
            </h2>
            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
              Custom timezone selection will be available in a future update
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
