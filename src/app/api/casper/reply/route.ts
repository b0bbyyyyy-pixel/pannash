import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { runCasperInboundSms } from '@/lib/casper/reply';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { leadId, delay } = await req.json();
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, user_id, phone, name, company, email, notes, casper_enabled, sms_opt_out')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: 'Lead has no phone' }, { status: 400 });

  const { data: lastIn } = await supabase
    .from('inbox_messages')
    .select('body')
    .eq('lead_id', lead.id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = await runCasperInboundSms(supabase, {
    userId: user.id,
    lead,
    body: lastIn?.body || '',
    from: lead.phone,
    to: '',
    delay: delay !== false,
  });

  return NextResponse.json(result);
}
