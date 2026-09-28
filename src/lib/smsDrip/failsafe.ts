import { notifyUserAlert } from '@/lib/notify/userAlert';

export const DRIP_FAIL_STREAK = 3;

type PauseResult = { paused: boolean };

function isMissingColumn(err: { message?: string } | null | undefined, column: string) {
  const msg = String(err?.message ?? '').toLowerCase();
  return msg.includes(column) && (msg.includes('column') || msg.includes('schema cache'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateJob(supabase: any, jobId: string, patch: Record<string, unknown>, onlyActive = false) {
  let q = supabase.from('sms_drip_jobs').update(patch).eq('id', jobId);
  if (onlyActive) q = q.eq('status', 'active');
  let { data, error } = await q.select('id, list_id, user_id').maybeSingle();
  if (error && (isMissingColumn(error, 'pause_reason') || isMissingColumn(error, 'consecutive_failures'))) {
    const slim = { ...patch };
    delete slim.pause_reason;
    delete slim.consecutive_failures;
    let retry = supabase.from('sms_drip_jobs').update(slim).eq('id', jobId);
    if (onlyActive) retry = retry.eq('status', 'active');
    ({ data, error } = await retry.select('id, list_id, user_id').maybeSingle());
  }
  if (error) {
    console.error('[drip failsafe] job update', error.message);
    return null;
  }
  return data as { id: string; list_id: string; user_id: string } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateSend(supabase: any, sendId: string, patch: Record<string, unknown>) {
  let { error } = await supabase.from('sms_drip_sends').update(patch).eq('id', sendId);
  if (error && isMissingColumn(error, 'twilio_sid')) {
    const slim = { ...patch };
    delete slim.twilio_sid;
    ({ error } = await supabase.from('sms_drip_sends').update(slim).eq('id', sendId));
  }
  if (error) console.error('[drip failsafe] send update', error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function campaignName(supabase: any, listId: string) {
  const { data } = await supabase.from('lead_lists').select('name').eq('id', listId).maybeSingle();
  return (data?.name as string | undefined)?.trim() || 'SMS campaign';
}

/** Pause the drip if the last 3 attempted texts all failed. Alert once. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function maybePauseDripAfterFailures(
  supabase: any,
  jobId: string,
  lastError?: string | null,
  email?: string | null,
): Promise<PauseResult> {
  const { data: recent, error } = await supabase
    .from('sms_drip_sends')
    .select('sms_status')
    .eq('job_id', jobId)
    .in('sms_status', ['sent', 'failed'])
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(DRIP_FAIL_STREAK);

  if (error) {
    console.error('[drip failsafe] streak', error.message);
    return { paused: false };
  }

  const rows = (recent ?? []) as { sms_status: string }[];
  let streak = 0;
  for (const row of rows) {
    if (row.sms_status !== 'failed') break;
    streak += 1;
  }
  if (streak < DRIP_FAIL_STREAK) {
    await updateJob(supabase, jobId, {
      consecutive_failures: streak,
      updated_at: new Date().toISOString(),
    });
    return { paused: false };
  }

  const reason = lastError
    ? `${DRIP_FAIL_STREAK} failed texts in a row (${lastError})`
    : `${DRIP_FAIL_STREAK} failed texts in a row`;

  const paused = await updateJob(supabase, jobId, {
    status: 'paused',
    pause_reason: reason,
    consecutive_failures: DRIP_FAIL_STREAK,
    next_send_at: null,
    updated_at: new Date().toISOString(),
  }, true);

  if (!paused) return { paused: false };

  const name = await campaignName(supabase, paused.list_id);
  const detail = lastError ? ` Last error: ${lastError}` : '';
  await notifyUserAlert(supabase, {
    userId: paused.user_id,
    email,
    title: 'Campaign paused',
    body: `${name} stopped after ${DRIP_FAIL_STREAK} failed texts in a row.${detail}`,
    url: `/leads?list=${paused.list_id}`,
    tag: `drip-pause-${jobId}`,
  });

  return { paused: true };
}

/** Record a real send attempt (not a skip) and pause if the fail streak hits 3. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishDripAttempt(
  supabase: any,
  args: {
    jobId: string;
    sendId: string;
    status: 'sent' | 'failed';
    error?: string | null;
    twilioSid?: string | null;
    templateIndex?: number | null;
    email?: string | null;
  },
): Promise<PauseResult> {
  const sentAt = new Date().toISOString();
  await updateSend(supabase, args.sendId, {
    sms_status: args.status,
    sent_at: sentAt,
    error: args.error ?? null,
    scheduled_for: null,
    ...(args.templateIndex != null ? { template_index: args.templateIndex } : {}),
    ...(args.twilioSid ? { twilio_sid: args.twilioSid } : {}),
  });

  if (args.status === 'sent') {
    await updateJob(supabase, args.jobId, {
      consecutive_failures: 0,
      updated_at: sentAt,
    });
    return { paused: false };
  }

  return maybePauseDripAfterFailures(supabase, args.jobId, args.error, args.email);
}

/**
 * Carrier rejections (30005 / 30007) often land after Twilio already accepted the text.
 * Flip that drip send to failed and pause on a streak of 3.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onDripDeliveryFailed(
  supabase: any,
  args: {
    twilioSid?: string | null;
    leadId?: string | null;
    userId?: string | null;
    error?: string | null;
  },
): Promise<PauseResult> {
  let send: { id: string; job_id: string; sms_status: string } | null = null;

  if (args.twilioSid) {
    const { data, error } = await supabase
      .from('sms_drip_sends')
      .select('id, job_id, sms_status')
      .eq('twilio_sid', args.twilioSid)
      .maybeSingle();
    if (!error) send = data;
  }

  if (!send && args.leadId) {
    let jobsQuery = supabase.from('sms_drip_jobs').select('id').eq('status', 'active');
    if (args.userId) jobsQuery = jobsQuery.eq('user_id', args.userId);
    const { data: jobs } = await jobsQuery;
    const jobIds = ((jobs ?? []) as { id: string }[]).map(j => j.id);
    if (jobIds.length) {
      const { data } = await supabase
        .from('sms_drip_sends')
        .select('id, job_id, sms_status')
        .eq('lead_id', args.leadId)
        .in('job_id', jobIds)
        .in('sms_status', ['sent', 'sending'])
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      send = data;
    }
  }

  if (!send) return { paused: false };

  if (send.sms_status !== 'failed') {
    await updateSend(supabase, send.id, {
      sms_status: 'failed',
      error: args.error ?? 'Delivery failed',
    });
  }

  return maybePauseDripAfterFailures(supabase, send.job_id, args.error);
}
