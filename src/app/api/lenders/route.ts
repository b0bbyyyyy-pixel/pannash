import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { LENDERS } from '@/data/lenders';

export const dynamic = 'force-dynamic';

function makeClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    }
  );
}

// GET — fetch all lenders; auto-seed from defaults if none exist
export async function GET() {
  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('lenders')
    .select('*')
    .eq('user_id', user.id)
    .order('tier', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-seed default lenders on first load
  if (!data || data.length === 0) {
    const seedRows = LENDERS.map((l) => ({
      user_id: user.id,
      name: l.name,
      tier: l.tier,
      min_monthly_revenue: l.minMonthlyRevenue,
      min_tib_months: l.minTIBMonths,
      min_fico: l.minFico,
      tib_fico_tiers: l.tibFicoTiers ?? null,
      no_credit_pull: l.noCreditPull ?? false,
      min_position: l.minPosition,
      max_position: l.maxPosition,
      neg_days_max: l.negDaysMax ?? null,
      min_deposits: l.minDeposits ?? null,
      hard_pull_sole_props: l.hardPullSoleProps ?? false,
      restricted_states: l.restrictedStates,
      restricted_industry_keywords: l.restrictedIndustryKeywords,
      notes: l.notes,
      is_active: true,
    }));

    const { data: seeded, error: seedErr } = await supabase
      .from('lenders')
      .insert(seedRows)
      .select();

    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
    return NextResponse.json({ lenders: seeded ?? [] });
  }

  return NextResponse.json({ lenders: data });
}

// POST — create a new lender
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase
    .from('lenders')
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lender: data });
}

// PUT — update an existing lender
export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data, error } = await supabase
    .from('lenders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lender: data });
}

// DELETE — remove a lender
export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase
    .from('lenders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
