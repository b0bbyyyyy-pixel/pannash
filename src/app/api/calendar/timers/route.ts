import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// GET /api/calendar/timers — returns leads with active timer_end_date for calendar display
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .select('id, name, company, timer_type, timer_end_date')
    .eq('user_id', user.id)
    .not('timer_end_date', 'is', null)
    .not('timer_type', 'in', '("No Timer","Display Date")')  // skip auto-created display dates
    .gt('timer_end_date', now);  // only future timers

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const timers = (data ?? []).map(lead => ({
    leadId: lead.id,
    label: lead.company || lead.name || 'Lead',
    timerType: lead.timer_type,
    timerEndDate: lead.timer_end_date as string,
  }));

  return NextResponse.json({ timers });
}

// DELETE /api/calendar/timers?leadId=xxx — clears a lead's timer, reverts to today's Display Date
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

  const { error } = await supabase
    .from('leads')
    .update({
      timer_type: 'Display Date',
      timer_end_date: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
