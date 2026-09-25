import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { toE164 } from '@/lib/dialer/e164';
import { normalizeState } from '@/lib/smsDrip/timezones';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

// GET /api/sms/drip            → all active/paused jobs for the user (campaign list rows)
// GET /api/sms/drip?listId=xxx → latest job for that list + per-lead send states
export async function GET(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const listId = req.nextUrl.searchParams.get('listId');

    if (!listId) {
      const { data: jobs, error } = await supabase
        .from('sms_drip_jobs')
        .select('id, list_id, status, sent_count, total_count, next_send_at')
        .eq('user_id', user.id)
        .in('status', ['active', 'paused']);
      if (error) return NextResponse.json({ jobs: [], setupRequired: true });
      return NextResponse.json({ jobs: jobs ?? [] });
    }

    const { data: list } = await supabase
      .from('lead_lists')
      .select('sms_templates')
      .eq('id', listId)
      .eq('user_id', user.id)
      .maybeSingle();
    const savedTemplates = (list?.sms_templates as string[] | null) ?? null;

    const { data: job, error } = await supabase
      .from('sms_drip_jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('list_id', listId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ job: null, sends: [], savedTemplates, setupRequired: true });
    if (!job) return NextResponse.json({ job: null, sends: [], savedTemplates });

    const { data: sends } = await supabase
      .from('sms_drip_sends')
      .select('lead_id, sms_status, scheduled_for, sent_at, error')
      .eq('job_id', job.id);

    return NextResponse.json({ job, sends: sends ?? [], savedTemplates });
  } catch (err) {
    console.error('[sms/drip GET]', err);
    return NextResponse.json({ job: null, sends: [], error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/sms/drip — create + start a drip job for a list
export async function POST(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      listId,
      templates,
      paceMinSeconds = 60,
      paceMaxSeconds = 120,
      windowHours = 5,
      quietStart = '09:00',
      quietEnd = '20:00',
      skipStates = [],
      includeAlreadyTexted = false,
    } = await req.json();

    if (!listId) return NextResponse.json({ error: 'listId required' }, { status: 400 });
    const tpl: string[] = (templates ?? []).map((t: string) => String(t).trim()).filter(Boolean);
    if (tpl.length < 1) return NextResponse.json({ error: 'At least one template required' }, { status: 400 });

    // No two drips on the same list at once
    const { data: existing } = await supabase
      .from('sms_drip_jobs')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('list_id', listId)
      .in('status', ['active', 'paused'])
      .limit(1);
    if (existing?.length) {
      return NextResponse.json({ error: 'A drip is already running on this campaign. Pause or cancel it first.' }, { status: 400 });
    }

    // Save templates on the campaign so they prefill next time
    await supabase.from('lead_lists').update({ sms_templates: tpl }).eq('id', listId).eq('user_id', user.id);

    // Load the list's leads in list order
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, phone, sms_opt_out, sms_sent_at, underwriting_data')
      .eq('user_id', user.id)
      .eq('list_id', listId)
      .order('created_at', { ascending: false });
    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });

    const skip = new Set((skipStates as string[]).map(s => normalizeState(s)).filter(Boolean));
    const seenPhones = new Set<string>();
    const now = new Date().toISOString();

    const { data: priorSends } = await supabase
      .from('sms_drip_sends')
      .select('lead_id, phone')
      .eq('user_id', user.id)
      .in('sms_status', ['sent', 'sending']);
    const alreadyLead = new Set((priorSends ?? []).map(s => s.lead_id));
    const alreadyPhone = new Set(
      (priorSends ?? []).map(s => (s.phone || '').replace(/\D/g, '').slice(-10)).filter(d => d.length === 10)
    );

    const rows = (leads ?? []).map((l, i) => {
      const e164 = toE164(l.phone ?? '');
      const digits = (e164 || l.phone || '').replace(/\D/g, '').slice(-10);
      const ud = (l.underwriting_data ?? {}) as Record<string, unknown>;
      const state = normalizeState(String(ud.businessState ?? ud.state ?? ''));

      let status = 'queued';
      let error: string | null = null;
      if (!e164) { status = 'skipped_dnc'; error = 'No valid phone'; }
      else if (l.sms_opt_out) { status = 'skipped_dnc'; error = 'Opted out'; }
      else if (!includeAlreadyTexted && l.sms_sent_at) { status = 'skipped_dnc'; error = 'Already texted'; }
      else if (!includeAlreadyTexted && alreadyLead.has(l.id)) { status = 'skipped_dup'; error = 'Already sent in a prior drip'; }
      else if (!includeAlreadyTexted && digits.length === 10 && alreadyPhone.has(digits)) { status = 'skipped_dup'; error = 'Number already texted'; }
      else if (state && skip.has(state)) { status = 'skipped_state'; }
      else if (e164 && seenPhones.has(e164)) { status = 'skipped_dup'; error = 'Duplicate phone in campaign'; }
      if (e164) seenPhones.add(e164);

      return {
        user_id: user.id,
        lead_id: l.id,
        position: i,
        phone: e164 || l.phone || null,
        sms_status: status,
        error,
      };
    });

    const sendable = rows.filter(r => r.sms_status === 'queued').length;
    if (sendable === 0) {
      return NextResponse.json({ error: 'No sendable leads (all skipped: no phone, opted out, or already texted).' }, { status: 400 });
    }

    const { data: job, error: jobErr } = await supabase
      .from('sms_drip_jobs')
      .insert({
        user_id: user.id,
        list_id: listId,
        status: 'active',
        templates: tpl,
        pace_min_seconds: Math.max(30, Number(paceMinSeconds) || 60),
        pace_max_seconds: Math.max(Number(paceMinSeconds) || 60, Number(paceMaxSeconds) || 120),
        window_hours: Number.isFinite(Number(windowHours)) && Number(windowHours) > 0 ? Number(windowHours) : 5,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        skip_states: [...skip],
        include_already_texted: !!includeAlreadyTexted,
        total_count: sendable,
        sent_count: 0,
        next_send_at: now,
      })
      .select('*')
      .single();

    if (jobErr || !job) {
      const msg = jobErr?.message?.includes('sms_drip_jobs')
        ? 'Drip tables missing — run add-sms-drip.sql in Supabase first.'
        : jobErr?.message ?? 'Could not create job';
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { error: sendsErr } = await supabase
      .from('sms_drip_sends')
      .insert(rows.map(r => ({ ...r, job_id: job.id })));
    if (sendsErr) {
      await supabase.from('sms_drip_jobs').update({ status: 'cancelled' }).eq('id', job.id);
      return NextResponse.json({ error: sendsErr.message }, { status: 500 });
    }

    return NextResponse.json({ job, sendable });
  } catch (err) {
    console.error('[sms/drip POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/sms/drip — { jobId, action: 'pause' | 'resume' | 'cancel' | 'update' }
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { jobId, action } = body;
    if (!jobId || !['pause', 'resume', 'cancel', 'update'].includes(action)) {
      return NextResponse.json({ error: 'jobId and valid action required' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === 'pause') patch.status = 'paused';
    if (action === 'resume') {
      patch.status = 'active';
      patch.next_send_at = new Date().toISOString();
    }
    if (action === 'cancel') patch.status = 'cancelled';

    if (action === 'update' || action === 'resume') {
      const tpl: string[] = (body.templates ?? []).map((t: string) => String(t).trim()).filter(Boolean);
      if (tpl.length) {
        patch.templates = tpl;
        const { data: job } = await supabase
          .from('sms_drip_jobs')
          .select('list_id')
          .eq('id', jobId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (job?.list_id) {
          await supabase.from('lead_lists').update({ sms_templates: tpl }).eq('id', job.list_id).eq('user_id', user.id);
        }
      }
      if (body.windowHours != null) {
        const wh = Number(body.windowHours);
        if (Number.isFinite(wh) && wh > 0) patch.window_hours = wh;
      }
      if (body.paceMinSeconds != null) patch.pace_min_seconds = Math.max(30, Number(body.paceMinSeconds) || 60);
      if (body.paceMaxSeconds != null) {
        const minS = Number(patch.pace_min_seconds ?? body.paceMinSeconds) || 60;
        patch.pace_max_seconds = Math.max(minS, Number(body.paceMaxSeconds) || 120);
      }
      if (body.quietStart) patch.quiet_start = body.quietStart;
      if (body.quietEnd) patch.quiet_end = body.quietEnd;
      if (Array.isArray(body.skipStates)) patch.skip_states = body.skipStates;
    }

    const { data, error } = await supabase
      .from('sms_drip_jobs')
      .update(patch)
      .eq('id', jobId)
      .eq('user_id', user.id)
      .select('id, status')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ job: data });
  } catch (err) {
    console.error('[sms/drip PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
