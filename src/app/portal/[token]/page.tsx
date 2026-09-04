import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import PortalClient from './PortalClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Dynamic OG metadata per portal
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const { data } = await supabase
    .from('client_offer_portals')
    .select('og_title, og_description, og_image_url, og_site_name, title, lead_name')
    .eq('token', token)
    .single();

  const ogTitle = data?.og_title || data?.title || 'Your Funding Offer';
  const ogDesc = data?.og_description || 'View and customize your approved funding offer.';
  const ogImage = data?.og_image_url || null;
  const ogSiteName = data?.og_site_name || null;

  return {
    title: ogTitle,
    description: ogDesc,
    openGraph: {
      title: ogTitle,
      description: ogDesc,
      ...(ogSiteName ? { siteName: ogSiteName } : {}),
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description: ogDesc,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

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
    .neq('is_active', false)
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
