import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { casperEffectiveForLead } from '@/lib/casper/allow';
import { getBusinessName } from '@/lib/casper/businessName';
import { cancelPendingOutbox } from '@/lib/casper/outbox';
import { upsertCasperLeadState } from '@/lib/casper/runs';
import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';
import { dealStageFromLead } from '@/lib/casper/stage';

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
    .select('id, casper_enabled, lead_status, in_pipeline, list_id, sms_opt_out')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('casper_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  let state: {
    phase?: string | null;
    paused_reason?: string | null;
    updated_at?: string | null;
    plan_note?: string | null;
    last_guard_result?: string | null;
  } | null = null;
  {
    const full = await supabase
      .from('casper_lead_state')
      .select('phase, paused_reason, updated_at, plan_note, last_guard_result')
      .eq('lead_id', id)
      .maybeSingle();
    if (full.error && isMissingSchema(full.error)) {
      warnMissingSchema('casper_lead_state.plan_note', full.error);
      const slim = await supabase
        .from('casper_lead_state')
        .select('phase, paused_reason, updated_at')
        .eq('lead_id', id)
        .maybeSingle();
      state = slim.data;
    } else {
      state = full.data;
    }
  }

  let subs: { status?: string | null; created_at?: string | null }[] = [];
  try {
    const subRes = await supabase
      .from('lender_submissions')
      .select('status, created_at')
      .eq('lead_id', id)
      .limit(40);
    subs = subRes.data ?? [];
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('lender_submissions', err);
  }

  const derived = dealStageFromLead(lead, subs);
  const biz = await getBusinessName(supabase, user.id);

  return NextResponse.json({
    enabled: casperEffectiveForLead(!!settings?.casper_enabled, lead.casper_enabled),
    casper_enabled: lead.casper_enabled ?? null,
    phase: state?.phase ?? 'chatting',
    paused_reason: state?.paused_reason ?? null,
    stage: derived.stage,
    plan_note: state?.plan_note ?? null,
    last_guard_result: state?.last_guard_result ?? null,
    business_name_missing: biz.columnPresent && !biz.name,
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

  const { data: settings } = await supabase
    .from('user_settings')
    .select('casper_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  const enabled = casperEffectiveForLead(!!settings?.casper_enabled, lead.casper_enabled);
  if (enabled) {
    await upsertCasperLeadState(supabase, {
      leadId: id,
      userId: user.id,
      phase: 'chatting',
      pausedReason: null,
    });
  } else {
    await cancelPendingOutbox(supabase, { leadId: id, userId: user.id, reason: 'paused' });
  }

  return NextResponse.json({
    enabled,
    casper_enabled: lead.casper_enabled ?? null,
  });
}
