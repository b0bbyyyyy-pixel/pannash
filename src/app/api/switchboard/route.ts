import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const OFFER_STATUSES = [
  'Offers/Follow up',
  'Approved',
  'Conditionally Approved',
  'Pre-Qualified',
];
const DOCS_STATUSES = ['Docs In', 'Docs Received'];
const DECLINED_STATUSES = [
  'Declined',
  'All Declined/Final',
  'Merchant Declined Offer',
];

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

function localMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type SbClient = ReturnType<typeof createServerClient>;

async function countByStatus(
  supabase: SbClient,
  userId: string,
  month: string,
  statuses: string[],
) {
  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('month_key', month)
    .in('lead_status', statuses);
  if (error) {
    console.error('[switchboard] count', error.message);
    return 0;
  }
  return count ?? 0;
}

async function fundedThisMonth(supabase: SbClient, userId: string, month: string) {
  const pageSize = 1000;
  let funded = 0;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('leads')
      .select('lead_status, underwriting_data')
      .eq('user_id', userId)
      .or('lead_status.eq.Funded,underwriting_data->>isFunded.eq.true')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('[switchboard] funded', error.message);
      break;
    }
    const rows = data ?? [];
    for (const lead of rows) {
      const ud = parseUd(lead.underwriting_data);
      const status = String(lead.lead_status ?? '').trim();
      const isFunded = isTruthy(ud.isFunded) || /^funded$/i.test(status);
      if (!isFunded) continue;
      const fundedMonth = monthOf(ud.fundedAt) || monthOf(ud.lastUpdated);
      if (fundedMonth === month) funded += 1;
    }
    if (rows.length < pageSize) break;
  }
  return funded;
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const month = localMonthKey(now);
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const [funded, offers, docsIn, declined] = await Promise.all([
    fundedThisMonth(supabase, user.id, month),
    countByStatus(supabase, user.id, month, OFFER_STATUSES),
    countByStatus(supabase, user.id, month, DOCS_STATUSES),
    countByStatus(supabase, user.id, month, DECLINED_STATUSES),
  ]);

  return NextResponse.json(
    { month, day, daysInMonth, funded, offers, docsIn, declined },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
