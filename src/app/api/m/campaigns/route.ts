import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { notifyUserAlert } from '@/lib/notify/userAlert';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CAP = 50;

function last10(raw: string) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

function renderTemplate(tpl: string, lead: { name?: string | null; company?: string | null }) {
  const firstName = (lead.name ?? '').trim().split(/\s+/)[0] ?? '';
  return tpl
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{company\}/gi, (lead.company ?? '').trim())
    .replace(/ {2,}/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const payload = await req.json().catch(() => ({}));
  if (payload.confirm !== 'SEND') {
    return NextResponse.json({ error: 'Type SEND to confirm.' }, { status: 400 });
  }

  const listId = String(payload.listId ?? '');
  if (!listId) return NextResponse.json({ error: 'listId required' }, { status: 400 });

  let text = String(payload.body ?? '').trim();
  if (payload.templateId) {
    const { data: tpl } = await supabase
      .from('text_templates')
      .select('body')
      .eq('id', payload.templateId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (tpl?.body) text = tpl.body.trim();
  }
  if (!text) return NextResponse.json({ error: 'A message or template is required' }, { status: 400 });

  const { data: list } = await supabase
    .from('lead_lists')
    .select('id, name')
    .eq('id', listId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, name, company, phone, sms_opt_out')
    .eq('user_id', user.id)
    .eq('list_id', listId)
    .not('phone', 'is', null)
    .not('phone', 'eq', '');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set<string>();
  const targets = [];
  for (const lead of leads ?? []) {
    if (lead.sms_opt_out || !lead.phone) continue;
    const key = last10(lead.phone);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    targets.push(lead);
  }

  if (targets.length > CAP) {
    return NextResponse.json({
      error: `This list has ${targets.length} numbers. Mobile send is capped at ${CAP}.`,
    }, { status: 400 });
  }

  const creds = await getTwilioCreds(supabase, user.id);
  if (!creds) {
    return NextResponse.json({ error: 'No Twilio connection.' }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  let streak = 0;
  let stopped = false;
  for (const lead of targets) {
    const body = renderTemplate(text, lead);
    try {
      const result = await sendTwilioSms(creds, lead.phone, body);
      await recordOutboundInboxSms(supabase, {
        userId: user.id,
        leadId: lead.id,
        toPhone: lead.phone,
        body,
        twilioSid: result.sid,
        status: result.status,
        errorMessage: result.error ?? null,
        sentBy: 'user',
        bumpLastMessageAt: false,
      });
      if (result.status === 'failed') {
        failed += 1;
        streak += 1;
      } else {
        sent += 1;
        streak = 0;
      }
    } catch (err) {
      failed += 1;
      streak += 1;
      await recordOutboundInboxSms(supabase, {
        userId: user.id,
        leadId: lead.id,
        toPhone: lead.phone,
        body,
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Twilio error',
        sentBy: 'user',
        bumpLastMessageAt: false,
      });
    }
    if (streak >= 3) {
      stopped = true;
      const remaining = targets.length - sent - failed;
      await notifyUserAlert(supabase, {
        userId: user.id,
        email: user.email,
        title: 'Campaign paused',
        body: `${list.name || 'SMS campaign'} stopped after 3 failed texts in a row.${remaining > 0 ? ` ${remaining} not sent.` : ''}`,
        url: `/leads?list=${listId}`,
        tag: `m-campaign-pause-${listId}`,
      });
      break;
    }
  }

  return NextResponse.json({ sent, failed, total: targets.length, stopped });
}
