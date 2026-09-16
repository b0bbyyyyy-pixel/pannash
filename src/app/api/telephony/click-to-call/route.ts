/**
 * POST /api/telephony/click-to-call
 *
 * Two modes:
 *   { leadId }  — call a CRM lead (full eligibility gate: DNC, window, caps)
 *   { phone }   — manual dial to ANY number (DNC list still enforced;
 *                 window/caps skipped — you're deliberately dialing)
 *
 * Agent-first SIP flow either way:
 *   1. Create a dialer_calls row
 *   2. Ring the owner's SIP desk phone (Twilio)
 *   3. When the desk phone answers, the /voice webhook dials the target
 *
 * Dry-run mode (telephony_settings.dry_run = true, the default):
 * logs the would-be From/To/SIP on the call row without calling Twilio.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { toE164, isValidE164, formatDisplay } from '@/lib/dialer/e164';
import { isWithinDialingHours, attemptsExceeded, todayInTz } from '@/lib/dialer/canDial';
import { getTwilioCreds, getTelephonySettings } from '@/lib/telephony/twilio';
import { makeProvider } from '@/lib/telephony/provider';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId, phone } = await req.json();
    if (!leadId && !phone) {
      return NextResponse.json({ error: 'leadId or phone required' }, { status: 400 });
    }

    const settings = await getTelephonySettings(supabase, user.id);

    // ── Resolve the target number (lead mode vs manual mode) ─────────────────
    let toNumber: string | null = null;
    let leadRow: {
      id: string; name: string; timezone: string | null;
      attempts_today: number | null; attempts_today_on: string | null;
    } | null = null;

    if (leadId) {
      const { data: lead, error: leadErr } = await supabase
        .from('leads')
        .select('id, name, phone, phone_e164, timezone, dnc, dialer_status, attempts_today, attempts_today_on')
        .eq('id', leadId)
        .eq('user_id', user.id)
        .single();

      if (leadErr || !lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      toNumber = lead.phone_e164 || toE164(lead.phone);
      if (!isValidE164(toNumber)) {
        return NextResponse.json({ error: 'Lead has no valid phone number' }, { status: 422 });
      }

      // Lead-mode eligibility gate
      if (lead.dnc || ['bad_number', 'do_not_contact'].includes(lead.dialer_status ?? '')) {
        return NextResponse.json({ error: 'Lead is DNC / bad number' }, { status: 422 });
      }
      if (!isWithinDialingHours(lead.timezone, settings.calling_window_start, settings.calling_window_end)) {
        return NextResponse.json({ error: 'Outside calling window for this lead\u2019s timezone' }, { status: 422 });
      }
      if (attemptsExceeded(lead.attempts_today, lead.attempts_today_on, lead.timezone, settings.max_attempts_per_day)) {
        return NextResponse.json({ error: 'Daily attempt cap reached for this lead' }, { status: 422 });
      }

      leadRow = lead;
    } else {
      // Manual dial — any number, normalized to E.164
      toNumber = toE164(String(phone));
      if (!isValidE164(toNumber)) {
        return NextResponse.json({ error: 'Not a valid phone number' }, { status: 422 });
      }
    }

    // ── Number-level DNC (enforced in BOTH modes) ─────────────────────────────
    const { data: dncHit } = await supabase
      .from('dnc_numbers')
      .select('id')
      .eq('user_id', user.id)
      .eq('e164', toNumber)
      .maybeSingle();
    if (dncHit) {
      return NextResponse.json({ error: 'Number is on your DNC list' }, { status: 422 });
    }

    // ── Twilio creds ──────────────────────────────────────────────────────────
    const creds = await getTwilioCreds(supabase, user.id);
    if (!creds) {
      return NextResponse.json({ error: 'No Twilio connection. Connect Twilio in Settings \u2192 Phone.' }, { status: 400 });
    }
    if (!settings.dry_run && !settings.sip_uri) {
      return NextResponse.json({ error: 'No SIP URI configured. Set your desk phone SIP URI in Settings \u2192 Phone.' }, { status: 400 });
    }

    // ── Create the call row ───────────────────────────────────────────────────
    const { data: callRow, error: callErr } = await supabase
      .from('dialer_calls')
      .insert({
        lead_id: leadRow?.id ?? null,
        agent_id: user.id,
        lead_name: leadRow?.name ?? formatDisplay(toNumber!),
        to_number: toNumber,
        from_number: creds.fromNumber,
        direction: 'outbound',
        status: settings.dry_run ? 'dry_run' : 'created',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (callErr || !callRow) {
      console.error('[click-to-call] insert call row:', callErr);
      return NextResponse.json({ error: 'Failed to create call record' }, { status: 500 });
    }

    // ── Increment attempt counter (lead mode only) ────────────────────────────
    if (leadRow) {
      const today = todayInTz(leadRow.timezone);
      const currentCount = leadRow.attempts_today_on === today ? (leadRow.attempts_today ?? 0) : 0;
      await supabase
        .from('leads')
        .update({
          attempts_today: currentCount + 1,
          attempts_today_on: today,
          last_called_at: new Date().toISOString(),
        })
        .eq('id', leadRow.id)
        .eq('user_id', user.id);
    }

    // ── Dry run: log and stop ─────────────────────────────────────────────────
    if (settings.dry_run) {
      console.log('[click-to-call DRY RUN]', {
        callId: callRow.id,
        sip: settings.sip_uri || '(not set)',
        from: creds.fromNumber,
        to: toNumber,
      });
      return NextResponse.json({
        callId: callRow.id,
        dryRun: true,
        wouldDial: { sip: settings.sip_uri, from: creds.fromNumber, to: toNumber },
      });
    }

    // ── Live: ring the desk phone (agent leg) ─────────────────────────────────
    try {
      const provider = makeProvider(creds);
      const { providerCallSid } = await provider.originateAgentLeg({
        callId: callRow.id,
        sipUri: settings.sip_uri!,
        leadNumber: toNumber!,
        fromNumber: creds.fromNumber,
      });

      await supabase
        .from('dialer_calls')
        .update({ twilio_call_sid: providerCallSid, status: 'ringing_agent' })
        .eq('id', callRow.id);

      return NextResponse.json({ callId: callRow.id, twilioCallSid: providerCallSid, dryRun: false });
    } catch (twilioErr) {
      console.error('[click-to-call] Twilio originate failed:', twilioErr);
      await supabase
        .from('dialer_calls')
        .update({ status: 'failed', ended_at: new Date().toISOString() })
        .eq('id', callRow.id);
      const msg = twilioErr instanceof Error ? twilioErr.message : 'Twilio call failed';
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch (err) {
    console.error('[click-to-call POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
