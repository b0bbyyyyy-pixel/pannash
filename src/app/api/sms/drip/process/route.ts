import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { zoneForLocation, isInSendWindow, nextWindowStart } from '@/lib/smsDrip/timezones';
import { toE164 } from '@/lib/dialer/e164';

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
  include_already_texted?: boolean;
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

function last10(raw: string | null | undefined) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
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
  const target = (Number(job.window_hours) * 3600 * 1000) / Math.max(1, job.total_count);
  if (target > maxS * 1000) {
    delay = target * (0.8 + Math.random() * 0.4);
  }
  delay += Math.random() * 12000;
  return Math.round(delay);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alreadyTexted(supabase: any, userId: string, leadId: string, phone: string | null, exceptSendId: string, includeAlreadyTexted?: boolean) {
  const { data: byLead } = await supabase
    .from('sms_drip_sends')
    .select('id')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .in('sms_status', ['sent', 'sending'])
    .neq('id', exceptSendId)
    .limit(1);
  if (byLead?.length) return 'Already sent to this lead';

  const digits = last10(phone);
  const e164 = toE164(phone ?? '');
  if (digits.length === 10) {
    const { data: byPhone } = await supabase
      .from('sms_drip_sends')
      .select('id, phone')
      .eq('user_id', userId)
      .in('sms_status', ['sent', 'sending'])
      .neq('id', exceptSendId)
      .limit(300);
    if ((byPhone ?? []).some((r: { phone?: string | null }) => {
      const other = last10(r.phone);
      return other === digits || (e164 && toE164(r.phone ?? '') === e164);
    })) {
      return 'Already sent to this number';
    }
  }

  if (!includeAlreadyTexted) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: inbox } = await supabase
      .from('inbox_messages')
      .select('id')
      .eq('lead_id', leadId)
      .eq('direction', 'outbound')
      .in('status', ['queued', 'sent', 'delivered'])
      .gte('created_at', since)
      .limit(1);
    if (inbox?.length) return 'Already texted this lead today';
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function leaseJob(supabase: any, job: DripJob, userId: string, now: Date) {
  if (job.next_send_at && new Date(job.next_send_at) > now) return false;
  const leaseUntil = new Date(now.getTime() + 90_000).toISOString();
  const q = supabase
    .from('sms_drip_jobs')
    .update({ next_send_at: leaseUntil, updated_at: now.toISOString() })
    .eq('id', job.id)
    .eq('user_id', userId)
    .eq('status', 'active');
  const { data } = job.next_send_at
    ? await q.lte('next_send_at', now.toISOString()).select('id').maybeSingle()
    : await q.is('next_send_at', null).select('id').maybeSingle();
  return !!data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function claimSendRow(supabase: any, send: DripSend, jobId: string, leaseUntil: string) {
  const { data: asSending, error } = await supabase
    .from('sms_drip_sends')
    .update({ sms_status: 'sending', scheduled_for: leaseUntil, error: null })
    .eq('id', send.id)
    .eq('job_id', jobId)
    .in('sms_status', ['queued', 'scheduled'])
    .select('id')
    .maybeSingle();
  if (asSending) return true;
  if (!error) return false;

  // 'sending' not in the CHECK constraint yet — claim via scheduled + token
  const token = `claim:${crypto.randomUUID()}`;
  if (send.sms_status === 'queued') {
    const { data } = await supabase
      .from('sms_drip_sends')
      .update({ sms_status: 'scheduled', scheduled_for: leaseUntil, error: token })
      .eq('id', send.id)
      .eq('job_id', jobId)
      .eq('sms_status', 'queued')
      .select('id')
      .maybeSingle();
    return !!data;
  }
  const { data } = await supabase
    .from('sms_drip_sends')
    .update({ error: token, scheduled_for: leaseUntil })
    .eq('id', send.id)
    .eq('job_id', jobId)
    .eq('sms_status', 'scheduled')
    .is('error', null)
    .select('id')
    .maybeSingle();
  return !!data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCandidates(supabase: any, jobId: string, nowIso: string) {
  const { data: dueScheduled } = await supabase
    .from('sms_drip_sends')
    .select('id, lead_id, position, phone, sms_status, scheduled_for')
    .eq('job_id', jobId)
    .eq('sms_status', 'scheduled')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(5);

  const { data: queued } = await supabase
    .from('sms_drip_sends')
    .select('id, lead_id, position, phone, sms_status, scheduled_for')
    .eq('job_id', jobId)
    .eq('sms_status', 'queued')
    .order('position', { ascending: true })
    .limit(25);

  return [...(dueScheduled ?? []), ...(queued ?? [])] as DripSend[];
}

// POST /api/sms/drip/process — advance every active drip job by at most one send.
// Client-polled every ~15s. Concurrent tabs used to both send; job + send claims make extra ticks a no-op.
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
    const nowIso = now.toISOString();
    const results: Record<string, unknown>[] = [];

    for (const job of jobs as DripJob[]) {
      let claimedSend: DripSend | null = null;
      let jobClaimed = false;

      const { data: rpc, error: rpcErr } = await supabase.rpc('claim_drip_job_send', { p_job_id: job.id });
      if (!rpcErr && rpc && typeof rpc === 'object') {
        const payload = rpc as { job_claimed?: boolean; send?: { id: string; lead_id: string; position: number; phone: string | null } | null };
        if (!payload.job_claimed) {
          results.push({ jobId: job.id, waited: true });
          continue;
        }
        jobClaimed = true;
        if (payload.send?.id) {
          claimedSend = {
            id: payload.send.id,
            lead_id: payload.send.lead_id,
            position: payload.send.position,
            phone: payload.send.phone,
            sms_status: 'sending',
            scheduled_for: null,
          };
        }
      } else {
        jobClaimed = await leaseJob(supabase, job, user.id, now);
        if (!jobClaimed) {
          results.push({ jobId: job.id, waited: true });
          continue;
        }
        const leaseUntil = new Date(now.getTime() + 90_000).toISOString();
        for (const send of await loadCandidates(supabase, job.id, nowIso)) {
          if (await claimSendRow(supabase, send, job.id, leaseUntil)) {
            claimedSend = send;
            break;
          }
        }
      }

      if (!claimedSend) {
        const { data: remaining } = await supabase
          .from('sms_drip_sends')
          .select('sms_status, scheduled_for')
          .eq('job_id', job.id)
          .in('sms_status', ['queued', 'scheduled', 'sending']);

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
        continue;
      }

      const send = claimedSend;
      const { data: lead } = await supabase
        .from('leads')
        .select('id, name, company, phone, sms_opt_out, underwriting_data')
        .eq('id', send.lead_id)
        .single();

      const failSend = async (status: string, error: string) => {
        await supabase.from('sms_drip_sends')
          .update({ sms_status: status, error, scheduled_for: null })
          .eq('id', send.id);
      };

      if (!lead) {
        await failSend('skipped_dnc', 'Lead deleted');
        results.push({ jobId: job.id, leadId: send.lead_id, status: 'skipped_dnc' });
        continue;
      }
      if (lead.sms_opt_out) {
        await failSend('skipped_dnc', 'Opted out');
        results.push({ jobId: job.id, leadId: lead.id, status: 'skipped_dnc' });
        continue;
      }

      const dup = await alreadyTexted(supabase, user.id, lead.id, send.phone ?? lead.phone, send.id, job.include_already_texted);
      if (dup) {
        await failSend('skipped_dup', dup);
        results.push({ jobId: job.id, leadId: lead.id, status: 'skipped_dup', reason: dup });
        continue;
      }

      const ud = (lead.underwriting_data ?? {}) as Record<string, unknown>;
      const state = String(ud.businessState ?? ud.state ?? '').trim();
      const city = String(ud.businessCity ?? ud.city ?? '').trim();
      const tz = zoneForLocation(city, state) ?? 'America/New_York';
      const days = job.send_days?.length ? job.send_days : [1, 2, 3, 4, 5, 6];

      if (!isInSendWindow(tz, job.quiet_start, job.quiet_end, days, now)) {
        const opensAt = nextWindowStart(tz, job.quiet_start, days, now);
        await supabase.from('sms_drip_sends')
          .update({ sms_status: 'scheduled', scheduled_for: opensAt.toISOString(), error: null })
          .eq('id', send.id);
        await supabase.from('sms_drip_jobs')
          .update({ next_send_at: opensAt.toISOString() })
          .eq('id', job.id);
        results.push({ jobId: job.id, waitingForWindow: true, nextDue: opensAt.toISOString() });
        continue;
      }

      const tplIndex = Math.floor(Math.random() * Math.max(1, job.templates.length));
      const body = renderTemplate(job.templates[tplIndex] ?? '', lead);
      if (!body) {
        await failSend('failed', 'Template rendered empty');
        results.push({ jobId: job.id, leadId: lead.id, status: 'failed' });
        continue;
      }

      const creds = await getTwilioCreds(supabase, user.id);
      if (!creds) {
        await supabase.from('sms_drip_sends')
          .update({ sms_status: 'queued', scheduled_for: null, error: null })
          .eq('id', send.id);
        await supabase.from('sms_drip_jobs').update({ status: 'paused' }).eq('id', job.id);
        results.push({ jobId: job.id, error: 'No Twilio connection — drip paused' });
        continue;
      }

      // Last look before Twilio — another tab may have just recorded a send
      const dupAgain = await alreadyTexted(supabase, user.id, lead.id, send.phone ?? lead.phone, send.id, job.include_already_texted);
      if (dupAgain) {
        await failSend('skipped_dup', dupAgain);
        results.push({ jobId: job.id, leadId: lead.id, status: 'skipped_dup', reason: dupAgain });
        continue;
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

      await recordOutboundInboxSms(supabase, {
        userId: user.id,
        leadId: lead.id,
        toPhone: send.phone ?? lead.phone,
        body,
        twilioSid: sid,
        status: sendStatus === 'failed' ? 'failed' : 'sent',
        errorMessage: sendError,
        sentBy: 'system',
        bumpLastMessageAt: false,
      });

      await supabase.from('sms_drip_sends').update({
        sms_status: sendStatus,
        sent_at: sendStatus === 'sent' ? sentAt : null,
        template_index: tplIndex,
        error: sendError,
        scheduled_for: null,
      }).eq('id', send.id);

      if (sendStatus === 'sent') {
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
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    console.error('[sms/drip/process]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
