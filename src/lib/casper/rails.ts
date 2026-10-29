import { casperEffectiveForLead } from '@/lib/casper/allow';
import { STOPPED_PHASES, parseSendWindow, type CasperPhase } from '@/lib/casper/defaults';
import { applyBusinessName, getBusinessName } from '@/lib/casper/businessName';
import { isCasperSender } from '@/lib/casper/sender';
import { dealStageFromLead, submittedLockoutResult, type DealStage } from '@/lib/casper/stage';
import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';
import { isSmsStopBody, smsSendBlockReason } from '@/lib/leads/dnc';
import { casperSmsToSend, isUnsendableCasperSms } from '@/lib/casper/smsGuard';
import { formatLocal, isInSendWindow, nextWindowStart, zoneForLocation } from '@/lib/smsDrip/timezones';
import { hydrateTzUd } from '@/lib/leads/listColumns';

export type RailOk = { ok: true };
export type RailBlocked = { ok: false; result: string };
export type RailOverridden = { ok: true; result: string };
export type RailResult = RailOk | RailBlocked | RailOverridden;
export type RailNoted = RailBlocked | RailOverridden;

export function isNotedRail(r: RailResult): r is RailNoted {
  return 'result' in r && typeof r.result === 'string' && r.result.length > 0;
}

export function railActionRows(results: RailResult[]) {
  return results.filter(isNotedRail).map(r => ({ type: 'rail' as const, result: r.result }));
}

export type CasperInitiatedBy = 'merchant_reply' | 'casper_proactive';

export type CheckCasperSmsArgs = {
  userId: string;
  leadId: string;
  toPhone: string;
  body: string;
  initiatedBy: CasperInitiatedBy;
  thinking?: string | null;
  skipDuplicate?: boolean;
  now?: Date;
};

export type CheckCasperSmsVerdict = {
  results: RailResult[];
  ok: boolean;
  blocked: string | null;
  body: string;
  rescheduleTo: string | null;
  stage: DealStage | null;
};

function ok(): RailOk {
  return { ok: true };
}

function blocked(reason: string): RailBlocked {
  const result = reason.startsWith('blocked:') ? reason : `blocked: ${reason}`;
  return { ok: false, result };
}

function overridden(reason: string): RailOverridden {
  const result = reason.startsWith('overridden:') ? reason : `overridden: ${reason}`;
  return { ok: true, result };
}

export function rewriteBannedPhrases(body: string): { body: string; hit: boolean } {
  const next = body.replace(/working\s+capital/gi, 'business funding');
  return { body: next, hit: next !== body };
}

function sameSmsBody(a: string, b: string) {
  return String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();
}

