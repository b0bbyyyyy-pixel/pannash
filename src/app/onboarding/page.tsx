import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import GmailButton from './GmailButton';
import SMTPForm from './SMTPForm';
import TwilioForm from './TwilioForm';
import SkipButton from './SkipButton';

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

  // Check if user already has email or phone connection
  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const { data: phoneConnections } = await supabase
    .from('phone_connections')
    .select('*')
    .eq('user_id', user.id);

  // If user has either connection, send to dashboard
  if ((connections && connections.length > 0) || (phoneConnections && phoneConnections.length > 0)) {
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
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2 tracking-tight">
            Gostwrk
          </h1>
          <p className="text-[#6b6b6b] text-sm">
            Connect email or SMS to start sending campaigns
          </p>
        </div>

        <div className="space-y-4">
          {/* Gmail Option */}
          <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-lg font-bold text-[#1a1a1a] tracking-tight">
                Option 1: Connect Gmail
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-[#d5e5f0] text-[#4a4a4a] rounded">
                Email
              </span>
            </div>
            <GmailButton />
          </div>

          {/* SMTP Option */}
          <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-lg font-bold text-[#1a1a1a] tracking-tight">
                Option 2: Connect Outlook via SMTP
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-[#d5e5f0] text-[#4a4a4a] rounded">
                Email
              </span>
            </div>
            <SMTPForm saveSMTP={saveSMTP} />
          </div>

          {/* Twilio SMS Option */}
          <div className="bg-white border border-[#e5e5e5] rounded-md p-7">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-[#1a1a1a] tracking-tight">
                Option 3: Connect Twilio
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-[#e5d5e8] text-[#4a4a4a] rounded">
                SMS
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Send SMS campaigns with AI-powered auto-replies
            </p>
            
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 mb-2">
                <strong>New to Twilio?</strong>
              </p>
              <a
                href="https://www.twilio.com/try-twilio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
              >
                Sign Up for Twilio →
              </a>
              <p className="text-xs text-blue-700 mt-2">
                Get $15 credit • No credit card required
              </p>
            </div>
            
            <TwilioForm />
          </div>

          {/* Skip Button */}
          <div className="text-center pt-4">
            <SkipButton />
          </div>
        </div>
      </div>
    </div>
  );
}
