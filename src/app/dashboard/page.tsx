import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import StartOutreachButton from './StartOutreachButton';
import TestEmailButton from './TestEmailButton';
import SMTPConnectionForm from './SMTPConnectionForm';
import GmailConnectButton from './GmailConnectButton';
import ProcessQueueButton from './ProcessQueueButton';
import AutoProcessor from './AutoProcessor';

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
    .from('leads')
    .select('id, name, company, email, phone, notes')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (leadsError) {
    console.error('Leads fetch error:', leadsError);
  }

  // Fetch email connections (both Gmail OAuth and Outlook SMTP)
  const { data: emailConnections } = await supabase
    .from('email_connections')
    .select('provider, smtp_host, smtp_port, smtp_username, from_email, from_name, email')
    .eq('user_id', user.id);

  const outlookConnection = emailConnections?.find(c => c.provider === 'outlook') || null;
  const gmailConnection = emailConnections?.find(c => c.provider === 'gmail') || null;

  // Server Action: Save SMTP credentials
  async function saveSMTP(formData: FormData) {
    'use server';
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
    if (!user) throw new Error('Unauthorized');

    const smtpHost = formData.get('smtp_host') as string;
    const smtpPort = parseInt(formData.get('smtp_port') as string);
    const smtpUsername = formData.get('smtp_username') as string;
    const smtpPassword = formData.get('smtp_password') as string;
    const fromName = formData.get('from_name') as string;

    const { error } = await supabase.from('email_connections').upsert({
      user_id: user.id,
      provider: 'outlook',
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_username: smtpUsername,
      smtp_password: smtpPassword,
      from_email: smtpUsername,
      from_name: fromName || null,
      updated_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard');
  }

  // Server Action: Disconnect SMTP
  async function disconnectSMTP() {
    'use server';
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
    if (!user) throw new Error('Unauthorized');

    const { error } = await supabase
      .from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'outlook');

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard');
  }

  // Server Action: Disconnect Gmail
  async function disconnectGmail() {
    'use server';
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
    if (!user) throw new Error('Unauthorized');

    const { error } = await supabase
      .from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'gmail');

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard');
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-blue-600">
                Pannash
              </Link>
              <div className="flex gap-4">
                <Link
                  href="/dashboard"
                  className="text-blue-600 font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/leads"
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Leads
                </Link>
                <Link
                  href="/campaigns"
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Campaigns
                </Link>
              </div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
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
            </Link>

            <Link
              href="/campaigns"
              className="block p-6 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    📧 View Campaigns
                  </h4>
                  <p className="text-gray-600 text-sm">
                    Manage your outreach campaigns
                  </p>
                </div>
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/campaigns/new"
              className="block p-6 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    ✨ Create Campaign
                  </h4>
                  <p className="text-gray-600 text-sm">
                    Start a new outreach campaign
                  </p>
                </div>
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>

        {/* Email Connection Section - Gmail OAuth */}
        <GmailConnectButton
          connection={gmailConnection}
          onDisconnect={disconnectGmail}
        />

        {/* Email Connection Section - Outlook SMTP */}
        <SMTPConnectionForm
          connection={outlookConnection}
          onSave={saveSMTP}
          onDisconnect={disconnectSMTP}
        />

        {/* Start Outreach Section */}
        <StartOutreachButton />

        {/* Test Email Button */}
        <TestEmailButton
          connectionInfo={{
            hasGmail: !!gmailConnection,
            hasOutlook: !!outlookConnection,
            gmailEmail: gmailConnection?.email,
            outlookEmail: outlookConnection?.from_email,
          }}
        />

        {/* Process Queue Button (for testing) */}
        <ProcessQueueButton />

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

                            await supabaseAction.from('leads').delete().eq('id', lead.id);
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

      {/* Auto-processor: automatically sends queued emails every minute */}
      <AutoProcessor />
    </main>
  );
}