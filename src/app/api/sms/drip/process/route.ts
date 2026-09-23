import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { zoneForLocation, isInSendWindow, nextWindowStart } from '@/lib/smsDrip/timezones';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DripJob {
  id: string;
  user_id: string;
  list_id: string;
  status: string;
  templates: string[];
  pace_min_seconds: number;
  pace_max_seconds: number;
  window_hours: number;
  quiet_start: string;
  quiet_end: string;
  send_days: number[];
  skip_states: string[];
  total_count: number;
  sent_count: number;
  next_send_at: string | null;
}

interface DripSend {
  id: string;
  lead_id: string;
  position: number;
  phone: string | null;
  sms_status: string;
  scheduled_for: string | null;
}

function renderTemplate(tpl: string, lead: {
  name?: string | null; company?: string | null;
  underwriting_data?: Record<string, unknown> | null;
}): string {
  const ud = (lead.underwriting_data ?? {}) as Record<string, unknown>;
  const firstName = (lead.name ?? '').trim().split(/\s+/)[0] ?? '';
  const city = String(ud.businessCity ?? ud.city ?? '').trim();
  const state = String(ud.businessState ?? ud.state ?? '').trim();
  return tpl
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{company\}/gi, (lead.company ?? '').trim())
    .replace(/\{city\}/gi, city)
    .replace(/\{state\}/gi, state)
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Random pace delay in ms: random inside min–max, stretched if the window needs it, plus jitter. */
function nextDelayMs(job: DripJob): number {
  const minS = Math.max(30, job.pace_min_seconds);
  const maxS = Math.max(minS, job.pace_max_seconds);
  let delay = (minS + Math.random() * (maxS - minS)) * 1000;
  // If the window is long and the list is small, stretch to fill it
  const target = (Number(job.window_hours) * 3600 * 1000) / Math.max(1, job.total_count);
  if (target > maxS * 1000) {
    delay = target * (0.8 + Math.random() * 0.4);
  }
  // Small jitter so it's never a metronome
  delay += Math.random() * 12000;
  return Math.round(delay);
}