function cooldownHours() {
  const n = Number(process.env.CASPER_COOLDOWN_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function leadTz(
  ud: Record<string, unknown> | null | undefined,
  userTz: string | null | undefined,
) {
  const city = String(ud?.businessCity ?? ud?.city ?? '').trim();
  const state = String(ud?.businessState ?? ud?.state ?? '').trim();
  return zoneForLocation(city, state) ?? userTz ?? 'America/New_York';
}

export function formatGuardLocal(at: Date, tz: string) {
  return formatLocal(at, tz) || at.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkCasperSms(
  supabase: any,
  args: CheckCasperSmsArgs,
): Promise<CheckCasperSmsVerdict> {
  const results: RailResult[] = [];
  let body = args.body;
  let rescheduleTo: string | null = null;
  let stage: DealStage | null = null;

  const push = (r: RailResult) => { results.push(r); };

  const settingsP = supabase
    .from('user_settings')
    .select('casper_enabled, casper_capabilities, timezone')
    .eq('user_id', args.userId)
    .maybeSingle();
  let leadP = await supabase
    .from('leads')
    .select('id, list_id, casper_enabled, sms_opt_out, lead_status, in_pipeline, dnc, ud_businessState:underwriting_data->>businessState, ud_state:underwriting_data->>state, ud_businessCity:underwriting_data->>businessCity, ud_city:underwriting_data->>city')
    .eq('id', args.leadId)
    .maybeSingle();
  if (leadP.error || !leadP.data) {
    leadP = await supabase
      .from('leads')
      .select('id, list_id, casper_enabled, sms_opt_out, lead_status, in_pipeline, underwriting_data, dnc')
      .eq('id', args.leadId)
      .maybeSingle();
  } else {
    hydrateTzUd(leadP.data as Record<string, unknown>);
  }
  const [{ data: settings }, { data: lead }] = [await settingsP, leadP];

  let state: { phase?: string | null; paused_reason?: string | null } | null = null;
  try {
    const st = await supabase
      .from('casper_lead_state')
      .select('phase, paused_reason')
      .eq('lead_id', args.leadId)
      .maybeSingle();
    state = st.data;
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('casper_lead_state', err);
  }

  const { data: thread } = await supabase
    .from('inbox_messages')
    .select('direction, body, sent_by, created_at')
    .eq('lead_id', args.leadId)
    .order('created_at', { ascending: false })
    .limit(20);

  const newest = (thread ?? [])[0] as { direction?: string; body?: string; sent_by?: string; created_at?: string } | undefined;
  const lastInbound = (thread ?? []).find((m: { direction?: string }) => m.direction === 'inbound') as
    | { body?: string; created_at?: string } | undefined;

  // a. opt_out
  if (lead) {
    const opt = await smsSendBlockReason(supabase, lead);
    if (opt) push(blocked('opt_out'));
    else if (isSmsStopBody(lastInbound?.body) || isSmsStopBody(args.body)) push(blocked('opt_out'));
    else push(ok());
  } else {
    push(blocked('lead_missing'));
  }

  // b. toggle
  if (!casperEffectiveForLead(!!settings?.casper_enabled, lead?.casper_enabled)) {
    push(blocked('casper_off'));
  } else {
    push(ok());
  }

  // paused (addon A) — after toggle, no exceptions
  const phase = (state?.phase || 'chatting') as CasperPhase;
  const pausedReason = String(state?.paused_reason || '');
  const transient = pausedReason === 'thinking' || pausedReason === 'replying';
  if (STOPPED_PHASES.includes(phase) || (pausedReason && !transient)) {
    push(blocked(`paused (${pausedReason || phase})`));
  } else {
    push(ok());
  }

  // business name (blank = block; missing column = keep current behavior)
  const biz = await getBusinessName(supabase, args.userId);
  if (biz.columnPresent && !biz.name) push(blocked('business_name_missing'));
  else push(ok());

  // c. submitted_lockout
  let subs: { status?: string | null; created_at?: string | null }[] = [];
  try {
    const subRes = await supabase
      .from('lender_submissions')
      .select('status, created_at')
      .eq('lead_id', args.leadId)
      .order('created_at', { ascending: false })
      .limit(40);
    subs = subRes.data ?? [];
  } catch {
    subs = [];
  }
  const derived = dealStageFromLead(lead || {}, subs);
  stage = derived.stage;
  const newestIsInboundAfterSubmit = !!newest
    && newest.direction === 'inbound'
    && (!derived.submittedAt || new Date(newest.created_at || 0).getTime() > new Date(derived.submittedAt).getTime());
  const lock = submittedLockoutResult({
    stage: derived.stage,
    submittedAt: derived.submittedAt,
    newestInboundAfterSubmit: newestIsInboundAfterSubmit,
  });
  push(lock);

  // d. cooldown
  if (args.initiatedBy === 'merchant_reply') {
    if (newest && newest.direction !== 'inbound') {
      const who = isCasperSender(newest.sent_by) ? 'casper' : (newest.sent_by || 'user');
      const when = newest.created_at
        ? new Date(newest.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'unknown';
      push(blocked(`cooldown (already answered by ${who} at ${when})`));
    } else {
      push(ok());
    }
  } else {
    const hours = cooldownHours();
    const since = Date.now() - hours * 3600_000;
    const lastOut = (thread ?? []).find((m: { direction?: string }) => m.direction === 'outbound') as
      | { created_at?: string; sent_by?: string } | undefined;
    const unanswered = newest?.direction === 'outbound'
      && lastOut?.created_at
      && new Date(lastOut.created_at).getTime() >= since;
    if (unanswered) {
      push(blocked(`cooldown (unanswered outbound within ${hours}h)`));
    } else {
      const lastTwo = (thread ?? []).slice(0, 2) as Array<{ direction?: string; sent_by?: string }>;
      const twoCasper = lastTwo.length >= 2
        && lastTwo.every(m => m.direction === 'outbound' && isCasperSender(m.sent_by));
      if (twoCasper) push(blocked('cooldown (already 1 unanswered Casper text in a row)'));
      else push(ok());
    }
  }

  // e. quiet_hours
  const win = parseSendWindow(settings?.casper_capabilities);
  const tz = leadTz(
    (lead?.underwriting_data ?? {}) as Record<string, unknown>,
    settings?.timezone,
  );
  const now = args.now ?? new Date();
  const inWindow = isInSendWindow(tz, win.start, win.end, win.days, now);
  if (inWindow) {
    push(ok());
  } else if (args.initiatedBy === 'casper_proactive') {
    push(blocked('quiet_hours'));
  } else {
    const inboundAge = lastInbound?.created_at ? now.getTime() - new Date(lastInbound.created_at).getTime() : Infinity;
    if (inboundAge <= 30 * 60_000) {
      push(overridden('quiet_hours — merchant texted first'));
    } else {
      const next = nextWindowStart(tz, win.start, win.days, now);
      rescheduleTo = next.toISOString();
      push(overridden(`quiet_hours — rescheduled to ${formatGuardLocal(next, tz)}`));
    }
  }

  // f. banned_phrase
  const banned = rewriteBannedPhrases(body);
  body = banned.body;
  push(banned.hit ? overridden('banned_phrase') : ok());

  if (biz.name) body = applyBusinessName(body, biz.name);
  if (/\{[A-Za-z_][A-Za-z0-9_]*\}/.test(body)) push(blocked('placeholder_in_sms'));
  else push(ok());

  // g. unsendable / duplicate
  if (isUnsendableCasperSms(body, args.thinking) || !casperSmsToSend(body, args.thinking)) {
    push(blocked('no_sms'));
  } else if (!args.skipDuplicate) {
    const since = new Date(Date.now() - 180_000).toISOString();
    const { data: recent } = await supabase
      .from('inbox_messages')
      .select('body')
      .eq('lead_id', args.leadId)
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8);
    const dup = (recent ?? []).some((m: { body?: string }) => sameSmsBody(String(m.body || ''), body));
    push(dup ? blocked('duplicate_body') : ok());
  } else {
    push(ok());
  }

  const blockedRow = results.find((r): r is RailBlocked => r.ok === false);
  return {
    results,
    ok: !blockedRow,
    blocked: blockedRow?.result ?? null,
    body,
    rescheduleTo,
    stage,
  };
}

export function lastGuardLine(results: RailResult[]): string | null {
  const notable = [...results].reverse().find(isNotedRail);
  return notable?.result ?? null;
}
