import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import Navbar from '@/components/Navbar';
import TwilioConnectionForm from './TwilioConnectionForm';

export default async function PhoneSettingsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth');
  }

  // Check existing connections
  const { data: phoneConnections } = await supabase
    .from('phone_connections')
    .select('*')
    .eq('user_id', user.id);

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-black mb-2">Phone / SMS Settings</h1>
          <p className="text-sm text-gray-600">
            Connect Twilio to send SMS campaigns
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-8">
          {phoneConnections && phoneConnections.length > 0 ? (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-black mb-4">Connected Numbers</h2>
                {phoneConnections.map((conn) => (
                  <div key={conn.id} className="p-4 border border-gray-200 rounded-lg mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{conn.phone_number}</div>
                        <div className="text-sm text-gray-500">Provider: {conn.provider}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          Connected
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Add Another Number</h3>
                <TwilioConnectionForm />
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-black mb-2">Connect Twilio</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Connect your Twilio account to send SMS campaigns. You'll need:
                </p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside mb-4">
                  <li>Twilio Account SID</li>
                  <li>Twilio Auth Token</li>
                  <li>A Twilio phone number</li>
                </ul>
                <a
                  href="https://console.twilio.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Get these from your Twilio console →
                </a>
              </div>
              
              <TwilioConnectionForm />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
