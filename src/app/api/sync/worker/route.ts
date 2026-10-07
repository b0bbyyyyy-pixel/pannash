import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { processTick } from '@/lib/smsDrip/processTick';
import { processDue } from '@/lib/followups/processDue';
import { fireDueCalendarPings } from '@/lib/casper/calendarPing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function paceCapMs(paceMax: unknown) {
  return (Math.max(Number(paceMax) || 0, 30) + 20) * 1000;
}

function minIso(values: (string | number | null | undefined)[]): string | null {
  const times = values
    .map(v => {
      if (v == null) return NaN;
      return typeof v === 'number' ? v : new Date(v).getTime();
    })
    .filter(n => Number.isFinite(n));
  if (!times.length) return null;
  return new Date(Math.min(...times)).toISOString();
}

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const soon = now + 2000;

  const [dripJobsResRaw, dueFollowRes] = await Promise.all([
    supabase
      .from('sms_drip_jobs')
      .select('id, next_send_at, pace_max_seconds')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('leads')
      .select('id, follow_up_due_at, follow_up_calendar_event_id, follow_up_auto_text, follow_up_sms_sent_at')
      .eq('user_id', user.id)
      .not('follow_up_due_at', 'is', null)
      .lte('follow_up_due_at', nowIso)
      .limit(20),
  ]);
  const dripJobsRes = dripJobsResRaw.error
    ? await supabase
        .from('sms_drip_jobs')
        .select('id, next_send_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
    : dripJobsResRaw;

  const dripJobs = (dripJobsRes.data ?? []) as {
    id: string;
    next_send_at: string | null;
    pace_max_seconds?: number | null;
  }[];
  const dripDue = dripJobs.some(j => {
    if (!j.next_send_at) return true;
    const t = new Date(j.next_send_at).getTime();
    if (!Number.isFinite(t) || t <= soon) return true;
    return t - now > paceCapMs(j.pace_max_seconds);
  });

  let drip: { processed: number; results: Record<string, unknown>[] } = { processed: 0, results: [] };
  let tickFailed = false;
  if (dripDue) {
    try {
      drip = await processTick(supabase, user);
    } catch (err) {
      tickFailed = true;
      console.error('[sync/worker] processTick', err);
    }
  }

  let followups: Awaited<ReturnType<typeof processDue>> = { processed: 0 };
  const dueFollowRows = dueFollowRes.data ?? [];
  const followDue = dueFollowRes.error
    ? true
    : dueFollowRows.some(r =>
        !r.follow_up_calendar_event_id
        || (r.follow_up_auto_text === true && !r.follow_up_sms_sent_at)
      );
  if (followDue) {
    try {
      followups = await processDue(supabase, user);
    } catch (err) {
      console.error('[sync/worker] processDue', err);
    }
  }

  let pings = 0;
  try {
    pings = await fireDueCalendarPings(supabase, user.id);
  } catch (err) {
    console.error('[sync/worker] calendar ping', err);
  }

  if (tickFailed) {
    return NextResponse.json({
      drip: drip.results,
      followups,
      pings,
      nextDueAt: new Date(now + 15_000).toISOString(),
    });
  }

  const sentZero = drip.results.filter(r => r.status === 'sent' && r.nextInMs === 0).length;
  const sentCount = drip.results.filter(r => r.status === 'sent').length;
  let nextDueAt: string | null = null;
  if (sentCount >= 12 && sentZero >= 11) {
    nextDueAt = nowIso;
  } else {
    let liveJobs: { next_send_at: string | null; pace_max_seconds?: number | null }[] = [];
    {
      const withPace = await supabase
        .from('sms_drip_jobs')
        .select('next_send_at, pace_max_seconds')
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (withPace.error) {
        const fallback = await supabase
          .from('sms_drip_jobs')
          .select('next_send_at')
          .eq('user_id', user.id)
          .eq('status', 'active');
        liveJobs = fallback.data ?? [];
      } else {
        liveJobs = withPace.data ?? [];
      }
    }
    const dripAts = liveJobs.map(j => {
      if (!j.next_send_at) return now;
      const t = new Date(j.next_send_at).getTime();
      if (!Number.isFinite(t)) return now;
      if (t - now > paceCapMs(j.pace_max_seconds)) return now + 15_000;
      return t;
    });
    const nextDrip = dripAts.length ? Math.min(...dripAts) : null;

    const { data: nextFuRows } = await supabase
      .from('leads')
      .select('follow_up_due_at, follow_up_calendar_event_id, follow_up_auto_text, follow_up_sms_sent_at')
      .eq('user_id', user.id)
      .not('follow_up_due_at', 'is', null)
      .gt('follow_up_due_at', nowIso)
      .order('follow_up_due_at', { ascending: true })
      .limit(20);
    const nextFu = (nextFuRows ?? []).find(r =>
      !r.follow_up_calendar_event_id
      || (r.follow_up_auto_text === true && !r.follow_up_sms_sent_at)
    ) ?? null;

    let nextPing: string | null = null;
    try {
      const { data: pingRow } = await supabase
        .from('calendar_events')
        .select('alert_at')
        .eq('user_id', user.id)
        .eq('alert_enabled', true)
        .eq('alert_sent', false)
        .not('alert_at', 'is', null)
        .gt('alert_at', nowIso)
        .order('alert_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      nextPing = pingRow?.alert_at ?? null;
    } catch { /* column may be missing */ }

    nextDueAt = minIso([nextDrip, nextFu?.follow_up_due_at, nextPing]);
  }

  const cap = now + 60_000;
  const nextMs = nextDueAt ? new Date(nextDueAt).getTime() : cap;
  const capped = new Date(Math.min(Math.max(nextMs, now), cap)).toISOString();

  return NextResponse.json({
    drip: drip.results,
    followups,
    pings,
    nextDueAt: capped,
  });
}
