import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default async function BillingPage() {
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

  return (
    <div className="min-h-screen bg-[#fdfdfd]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="max-w-[900px] mx-auto px-8 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Billing
          </h1>
          <p className="text-gray-600">
            Manage your subscription and payment methods
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">💳</div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Coming Soon
          </h2>
          <p className="text-gray-600 mb-6">
            Billing and subscription management will be available soon
          </p>
          <div className="inline-flex px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">
            Currently in Free Beta
          </div>
        </div>
      </main>
    </div>
  );
}
