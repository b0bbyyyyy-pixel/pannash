import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { merchantAdmin } from '@/lib/merchantPortal/admin';
import { loadMerchantPortalView } from '@/lib/merchantPortal/view';
import MerchantPortalClient from '@/app/merchant/MerchantPortalClient';

export const dynamic = 'force-dynamic';

export default async function MerchantPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { leadId } = await searchParams;
  const id = String(leadId || '').trim();
  if (!id) notFound();

  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, email, phone, company, lead_status, created_at, underwriting_data')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) notFound();

  const view = await loadMerchantPortalView(merchantAdmin(), { userId: user.id, lead });
  return <MerchantPortalClient {...view} preview />;
}
