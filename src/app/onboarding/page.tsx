import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import GmailButton from './GmailButton';
import SMTPForm from './SMTPForm';

export default async function OnboardingPage() {
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

  // Check if user already has connection
  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  if (connections && connections.length > 0) {
    redirect('/dashboard');
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

    revalidatePath('/onboarding');
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#fdfdfd] flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            pannash.io
          </h1>
          <p className="text-gray-600">
            Connect your email to start sending
          </p>
        </div>

        <div className="space-y-6">
          {/* Gmail Option */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Option 1: Connect Gmail
            </h2>
            <GmailButton />
          </div>

          {/* SMTP Option */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Option 2: Connect Outlook via SMTP
            </h2>
            <SMTPForm saveSMTP={saveSMTP} />
          </div>

          {/* Skip Button */}
          <div className="text-center">
            <a
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Skip for now
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
