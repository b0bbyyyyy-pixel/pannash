import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get('lead_id');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 40), 100);

  let q = supabase
    .from('casper_runs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (leadId) q = q.eq('lead_id', leadId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ runs: [], error: error.message });
  }
  return NextResponse.json({ runs: data ?? [] });
}
