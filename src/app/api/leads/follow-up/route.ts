import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  callbackTitle,
  followUpTitle,
  isCallbackTimerId,
  isFollowUpTimerId,
  localDateKey,
  localTimeHm,
  resolveFollowUpDue,
  type FollowUpKind,
} from '@/lib/lead-follow-up';
import { atTimePingSchedule, earliestPingAt, encodePingSchedule } from '@/lib/casper/calendarPing';
import { cancelScheduledCasperPing, scheduleCasperPing } from '@/lib/casper/ping';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

function missingColumn(err: { message?: string } | null | undefined) {
  const m = (err?.message || '').toLowerCase();
  return m.includes('follow_up_due_at') || m.includes('schema cache') || m.includes('does not exist');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertCalendarEvent(
  supabase: any,
  opts: {
    userId: string;
    leadId: string;
    existingId: string | null;
    due: Date;
    title: string;
    notes: string;
    kind: FollowUpKind;
  },
): Promise<string | null> {
  const date = localDateKey(opts.due);
  const start_time = localTimeHm(opts.due);
  const callback = opts.kind === 'callback';
  const schedule = callback ? atTimePingSchedule(opts.due) : null;
  const payload: Record<string, unknown> = {
    title: opts.title,
    date,
    notes: opts.notes,
    color: callback ? 'amber' : 'red',
    start_time,
    updated_at: new Date().toISOString(),
    type: callback ? 'callback' : 'follow_up',
    alert_enabled: Boolean(schedule),
    alert_sent: false,
    alert_at: schedule ? earliestPingAt(schedule) : null,
    alert_phone: schedule ? encodePingSchedule(schedule) : null,
    alert_schedule: schedule,
  };

  if (opts.existingId) {
    const { data, error } = await supabase
      .from('calendar_events')
      .update(payload)
      .eq('id', opts.existingId)
      .eq('user_id', opts.userId)
      .select('id')
      .maybeSingle();
    if (!error && data?.id) return data.id as string;
    if (error && /alert_schedule/i.test(error.message || '')) {
      const { alert_schedule: _s, ...without } = payload;
      const retry = await supabase
        .from('calendar_events')
        .update(without)
        .eq('id', opts.existingId)
        .eq('user_id', opts.userId)
        .select('id')
        .maybeSingle();
      if (!retry.error && retry.data?.id) return retry.data.id as string;
    }
  }

  const insertFull = {
    user_id: opts.userId,
    date,
    title: opts.title,
    notes: opts.notes,
    color: callback ? 'amber' : 'red',
    alert_enabled: Boolean(schedule),
    alert_sent: false,
    alert_at: schedule ? earliestPingAt(schedule) : null,
    alert_phone: schedule ? encodePingSchedule(schedule) : null,
    alert_schedule: schedule,
    start_time,
    lead_id: opts.leadId,
    type: callback ? 'callback' : 'follow_up',
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(insertFull)
    .select('id')
    .single();

  if (!error && data?.id) return data.id as string;

  const stripSchedule = error && /alert_schedule/i.test(error.message || '');
  const { lead_id: _l, type: _t, ...insertBase } = insertFull;
  const row = stripSchedule
    ? (() => { const { alert_schedule: _s, ...rest } = insertBase; return rest; })()
    : insertBase;
  const { data: retry, error: retryErr } = await supabase
    .from('calendar_events')
    .insert(row)
    .select('id')
    .single();
  if (retryErr) {
    console.error('[follow-up] calendar insert', error || retryErr);
    return null;
  }
  return retry?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const leadId = String(body.leadId || '');
  const timerId = String(body.timerId || '');
  const kind: FollowUpKind = body.kind === 'callback' ? 'callback' : 'followup';
  const autoText = kind === 'callback' ? false : !!body.autoText;
  const smsBody = String(body.smsBody || '').trim();
  const customDate = String(body.customDate || '');
  const customTime = String(body.customTime || '10:00');

  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  if (kind === 'callback' ? !isCallbackTimerId(timerId) : !isFollowUpTimerId(timerId)) {
    return NextResponse.json({ error: 'Invalid timer' }, { status: 400 });
  }

  const due = resolveFollowUpDue({ timerId, customDate, customTime });
  if (!due) return NextResponse.json({ error: 'Pick a date and time' }, { status: 400 });

  if (autoText && !smsBody) {
    return NextResponse.json({ error: 'Write or pick a text to send when the timer ends' }, { status: 400 });
  }

  type LeadRow = {
    id: string;
    name: string | null;
    company: string | null;
    underwriting_data?: Record<string, unknown> | null;
    follow_up_calendar_event_id?: string | null;
  };

  let lead: LeadRow | null = null;
  let leadErr: { message?: string } | null = null;

  {
    const first = await supabase
      .from('leads')
      .select('id, name, company, follow_up_calendar_event_id, underwriting_data')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .maybeSingle();
    lead = first.data as LeadRow | null;
    leadErr = first.error;
  }

  if (leadErr) {
    const retry = await supabase
      .from('leads')
      .select('id, name, company, underwriting_data')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .maybeSingle();
    lead = retry.data as LeadRow | null;
    leadErr = retry.error;
  }

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const dateKey = localDateKey(due);
  const notes = kind === 'callback'
    ? 'Call this lead back.'
    : autoText
      ? 'Auto-text when this follow-up is due.'
      : 'Follow-up from lead card.';

  const eventId = await upsertCalendarEvent(supabase, {
    userId: user.id,
    leadId,
    existingId: lead.follow_up_calendar_event_id || null,
    due,
    title: kind === 'callback' ? callbackTitle(lead) : followUpTitle(lead),
    notes,
    kind,
  });

  const prevUd = (lead.underwriting_data && typeof lead.underwriting_data === 'object')
    ? lead.underwriting_data as Record<string, unknown>
    : {};
  const ud: Record<string, unknown> = {
    ...prevUd,
    followUpDate: dateKey,
    followUpKind: kind,
  };
  delete ud.followUpAlarmAckedAt;
  const prevPingSid = typeof prevUd.callbackPingSid === 'string' ? prevUd.callbackPingSid : null;
  await cancelScheduledCasperPing(supabase, user.id, prevPingSid);
  delete ud.callbackPingSid;

  if (kind === 'callback') {
    const who = (lead.company || lead.name || 'a lead').trim() || 'a lead';
    const ping = await scheduleCasperPing(supabase, {
      userId: user.id,
      body: `Casper: Time to call ${who}.`,
      sendAt: due,
      kind: 'calendar',
    });
    if (ping.sid) ud.callbackPingSid = ping.sid;
  }

  const fullPatch: Record<string, unknown> = {
    follow_up_at: dateKey,
    follow_up_due_at: due.toISOString(),
    follow_up_auto_text: autoText,
    follow_up_sms_body: autoText ? smsBody : null,
    follow_up_sms_sent_at: null,
    follow_up_calendar_event_id: eventId,
    underwriting_data: ud,
  };

  let { error } = await supabase
    .from('leads')
    .update(fullPatch)
    .eq('id', leadId)
    .eq('user_id', user.id);

  if (error && missingColumn(error)) {
    const fallback = await supabase
      .from('leads')
      .update({ follow_up_at: dateKey, underwriting_data: ud })
      .eq('id', leadId)
      .eq('user_id', user.id);
    error = fallback.error;
  }

  if (error) {
    const last = await supabase
      .from('leads')
      .update({ underwriting_data: ud })
      .eq('id', leadId)
      .eq('user_id', user.id);
    if (last.error) {
      console.error('[follow-up] update', error);
      return NextResponse.json({ error: last.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    follow_up_kind: kind,
    follow_up_at: dateKey,
    follow_up_due_at: due.toISOString(),
    follow_up_auto_text: autoText,
    follow_up_sms_body: autoText ? smsBody : null,
    follow_up_calendar_event_id: eventId,
    follow_up_sms_sent_at: null,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('follow_up_calendar_event_id, underwriting_data')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();

  const ud = lead?.underwriting_data && typeof lead.underwriting_data === 'object'
    ? lead.underwriting_data as Record<string, unknown>
    : {};
  await cancelScheduledCasperPing(
    supabase,
    user.id,
    typeof ud.callbackPingSid === 'string' ? ud.callbackPingSid : null,
  );

  if (lead?.follow_up_calendar_event_id) {
    await supabase
      .from('calendar_events')
      .delete()
      .eq('id', lead.follow_up_calendar_event_id)
      .eq('user_id', user.id);
  }

  const { error } = await supabase
    .from('leads')
    .update({
      follow_up_at: null,
      follow_up_due_at: null,
      follow_up_auto_text: false,
      follow_up_sms_body: null,
      follow_up_sms_sent_at: null,
      follow_up_calendar_event_id: null,
    })
    .eq('id', leadId)
    .eq('user_id', user.id);

  if (error) {
    if (missingColumn(error)) {
      await supabase.from('leads').update({ follow_up_at: null }).eq('id', leadId).eq('user_id', user.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
