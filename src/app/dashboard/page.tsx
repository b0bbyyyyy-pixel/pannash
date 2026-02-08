import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import StartOutreachButton from './StartOutreachButton';

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
        set() {
          // No-op: cookies can only be set in Server Actions
        },
        remove() {
          // No-op: cookies can only be removed in Server Actions
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth');
  }

  // Fetch the user's leads
  const { data: leads, error: leadsError } = await supabase
    .from('Leads')
    .select('id, name, company, email, phone, notes') // ← added 'id' for delete
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (leadsError) {
    console.error('Leads fetch error:', leadsError);
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
              <form
                action={async () => {
                  'use server';
                  const cookieStoreAction = await cookies();
                  const supabaseAction = createServerClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    {
                      cookies: {
                        get(name: string) {
                          return cookieStoreAction.get(name)?.value;
                        },
                        set(name: string, value: string, options: any) {
                          cookieStoreAction.set({ name, value, ...options });
                        },
                        remove(name: string, options: any) {
                          cookieStoreAction.set({ name, value: '', ...options });
                        },
                      },
                    }
                  );
                  const { error } = await supabaseAction.auth.signOut();
                  if (!error) redirect('/auth');
                }}
              >
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
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome back, {user.email?.split('@')[0]}!
          </h2>
          <p className="text-gray-600 mb-6">Logged in as: {user.email}</p>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h3 className="text-2xl font-bold mb-6">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <a
              href="/leads"
              className="block p-6 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    📊 Upload Leads
                  </h4>
                  <p className="text-gray-600 text-sm">
                    Import your leads from CSV
                  </p>
                </div>
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </a>

            {/* Coming soon placeholders */}
            <div className="p-6 border-2 border-gray-200 rounded-lg opacity-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    📧 Connect Email
                  </h4>
                  <p className="text-gray-600 text-sm">Coming soon</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-2 border-gray-200 rounded-lg opacity-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    📱 Connect Phone
                  </h4>
                  <p className="text-gray-600 text-sm">Coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Start Outreach Section */}
        <StartOutreachButton />
        {/* Leads Table */}
        <div className="bg-white rounded-lg shadow p-8">
          <h3 className="text-2xl font-bold mb-6">Your Leads</h3>

          {leadsError && (
            <p className="text-red-600 mb-4">Error loading leads: {leadsError.message}</p>
          )}

          {leads && leads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lead.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lead.company || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lead.email || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lead.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{lead.notes || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <form
                          action={async () => {
                            'use server';
                            const cookieStoreAction = await cookies();
                            const supabaseAction = createServerClient(
                              process.env.NEXT_PUBLIC_SUPABASE_URL!,
                              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                              {
                                cookies: {
                                  get(name: string) {
                                    return cookieStoreAction.get(name)?.value;
                                  },
                                  set(name: string, value: string, options: any) {
                                    cookieStoreAction.set({ name, value, ...options });
                                  },
                                  remove(name: string, options: any) {
                                    cookieStoreAction.set({ name, value: '', ...options });
                                  },
                                },
                              }
                            );

                            await supabaseAction.from('Leads').delete().eq('id', lead.id);
                            // Revalidate or redirect to refresh page
                            redirect('/dashboard');
                          }}
                        >
                          <button
                            type="submit"
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600">
              No leads uploaded yet. Click "Upload Leads" above to get started!
            </p>
          )}
        </div>
      </div>
    </main>
  );
}