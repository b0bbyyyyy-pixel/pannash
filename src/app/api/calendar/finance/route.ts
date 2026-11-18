import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { blankFinance, fallbackPlan, normalizeFinance, summarizeFinance } from '@/lib/finance/plan';

export const dynamic = 'force-dynamic';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('personal_finance')
      .select('data, plan')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && /personal_finance/i.test(error.message || '')) {
      return NextResponse.json({
        data: blankFinance(),
        plan: null,
        setupRequired: true,
      });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const finance = normalizeFinance(data?.data);
    return NextResponse.json({
      data: finance,
      plan: data?.plan ?? null,
      totals: summarizeFinance(finance),
    });
  } catch (err) {
    console.error('[calendar/finance GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const finance = normalizeFinance(body.data);
    const plan = body.plan && typeof body.plan === 'object' ? body.plan : undefined;
    const row: Record<string, unknown> = {
      user_id: user.id,
      data: finance,
      updated_at: new Date().toISOString(),
    };
    if (plan) row.plan = plan;

    const { error } = await supabase
      .from('personal_finance')
      .upsert(row, { onConflict: 'user_id' });

    if (error && /personal_finance/i.test(error.message || '')) {
      return NextResponse.json({
        error: 'Run add-personal-finance.sql in Supabase, then save again.',
        setupRequired: true,
      }, { status: 400 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      data: finance,
      totals: summarizeFinance(finance),
      plan: plan ?? fallbackPlan(finance),
    });
  } catch (err) {
    console.error('[calendar/finance PUT]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
