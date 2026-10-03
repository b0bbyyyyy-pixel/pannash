import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { followUpTitle, localDateKey, localTimeHm, renderFollowUpSms } from '@/lib/lead-follow-up';
import { fireDueCalendarPings } from '@/lib/casper/calendarPing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      return NextResponse.json({ processed: 0, skipped: 'schema' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (rows || []) as DueLead[];
  if (due.length === 0) return NextResponse.json({ processed: 0 });

  let calendar = 0;
  let texts = 0;

  for (const lead of due) {
    if (!lead.follow_up_calendar_event_id) {
      const dueDate = new Date(lead.follow_up_due_at);
      const insertFull = {
        user_id: user.id,
        date: localDateKey(dueDate),
        title: followUpTitle(lead),
        notes: lead.follow_up_auto_text ? 'Auto-text when this follow-up is due.' : 'Follow-up from lead card.',
        color: 'red',
        alert_enabled: false,
        alert_sent: false,
        start_time: localTimeHm(dueDate),
        lead_id: lead.id,
        type: 'follow_up',
      };
      let eventId: string | null = null;
      const first = await supabase.from('calendar_events').insert(insertFull).select('id').single();
      if (!first.error && first.data?.id) {
        eventId = first.data.id;
      } else {
        const { lead_id: _l, type: _t, ...insertBase } = insertFull;
        const retry = await supabase.from('calendar_events').insert(insertBase).select('id').single();
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
    if (lead.sms_opt_out || String(lead.lead_status || '') === 'DNC' || !lead.phone) {
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
      console.error('[follow-up due] sms', lead.id, err);
      await supabase
        .from('leads')
        .update({ follow_up_sms_sent_at: null })
        .eq('id', lead.id)
        .eq('user_id', user.id);
    }
  }

  let pings = 0;
  try {
    pings = await fireDueCalendarPings(supabase, user.id);
  } catch (err) {
    console.error('[follow-up due] calendar ping', err);
  }

  return NextResponse.json({ processed: due.length, calendar, texts, pings });
}
