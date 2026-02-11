import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';
import GmailConnectButton from './GmailConnectButton';
import SMTPForm from './SMTPForm';
import DisconnectButton from './DisconnectButton';

export default async function ConnectionsPage() {
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

  // Fetch user's email connections
  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const gmailConnection = connections?.find(c => c.provider === 'gmail');
  const outlookConnection = connections?.find(c => c.provider === 'outlook');

  // Server action to disconnect Gmail
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

    await supabase
      .from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'gmail');

    revalidatePath('/settings/connections');
  }

  // Server action to disconnect Outlook
  async function disconnectOutlook() {
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

    await supabase
      .from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'outlook');

    revalidatePath('/settings/connections');
  }

  // Server action to save SMTP
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

    await supabase.from('email_connections').upsert({
      user_id: user.id,
      provider: 'outlook',
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_username: smtpUsername,
      smtp_password: smtpPassword,
      from_email: smtpUsername,
      from_name: fromName,
    });

    revalidatePath('/settings/connections');
  }

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-8 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Email & Phone Connectors
          </h1>
          <p className="text-gray-600">
            Manage your connected email accounts
          </p>
        </div>

        <div className="space-y-6">
          {/* Current Connections Status */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Connection Status
            </h2>
            
            {!gmailConnection && !outlookConnection ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">
                  No email accounts connected yet
                </p>
                <p className="text-sm text-gray-400">
                  Connect an account below to start sending emails
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Gmail Connection */}
                {gmailConnection && (
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                        G
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Gmail</div>
                        <div className="text-sm text-gray-600">
                          {gmailConnection.from_email || 'Connected'}
                        </div>
                      </div>
                    </div>
                    <DisconnectButton 
                      provider="Gmail"
                      disconnectAction={disconnectGmail}
                    />
                  </div>
                )}

                {/* Outlook Connection */}
                {outlookConnection && (
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-semibold">
                        O
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Outlook</div>
                        <div className="text-sm text-gray-600">
                          {outlookConnection.from_email || 'Connected'}
                        </div>
                      </div>
                    </div>
                    <DisconnectButton 
                      provider="Outlook"
                      disconnectAction={disconnectOutlook}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Connect Gmail */}
          {!gmailConnection && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Connect Gmail
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Use OAuth to securely connect your Gmail account
              </p>
              <GmailConnectButton />
            </div>
          )}

          {/* Connect Outlook */}
          {!outlookConnection && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Connect Outlook via SMTP
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Enter your Outlook/Office 365 SMTP credentials
              </p>
              <SMTPForm saveSMTP={saveSMTP} />
            </div>
          )}

          {/* Phone Connector (Coming Soon) */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Phone Connector
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Connect Twilio or other SMS providers (coming soon)
            </p>
            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
              SMS integration will be available in a future update
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
