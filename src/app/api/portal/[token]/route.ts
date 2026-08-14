import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public endpoint — no auth required, token-gated
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data, error } = await supabase
    .from('client_offer_portals')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Offer not found or expired' }, { status: 404 });
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This offer link has expired' }, { status: 410 });
  }

  return NextResponse.json(data);
}
