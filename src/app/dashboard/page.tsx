import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth');
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">Pannash</h1>
            </div>
            <div>
              <form action={async () => {
                'use server';
                // Create fresh Supabase client for Server Action
                const cookieStore = await cookies();
                const supabaseAction = createServerClient(
                  process.env.NEXT_PUBLIC_SUPABASE_URL!,
                  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                  {
                    cookies: {
                      get(name: string) {
                        return cookieStore.get(name)?.value;
                      },
                      set(name: string, value: string, options: any) {
                        cookieStore.set({ name, value, ...options });
                      },
                      remove(name: string, options: any) {
                        cookieStore.set({ name, value: '', ...options });
                      },
                    },
                  }
                );
                const { error } = await supabaseAction.auth.signOut();
                if (!error) redirect('/auth');
              }}>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome back, {user.email?.split('@')[0]}!
          </h2>
          <p className="text-gray-600 mb-6">
            Logged in as: {user.email}
          </p>
          <div className="border-t pt-6">
            <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <Link 
                href="/leads"
                className="p-6 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">
                      📊 Upload Leads
                    </h4>
                    <p className="text-gray-600 text-sm">
                      Import your leads from CSV (Name, Company, Email, Phone, Notes)
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
              
              <div className="p-6 border-2 border-gray-200 rounded-lg opacity-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">
                      📧 Connect Email
                    </h4>
                    <p className="text-gray-600 text-sm">
                      Coming soon: Connect Gmail/Outlook for outreach
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-2 border-gray-200 rounded-lg opacity-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">
                      📱 Connect Phone
                    </h4>
                    <p className="text-gray-600 text-sm">
                      Coming soon: Add Twilio for SMS follow-ups
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-2 border-gray-200 rounded-lg opacity-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">
                      🤖 AI Templates
                    </h4>
                    <p className="text-gray-600 text-sm">
                      Coming soon: Generate personalized outreach templates
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}