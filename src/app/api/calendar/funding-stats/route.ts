import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function parseUd(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function monthOf(iso: unknown) {
  if (typeof iso !== 'string' || iso.length < 7) return '';
  const m = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : '';
}

function isTruthy(v: unknown) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function money(v: unknown) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return 0;
  const n = Number(v.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function localMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchFundedLeads(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
) {
  const pageSize = 1000;
  const rows: { lead_status: string | null; underwriting_data: unknown }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('leads')
      .select('lead_status, underwriting_data')
      .eq('user_id', userId)
      .or('lead_status.eq.Funded,underwriting_data->>isFunded.eq.true')
      .range(from, from + pageSize - 1);
    if (error) return { rows: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { rows, error: null };
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = req.nextUrl.searchParams.get('month') || localMonthKey();

  const { rows, error } = await fetchFundedLeads(supabase, user.id);
  if (error || !rows) {
    console.error('[funding-stats]', error?.message);
    return NextResponse.json({ fundedCount: 0, fundedAmount: 0, commission: 0 });
  }

  let fundedCount = 0;
  let fundedSum = 0;
  let commission = 0;

  for (const lead of rows) {
    const ud = parseUd(lead.underwriting_data);
    const status = String(lead.lead_status ?? '').trim();
    const funded = isTruthy(ud.isFunded) || /^funded$/i.test(status);
    if (!funded) continue;

    // Stamp from the Deal Funded toggle, else last underwriting save on a funded deal.
    const fundedMonth = monthOf(ud.fundedAt) || monthOf(ud.lastUpdated);
    if (fundedMonth !== month) continue;

    fundedCount += 1;
    const adjusted = money(ud.adjustedAmount);
    const offers = Array.isArray(ud.actualOffers) ? ud.actualOffers as Record<string, unknown>[] : [];
    const selected = offers.find(o => o.id === ud.selectedOfferId);
    fundedSum += adjusted || money(selected?.amount) || money(ud.requestedAmount);
    commission += money(ud.commission);
  }

  return NextResponse.json(
    { fundedCount, fundedAmount: fundedSum, commission },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
