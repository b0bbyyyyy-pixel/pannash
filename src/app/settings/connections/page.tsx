import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Navbar from '@/components/Navbar';
import GmailConnectButton from './GmailConnectButton';
import SMTPForm from './SMTPForm';
import DisconnectButton from './DisconnectButton';
import TwilioForm from './TwilioForm';

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

  // Fetch user's phone connections
  const { data: phoneConnections } = await supabase
    .from('phone_connections')
    .select('*')
    .eq('user_id', user.id);

  const twilioConnection = phoneConnections?.[0];

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

  // Server action to disconnect Twilio
  async function disconnectTwilio() {
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
      .from('phone_connections')
      .delete()
      .eq('user_id', user.id);

    revalidatePath('/settings/connections');
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-12 pt-28 pb-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-[#1a1a1a] mb-1 tracking-tight">
            Email & Phone Connectors
          </h1>
          <p className="text-[#6b6b6b] text-sm">
            Manage your connected email accounts and SMS providers
          </p>
        </div>

        <div className="space-y-4">
          {/* Current Connections Status */}
          <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-5 tracking-tight">
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
            <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
              <h2 className="text-lg font-bold text-[#1a1a1a] mb-2 tracking-tight">
                Connect Gmail
              </h2>
              <p className="text-sm text-[#6b6b6b] mb-5">
                Use OAuth to securely connect your Gmail account
              </p>
              <GmailConnectButton />
            </div>
          )}

          {/* Connect Outlook */}
          {!outlookConnection && (
            <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
              <h2 className="text-lg font-bold text-[#1a1a1a] mb-2 tracking-tight">
                Connect Outlook via SMTP
              </h2>
              <p className="text-sm text-[#6b6b6b] mb-5">
                Enter your Outlook/Office 365 SMTP credentials
              </p>
              <SMTPForm saveSMTP={saveSMTP} />
            </div>
          )}

          {/* Twilio SMS Connection */}
          <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-2 tracking-tight">
              SMS / Text Messaging
            </h2>
            <p className="text-sm text-[#6b6b6b] mb-5">
              Connect Twilio to send SMS campaigns with AI-powered replies
            </p>

            {twilioConnection ? (
              <div className="flex items-center justify-between p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center text-white font-semibold">
                    T
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Twilio</div>
                    <div className="text-sm text-gray-600">
                      {twilioConnection.phone_number}
                    </div>
                  </div>
                </div>
                <DisconnectButton 
                  provider="Twilio"
                  disconnectAction={disconnectTwilio}
                />
              </div>
            ) : (
              <div>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 mb-2">
                    <strong>Don't have a Twilio account yet?</strong>
                  </p>
                  <a
                    href="https://www.twilio.com/try-twilio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Sign Up for Twilio →
                  </a>
                  <p className="text-xs text-blue-700 mt-2">
                    Get $15 credit • No credit card required to start
                  </p>
                </div>
                <TwilioForm />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
