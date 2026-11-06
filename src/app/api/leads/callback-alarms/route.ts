import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callbackAlarmAcked, followUpKindFromUd } from '@/lib/lead-follow-up';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export type CallbackAlarm = {
  leadId: string;
  name: string;
  company: string | null;
  phone: string | null;
  dueAt: string;
};

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const horizon = new Date(Date.now() + 8_000).toISOString();
  const { data, error } = await supabase
    .from('leads')
    .select('id, name, company, phone, follow_up_due_at, follow_up_auto_text, underwriting_data')
    .eq('user_id', user.id)
    .not('follow_up_due_at', 'is', null)
    .lte('follow_up_due_at', horizon)
    .order('follow_up_due_at', { ascending: true })
    .limit(20);

  if (error) {
    if ((error.message || '').toLowerCase().includes('follow_up_due_at')) {
      return NextResponse.json({ alarms: [] as CallbackAlarm[] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alarms: CallbackAlarm[] = [];
  for (const row of data ?? []) {
    if (row.follow_up_auto_text) continue;
    if (followUpKindFromUd(row.underwriting_data) !== 'callback') continue;
    if (callbackAlarmAcked(row.underwriting_data, row.follow_up_due_at)) continue;
    alarms.push({
      leadId: row.id,
      name: String(row.company || row.name || 'Lead').trim() || 'Lead',
      company: row.company ?? null,
      phone: row.phone ?? null,
      dueAt: row.follow_up_due_at,
    });
  }

  return NextResponse.json({ alarms });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leadId = String(body.leadId || '').trim();
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, underwriting_data')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const ud = {
    ...((lead.underwriting_data && typeof lead.underwriting_data === 'object')
      ? lead.underwriting_data as Record<string, unknown>
      : {}),
    followUpAlarmAckedAt: new Date().toISOString(),
  };

  await supabase
    .from('leads')
    .update({ underwriting_data: ud })
    .eq('id', leadId)
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