// POST /api/sms/drip/process — advance every active drip job by at most one send.
// Client-polled every ~15s (same pattern as AutoSMSProcessor). Safe to call repeatedly.
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: jobs, error: jobsErr } = await supabase
      .from('sms_drip_jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (jobsErr) return NextResponse.json({ processed: 0, setupRequired: true });
    if (!jobs?.length) return NextResponse.json({ processed: 0 });

    const now = new Date();
    const results: Record<string, unknown>[] = [];

    for (const job of jobs as DripJob[]) {
      // Respect the human pace — not due yet
      if (job.next_send_at && new Date(job.next_send_at) > now) {
        results.push({ jobId: job.id, waited: true });
        continue;
      }

      // Due scheduled leads first (their window opened), then queued in list order
      const { data: dueScheduled } = await supabase
        .from('sms_drip_sends')
        .select('id, lead_id, position, phone, sms_status, scheduled_for')
        .eq('job_id', job.id)
        .eq('sms_status', 'scheduled')
        .lte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(1);

      const { data: queued } = await supabase
        .from('sms_drip_sends')
        .select('id, lead_id, position, phone, sms_status, scheduled_for')
        .eq('job_id', job.id)
        .eq('sms_status', 'queued')
        .order('position', { ascending: true })
        .limit(25);

      const candidates: DripSend[] = [...(dueScheduled ?? []), ...(queued ?? [])];

      let sentThisTick = false;

      for (const send of candidates) {
        // Fresh lead state — reply / DNC may have landed since job creation
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, company, phone, sms_opt_out, underwriting_data')
          .eq('id', send.lead_id)
          .single();

        if (!lead) {
          await supabase.from('sms_drip_sends')
            .update({ sms_status: 'skipped_dnc', error: 'Lead deleted' }).eq('id', send.id);
          continue;
        }
        if (lead.sms_opt_out) {
          await supabase.from('sms_drip_sends')
            .update({ sms_status: 'skipped_dnc', error: 'Opted out' }).eq('id', send.id);
          continue;
        }

        // Timezone compliance
        const ud = (lead.underwriting_data ?? {}) as Record<string, unknown>;
        const state = String(ud.businessState ?? ud.state ?? '').trim();
        const city = String(ud.businessCity ?? ud.city ?? '').trim();
        const tz = zoneForLocation(city, state) ?? 'America/New_York';
        const days = job.send_days?.length ? job.send_days : [1, 2, 3, 4, 5, 6];

        if (!isInSendWindow(tz, job.quiet_start, job.quiet_end, days, now)) {
          const opensAt = nextWindowStart(tz, job.quiet_start, days, now);
          await supabase.from('sms_drip_sends')
            .update({ sms_status: 'scheduled', scheduled_for: opensAt.toISOString() })
            .eq('id', send.id);
          continue; // move on to the next eligible NOW lead
        }

        // Random template
        const tplIndex = Math.floor(Math.random() * Math.max(1, job.templates.length));
        const body = renderTemplate(job.templates[tplIndex] ?? '', lead);
        if (!body) {
          await supabase.from('sms_drip_sends')
            .update({ sms_status: 'failed', error: 'Template rendered empty' }).eq('id', send.id);
          continue;
        }

        // Send through the existing inbox thread so a later manual SMS shares the conversation
        let { data: conv } = await supabase
          .from('inbox_conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('lead_id', lead.id)
          .maybeSingle();
        if (!conv) {
          const { data: newConv } = await supabase
            .from('inbox_conversations')
            .insert({ user_id: user.id, lead_id: lead.id })
            .select('id')
            .single();
          conv = newConv;
        }

        const creds = await getTwilioCreds(supabase, user.id);
        if (!creds) {
          await supabase.from('sms_drip_jobs').update({ status: 'paused' }).eq('id', job.id);
          results.push({ jobId: job.id, error: 'No Twilio connection — drip paused' });
          sentThisTick = true; // stop the loop for this job
          break;
        }

        let sid: string | null = null;
        let sendStatus = 'sent';
        let sendError: string | null = null;
        try {
          const sent = await sendTwilioSms(creds, send.phone ?? lead.phone ?? '', body);
          sid = sent.sid;
          if (sent.status === 'failed') { sendStatus = 'failed'; sendError = sent.error ?? 'Send failed'; }
        } catch (e) {
          sendStatus = 'failed';
          sendError = e instanceof Error ? e.message : 'Send failed';
        }

        const sentAt = new Date().toISOString();

        // Thread message. Outbound drip does NOT bump last_message_at (Inbox stacks on replies only).
        if (conv) {
          await supabase.from('inbox_messages').insert({
            conversation_id: conv.id,
            lead_id: lead.id,
            direction: 'outbound',
            body,
            status: sendStatus === 'failed' ? 'failed' : 'sent',
            sent_by: 'system',
            twilio_sid: sid,
            error_message: sendError,
          });
          const preview = body.length > 100 ? body.slice(0, 97) + '…' : body;
          await supabase
            .from('inbox_conversations')
            .update({ last_message_preview: preview, last_direction: 'outbound' })
            .eq('id', conv.id);
        }

        await supabase.from('sms_drip_sends').update({
          sms_status: sendStatus,
          sent_at: sendStatus === 'sent' ? sentAt : null,
          template_index: tplIndex,
          error: sendError,
        }).eq('id', send.id);

        if (sendStatus === 'sent') {
          // Campaign chip SMS count uses sms_sent_at
          await supabase.from('leads')
            .update({ sms_sent_at: sentAt, last_contact: sentAt })
            .eq('id', lead.id);
        }

        const delay = nextDelayMs(job);
        await supabase.from('sms_drip_jobs').update({
          sent_count: job.sent_count + (sendStatus === 'sent' ? 1 : 0),
          next_send_at: new Date(now.getTime() + delay).toISOString(),
          updated_at: sentAt,
        }).eq('id', job.id);

        results.push({ jobId: job.id, leadId: lead.id, status: sendStatus, nextInMs: delay });
        sentThisTick = true;
        break; // one send per job per tick
      }

      if (!sentThisTick) {
        // Nothing sendable right now — completed, or everything is scheduled for later
        const { data: remaining } = await supabase
          .from('sms_drip_sends')
          .select('sms_status, scheduled_for')
          .eq('job_id', job.id)
          .in('sms_status', ['queued', 'scheduled']);

        if (!remaining?.length) {
          await supabase.from('sms_drip_jobs')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', job.id);
          results.push({ jobId: job.id, completed: true });
        } else {
          const nextDue = remaining
            .map(r => r.scheduled_for)
            .filter(Boolean)
            .sort()[0];
          if (nextDue) {
            await supabase.from('sms_drip_jobs')
              .update({ next_send_at: nextDue })
              .eq('id', job.id);
          }
          results.push({ jobId: job.id, waitingForWindow: true, nextDue: nextDue ?? null });
        }
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    console.error('[sms/drip/process]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
