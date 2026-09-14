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

function buildSeedRows(userId: string) {
  return LENDERS.map((l) => ({
    user_id:                       userId,
    name:                          l.name,
    tier:                          l.tier,
    is_active:                     l.isActive ?? true,
    // Contact
    email:                         l.email ?? null,
    cc_email:                      l.ccEmail ?? null,
    rep_name:                      l.repName ?? null,
    contact_phone:                  l.contactPhone ?? null,
    rep_direct_phone:               l.repDirectPhone ?? null,
    submission_method:              l.submissionMethod ?? null,
    products:                      l.products ?? null,
    // Underwriting (legacy NOT NULL cols default to 0 = "no minimum")
    min_monthly_revenue:            l.minMonthlyRevenue ?? 0,
    min_tib_months:                 l.minTibMonths ?? 0,
    min_fico:                       l.minFico ?? 0,
    min_position:                   l.minPosition ?? 1,
    max_position:                   l.maxPosition ?? 6,
    max_nsfs:                      l.maxNsfs ?? null,
    neg_days_max:                   l.maxNegDays ?? null,
    max_withhold:                   l.maxWithhold ?? null,
    min_deposits:                   l.minDeposits ?? null,
    avg_daily_balance:              l.avgDailyBalance ?? null,
    min_amount:                     l.minAmount ?? null,
    max_amount:                     l.maxAmount ?? null,
    min_term_days:                  l.minTermDays ?? null,
    max_term_days:                  l.maxTermDays ?? null,
    // Flags
    accepts_mercury:                l.acceptsMercury ?? null,
    accepts_nonprofit:              l.acceptsNonprofit ?? null,
    accepts_defaults:               l.acceptsDefaults ?? null,
    accepts_sole_prop:              l.acceptsSoleProp ?? null,
    does_buyout:                    l.doesBuyout ?? null,
    does_reverse_consolidation:     l.doesReverseConsolidation ?? null,
    // Restrictions
    state_restrictions:             l.stateRestrictions ?? null,
    prohibited_industries:          l.prohibitedIndustries ?? null,
    preferred_industries:           l.preferredIndustries ?? null,
    industry_position_restrictions: l.industryPositionRestrictions ?? null,
    // Notes
    other_requirements:             l.otherRequirements ?? null,
    notes:                          l.notes ?? null,
  }));
}

// GET — fetch all lenders; auto-seed from defaults if none exist; ?reset=true re-seeds
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reset = new URL(request.url).searchParams.get('reset') === 'true';

  if (reset) {
    // Delete all existing lenders for this user, then re-seed from defaults
    await supabase.from('lenders').delete().eq('user_id', user.id);
    const { data: seeded, error: seedErr } = await supabase
      .from('lenders')
      .insert(buildSeedRows(user.id))
      .select();
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
    return NextResponse.json({ lenders: seeded ?? [] });
  }

  const { data, error } = await supabase
    .from('lenders')
    .select('*')
    .eq('user_id', user.id)
    .order('tier', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-seed default lenders on first load
  if (!data || data.length === 0) {
    const { data: seeded, error: seedErr } = await supabase
      .from('lenders')
      .insert(buildSeedRows(user.id))
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
