import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import PortalClient from './PortalClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const metadata: Metadata = { title: 'Your Funding Offer' };

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data, error } = await supabase
    .from('client_offer_portals')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Offer Not Found</h1>
          <p className="text-gray-500">This link may have expired or been deactivated.</p>
        </div>
      </div>
    );
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Offer Expired</h1>
          <p className="text-gray-500">Please contact us for an updated offer.</p>
        </div>
      </div>
    );
  }

  return <PortalClient portal={data} token={token} />;
}
