import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { callbackTitle, followUpTitle, localDateKey, localTimeHm, renderFollowUpSms } from '@/lib/lead-follow-up';
import { atTimePingSchedule, earliestPingAt, encodePingSchedule, fireDueCalendarPings } from '@/lib/casper/calendarPing';
import { applySmsOptOutFromFailure, isTwilioOptOutError, smsSendBlockReason } from '@/lib/leads/dnc';

interface DueLead {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  sms_opt_out?: boolean | null;
  lead_status?: string | null;
  follow_up_due_at: string;
  follow_up_auto_text: boolean | null;
  follow_up_sms_body: string | null;
  follow_up_calendar_event_id: string | null;
  follow_up_sms_sent_at: string | null;
}

export type FollowUpDueResult = {
  processed: number;
  calendar?: number;
  texts?: number;
  pings?: number;
  skipped?: string;
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processDue(supabase: any, user: { id: string }): Promise<FollowUpDueResult> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('leads')
    .select('id, name, company, email, phone, sms_opt_out, lead_status, follow_up_due_at, follow_up_auto_text, follow_up_sms_body, follow_up_calendar_event_id, follow_up_sms_sent_at')
    .eq('user_id', user.id)
    .not('follow_up_due_at', 'is', null)
    .lte('follow_up_due_at', now)
    .limit(20);

  if (error) {
    if ((error.message || '').toLowerCase().includes('follow_up_due_at') || (error.message || '').toLowerCase().includes('schema cache')) {
      return { processed: 0, skipped: 'schema' };
    }
    return { processed: 0, error: error.message };
  }

  const due = (rows || []) as DueLead[];
  if (due.length === 0) return { processed: 0 };

  let calendar = 0;
  let texts = 0;

  for (const lead of due) {
    if (!lead.follow_up_calendar_event_id) {
      const dueDate = new Date(lead.follow_up_due_at);
      const callback = !lead.follow_up_auto_text;
      const schedule = callback ? atTimePingSchedule(dueDate) : null;
      const insertFull = {
        user_id: user.id,
        date: localDateKey(dueDate),
        title: callback ? callbackTitle(lead) : followUpTitle(lead),
        notes: lead.follow_up_auto_text ? 'Auto-text when this follow-up is due.' : 'Call this lead back.',
        color: callback ? 'amber' : 'red',
        alert_enabled: Boolean(schedule),
        alert_sent: false,
        alert_at: schedule ? earliestPingAt(schedule) : null,
        alert_phone: schedule ? encodePingSchedule(schedule) : null,
        alert_schedule: schedule,
        start_time: localTimeHm(dueDate),
        lead_id: lead.id,
        type: callback ? 'callback' : 'follow_up',
      };
      let eventId: string | null = null;
      const first = await supabase.from('calendar_events').insert(insertFull).select('id').single();
      if (!first.error && first.data?.id) {
        eventId = first.data.id;
      } else {
        const { lead_id: _l, type: _t, ...insertBase } = insertFull;
        const row = first.error && /alert_schedule/i.test(first.error.message || '')
          ? (() => { const { alert_schedule: _s, ...rest } = insertBase; return rest; })()
          : insertBase;
        const retry = await supabase.from('calendar_events').insert(row).select('id').single();
        if (!retry.error && retry.data?.id) eventId = retry.data.id;
      }
      if (eventId) {
        await supabase
          .from('leads')
          .update({ follow_up_calendar_event_id: eventId })
          .eq('id', lead.id)
          .eq('user_id', user.id);
        calendar++;
      }
    }

    const shouldText = !!lead.follow_up_auto_text && !lead.follow_up_sms_sent_at && !!lead.follow_up_sms_body?.trim();
    if (!shouldText) continue;
    if (!lead.phone || await smsSendBlockReason(supabase, lead)) {
      await supabase
        .from('leads')
        .update({ follow_up_sms_sent_at: now, follow_up_auto_text: false })
        .eq('id', lead.id)
        .eq('user_id', user.id);
      continue;
    }

    const creds = await getTwilioCreds(supabase, user.id);
    if (!creds) continue;

    const body = renderFollowUpSms(lead.follow_up_sms_body || '', lead);
    if (!body) continue;

    const { data: claimed } = await supabase
      .from('leads')
      .update({ follow_up_sms_sent_at: now })
      .eq('id', lead.id)
      .eq('user_id', user.id)
      .is('follow_up_sms_sent_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      const sent = await sendTwilioSms(creds, lead.phone, body);
      await applySmsOptOutFromFailure(supabase, {
        userId: user.id,
        phone: lead.phone,
        leadId: lead.id,
        error: sent.error,
      });
      await recordOutboundInboxSms(supabase, {
        userId: user.id,
        leadId: lead.id,
        toPhone: lead.phone,
        body,
        twilioSid: sent.sid,
        status: sent.status === 'failed' ? 'failed' : 'sent',
        errorMessage: sent.error ?? null,
        sentBy: 'system',
      });
      await supabase
        .from('leads')
        .update({
          follow_up_auto_text: false,
          last_contact: now,
        })
        .eq('id', lead.id)
        .eq('user_id', user.id);
      texts++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SMS failed';
      console.error('[follow-up due] sms', lead.id, err);
      await applySmsOptOutFromFailure(supabase, {
        userId: user.id,
        phone: lead.phone,
        leadId: lead.id,
        error: message,
      });
      if (!isTwilioOptOutError(null, message)) {
        await supabase
          .from('leads')
          .update({ follow_up_sms_sent_at: null })
          .eq('id', lead.id)
          .eq('user_id', user.id);
      }
    }
  }

  let pings = 0;
  try {
    pings = await fireDueCalendarPings(supabase, user.id);
  } catch (err) {
    console.error('[follow-up due] calendar ping', err);
  }

  return { processed: due.length, calendar, texts, pings };
}
