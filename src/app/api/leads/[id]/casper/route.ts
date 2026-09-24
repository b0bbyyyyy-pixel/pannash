import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, casper_enabled')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const { data: state } = await supabase
    .from('casper_lead_state')
    .select('phase, paused_reason, updated_at')
    .eq('lead_id', id)
    .maybeSingle();

  return NextResponse.json({
    enabled: lead.casper_enabled !== false,
    casper_enabled: lead.casper_enabled ?? null,
    phase: state?.phase ?? 'chatting',
    paused_reason: state?.paused_reason ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!('enabled' in body)) {
    return NextResponse.json({ error: 'enabled required' }, { status: 400 });
  }

  const value = body.enabled === null ? null : !!body.enabled;

  const { data: lead, error } = await supabase
    .from('leads')
    .update({ casper_enabled: value })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, casper_enabled')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  return NextResponse.json({
    enabled: lead.casper_enabled !== false,
    casper_enabled: lead.casper_enabled ?? null,
  });
}
