import { NextRequest, NextResponse } from 'next/server';
import { offerPortalAdmin } from '@/lib/portal/offerAdmin';

// Public endpoint — no auth required, token-gated via service-role lookup
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = offerPortalAdmin();

  const { data, error } = await supabase
    .from('client_offer_portals')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Offer not found or expired' }, { status: 404 });
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This offer link has expired' }, { status: 410 });
  }

  return NextResponse.json(data);
}
