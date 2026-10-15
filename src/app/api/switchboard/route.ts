import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';

export const dynamic = 'force-dynamic';

const OFFER_STATUSES = [
  'Offers/Follow up',
  'Approved',
  'Conditionally Approved',
  'Pre-Qualified',
];
const DOCS_STATUSES = ['Docs In', 'Docs Received'];
const PROSPECT_STATUSES = [
  'New Lead',
  'Prospect',
  'Contacted',
  'Callback Scheduled',
  'Revisit',
  'App Out',
  'Application Acknowledgement',
  'Documents Acknowledgment',
  'Docs Requested',
  'Missing Docs/info',
  'Needs More Docs',
  'Docs In',
  'Docs Received',
];
const SUBMITTED_STATUSES = [
  'Submitted',
  'Submitted To Non-MCA',
  'Submitted to Underwriting',
  'In Underwriting',
];
const APPROVAL_STATUSES = [
  'Offers/Follow up',
  'Approved',
  'Conditionally Approved',
  'Pre-Qualified',
  'Contract Sent',
  'Contract In',
  'Contract Signed',
  'Contract Out',
];
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
    .in('lead_status', statuses)
    .or(`in_pipeline.eq.true,month_key.eq.${month}`);
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

async function liveActivity(supabase: SbClient, userId: string) {
  const since = new Date(Date.now() - 45_000).toISOString();
  let jobs: { id: string; list_id: string | null; status: string; sent_count: number | null }[] = [];
  try {
    const res = await supabase
      .from('sms_drip_jobs')
      .select('id, list_id, status, sent_count')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(3);
    if (res.error) jobs = [];
    else jobs = res.data ?? [];
  } catch {
    jobs = [];
  }

  const { data: inboundRows } = await supabase
    .from('inbox_conversations')
    .select('lead_id, last_message_at, last_direction')
    .eq('user_id', userId)
    .eq('last_direction', 'inbound')
    .gt('last_message_at', since)
    .limit(40);

  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const [sentRes, failRes] = await Promise.all([
      supabase
        .from('sms_drip_sends')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .in('sms_status', ['sent', 'delivered']),
      supabase
        .from('sms_drip_sends')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('sms_status', 'failed'),
    ]);
    sent += sentRes.count ?? 0;
    failed += failRes.count ?? 0;
  }

  const sinceIso = since;
  let composing = false;
  try {
    const { data: pending } = await supabase
      .from('casper_outbox')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(1);
    composing = (pending ?? []).length > 0;
  } catch {
    composing = false;
  }
  if (!composing) {
    try {
      const thinkSince = new Date(Date.now() - 120_000).toISOString();
      const { data: thinking } = await supabase
        .from('casper_lead_state')
        .select('lead_id')
        .eq('user_id', userId)
        .in('paused_reason', ['thinking', 'replying'])
        .gt('updated_at', thinkSince)
        .limit(1);
      composing = (thinking ?? []).length > 0;
    } catch {
      composing = false;
    }
  }

  const emails: { at: string }[] = [];
  try {
    const { data: runs } = await supabase
      .from('casper_runs')
      .select('created_at, actions')
      .eq('user_id', userId)
      .gt('created_at', sinceIso)
      .limit(20);
    for (const run of runs ?? []) {
      const acts = Array.isArray(run.actions) ? run.actions : [];
      const sent = acts.some((a: unknown) => {
        if (!a || typeof a !== 'object') return false;
        const row = a as { type?: string; sent?: boolean };
        return (row.type === 'application_sent' || row.type === 'email_application') && row.sent === true;
      });
      if (sent && run.created_at) emails.push({ at: String(run.created_at) });
    }
  } catch {
    /* optional */
  }

  return {
    drip: { active: jobs.length > 0, sent, failed },
    inbound: (inboundRows ?? []).map((r: { lead_id: string; last_message_at: string | null }) => ({
      leadId: r.lead_id,
      at: r.last_message_at,
    })),
    composing,
    emails,
  };
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const user = await getRequestUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (req.nextUrl.searchParams.get('live') === '1') {
    const live = await liveActivity(supabase, user.id);
    return NextResponse.json(live, { headers: { 'Cache-Control': 'no-store' } });
  }

  const now = new Date();
  const month = localMonthKey(now);
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const [funded, offers, docsIn, prospects, submitted, approvals, declined] = await Promise.all([
    fundedThisMonth(supabase, user.id, month),
    countByStatus(supabase, user.id, month, OFFER_STATUSES),
    countByStatus(supabase, user.id, month, DOCS_STATUSES),
    countByStatus(supabase, user.id, month, PROSPECT_STATUSES),
    countByStatus(supabase, user.id, month, SUBMITTED_STATUSES),
    countByStatus(supabase, user.id, month, APPROVAL_STATUSES),
    countByStatus(supabase, user.id, month, DECLINED_STATUSES),
  ]);

  return NextResponse.json(
    { month, day, daysInMonth, funded, offers, docsIn, prospects, submitted, approvals, declined },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
