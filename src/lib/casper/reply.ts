import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { canCasperAutoReply } from '@/lib/casper/allow';
import { applyBusinessName } from '@/lib/casper/businessName';
import { buildLeadContext, maskPhones } from '@/lib/casper/context';
import {
  composeCasperSystemPrompt,
  resolveSavedCasperPrompt,
  STOPPED_PHASES,
  mergeCapabilities,
  parseReplyDelay,
  type CasperPhase,
} from '@/lib/casper/defaults';
import { emailApplicationToLead } from '@/lib/casper/emailApplication';
import { leadInAiFullPacks } from '@/lib/casper/fullPacks';
import { extractEmailFromSms, runUpdateLeadEmailTool } from '@/lib/casper/updateLeadEmail';
import { cancelPendingOutbox, enqueueCasperOutbox, getPendingOutboxForLead, kickOutboxPump, outboxDelayMs } from '@/lib/casper/outbox';
import { checkCasperSms, lastGuardLine, railActionRows } from '@/lib/casper/rails';
import { logCasperRun, upsertCasperLeadState } from '@/lib/casper/runs';
import { CASPER_SENT_BY } from '@/lib/casper/sender';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { sendCasperPing } from '@/lib/casper/ping';
import { casperSmsToSend, isClearSmsDecline, isUnsendableCasperSms } from '@/lib/casper/smsGuard';
import { applySmsOptOutFromFailure, isSmsStopBody } from '@/lib/leads/dnc';

export { humanDelayMs, outboxDelayMs } from '@/lib/casper/outbox';

type MissionJson = {
  thinking?: string;
  reasoning?: string;
  plan_note?: string;
  sms?: string;
  update_lead_email?: boolean;
  email_application?: boolean;
  phase?: CasperPhase;
  needs_human?: boolean;
  human_reason?: string;
};

function parseMission(raw: string | null | undefined): MissionJson {
  const text = (raw ?? '').trim();
  if (!text) return {};
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as MissionJson;
    } catch {
      // fall through
    }
  }
  const fallback = text.slice(0, 320);
  if (isUnsendableCasperSms(fallback)) return { sms: '', thinking: 'plain-text fallback' };
  return { sms: fallback, thinking: 'plain-text fallback' };
}

function clipPlan(note: string | null | undefined, fallback?: string | null) {
  const t = String(note ?? '').trim() || String(fallback ?? '').trim();
  return t ? t.slice(0, 400) : null;
}

function snapshotOf(text: string) {
  return maskPhones(text).slice(0, 4000);
}

function isPausedPhase(phase?: string | null, pausedReason?: string | null) {
  const p = (phase || 'chatting') as CasperPhase;
  const reason = String(pausedReason || '');
  const transient = reason === 'thinking' || reason === 'replying';
  if (STOPPED_PHASES.includes(p)) return reason || p;
  if (reason && !transient) return reason;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runCasperInboundSms(
  supabase: any,
  args: {
    userId: string;
    lead: {
      id: string;
      user_id?: string;
      name?: string | null;
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      list_id?: string | null;
      casper_enabled?: boolean | null;
      sms_opt_out?: boolean | null;
    };
    body: string;
    from: string;
    to: string;
    delay?: boolean;
    burstStartedAt?: string | null;
    lockToken?: string | null;
  },
): Promise<{ replied: boolean; reason?: string; body?: string; send_at?: string }> {
  let { data: settings } = await supabase
    .from('user_settings')
    .select('casper_enabled, casper_system_prompt, casper_capabilities, casper_mission')
    .eq('user_id', args.userId)
    .maybeSingle();
  if (!settings) {
    const fallback = await supabase
      .from('user_settings')
      .select('casper_enabled')
      .eq('user_id', args.userId)
      .maybeSingle();
    settings = fallback.data;
  }

  const { data: state } = await supabase
    .from('casper_lead_state')
    .select('phase, paused_reason, updated_at, plan_note')
    .eq('lead_id', args.lead.id)
    .maybeSingle();

  const paused = isPausedPhase(state?.phase, state?.paused_reason);
  if (paused) {
    const result = `blocked: paused (${paused})`;
    const rails = [{ ok: false as const, result }];
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      error: result,
      actions: [{ type: 'rail', result }],
      guardResults: rails,
      inputSummary: args.body.slice(0, 200),
    });
    await upsertCasperLeadState(supabase, {
      leadId: args.lead.id,
      userId: args.userId,
      phase: (state?.phase as CasperPhase) || 'chatting',
      lastGuardResult: result,
    });
    await cancelPendingOutbox(supabase, { leadId: args.lead.id, userId: args.userId, reason: 'paused' });
    return { replied: false, reason: result };
  }

  if (!args.lockToken && state?.paused_reason === 'thinking' && state.updated_at) {
    const age = Date.now() - new Date(state.updated_at).getTime();
    if (age < 20_000) {
      const { data: lastInNow } = await supabase
        .from('inbox_messages')
        .select('created_at')
        .eq('lead_id', args.lead.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const inboundAt = lastInNow?.created_at ? new Date(lastInNow.created_at).getTime() : 0;
      if (inboundAt && inboundAt <= new Date(state.updated_at).getTime() + 500) {
        return { replied: false, reason: 'already_running' };
      }
    }
  }

  const gate = canCasperAutoReply({
    globalEnabled: !!settings?.casper_enabled,
    leadCasperEnabled: args.lead.casper_enabled,
    smsOptOut: args.lead.sms_opt_out,
    capabilities: settings?.casper_capabilities,
    phase: state?.phase || 'chatting',
    pausedReason: state?.paused_reason ?? null,
  });
  if (!gate.ok) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      error: gate.reason,
      inputSummary: args.body.slice(0, 200),
    });
    return { replied: false, reason: gate.reason };
  }

  if (isSmsStopBody(args.body)) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      error: 'blocked: opt_out',
      actions: [{ type: 'rail', result: 'blocked: opt_out' }],
      inputSummary: args.body.slice(0, 200),
    });
    return { replied: false, reason: 'opt_out' };
  }

  if (await leadInAiFullPacks(supabase, { userId: args.userId, leadId: args.lead.id, listId: args.lead.list_id })) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      error: 'ai_full_packs',
      inputSummary: args.body.slice(0, 200),
    });
    return { replied: false, reason: 'ai_full_packs' };
  }

  const caps = mergeCapabilities(settings?.casper_capabilities);
  const ctx = await buildLeadContext(supabase, { userId: args.userId, leadId: args.lead.id });
  const savedPrompt = resolveSavedCasperPrompt(settings?.casper_system_prompt);
  if (savedPrompt.upgraded) {
    try {
      await supabase
        .from('user_settings')
        .update({ casper_system_prompt: savedPrompt.prompt, updated_at: new Date().toISOString() })
        .eq('user_id', args.userId);
    } catch {
      // keep going with the upgraded in-memory prompt
    }
  }
  const brain = applyBusinessName(
    composeCasperSystemPrompt(savedPrompt.prompt),
    ctx.facts.businessName || '{business_name}',
  );

  const { data: thread } = await supabase
    .from('inbox_messages')
    .select('direction, body, created_at, sent_by')
    .eq('lead_id', args.lead.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const latest = (thread ?? [])[0] as { direction?: string } | undefined;
  if (latest?.direction === 'outbound') {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      error: 'already_replied',
      stage: ctx.stage,
      contextSnapshot: snapshotOf(ctx.text),
      inputSummary: args.body.slice(0, 200),
    });
    return { replied: false, reason: 'already_replied' };
  }

  const lastInboundAt = (thread ?? []).find((m: { direction: string }) => m.direction === 'inbound')?.created_at;
  const existing = await getPendingOutboxForLead(supabase, { userId: args.userId, leadId: args.lead.id });
  if (existing) {
    const inboundMs = lastInboundAt ? new Date(lastInboundAt).getTime() : 0;
    const queuedMs = new Date(existing.created_at).getTime();
    if (!inboundMs || inboundMs <= queuedMs + 2000) {
      return {
        replied: true,
        reason: 'scheduled',
        body: existing.body,
        send_at: existing.send_at,
      };
    }
  }

  await cancelPendingOutbox(supabase, { leadId: args.lead.id, userId: args.userId });

  if (isClearSmsDecline(args.body)) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      thinking: 'Lead declined — no SMS sent',
      error: 'declined_no_reply',
      stage: ctx.stage,
      planNote: 'Lead declined. Waiting for owner.',
      contextSnapshot: snapshotOf(ctx.text),
      inputSummary: args.body.slice(0, 200),
    });
    await upsertCasperLeadState(supabase, {
      leadId: args.lead.id,
      userId: args.userId,
      phase: 'handed_off',
      pausedReason: 'declined',
      planNote: 'Lead declined. Waiting for owner.',
    });
    return { replied: false, reason: 'declined' };
  }

  await upsertCasperLeadState(supabase, {
    leadId: args.lead.id,
    userId: args.userId,
    phase: state?.phase || 'chatting',
    pausedReason: 'thinking',
  });

  let parsed: MissionJson = {};
  try {
    const openai = getAIClient();
    const completion = await openai.chat.completions.create({
      model: GROK_MINI_MODEL,
      messages: [
        { role: 'system', content: brain },
        {
          role: 'user',
          content: `Mission: ${settings?.casper_mission || 'collect_app_and_banks'}
Capabilities: chat_sms=${caps.chat_sms} email_application=${caps.email_application} update_lead_email=${caps.update_lead_email} (waterfall/propose/upload are off)

${ctx.text}

Lead just texted: "${args.body}"
If they sent more than one text since your last reply, cover all of them in a single SMS. Do not write a separate reply per message.
If they declined or a reply would only be an internal note, set "sms" to "". Empty sms sends nothing. Never text "no reply needed" or thinking.
Never say "working capital". You represent the business name in STAGE.`,
        },
      ],
      temperature: 0.6,
      max_tokens: 500,
    });
    parsed = parseMission(completion.choices[0]?.message?.content);
  } catch (err) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'error',
      error: err instanceof Error ? err.message : 'AI error',
      stage: ctx.stage,
      contextSnapshot: snapshotOf(ctx.text),
      inputSummary: args.body.slice(0, 200),
    });
    await upsertCasperLeadState(supabase, {
      leadId: args.lead.id,
      userId: args.userId,
      phase: state?.phase || 'chatting',
      pausedReason: null,
    });
    return { replied: false, reason: 'ai_error' };
  }

  const planNote = clipPlan(parsed.plan_note, parsed.reasoning || parsed.thinking || state?.plan_note);
  const thinking = [parsed.thinking, parsed.reasoning].filter(Boolean).join(' — ') || parsed.thinking;
  const actions: unknown[] = [];
  let sms = casperSmsToSend(String(parsed.sms ?? ''), parsed.thinking);

  let sentApplication = false;
  if (caps.update_lead_email) {
    const detected = extractEmailFromSms(args.body);
    if (parsed.update_lead_email || detected.email || detected.invalid) {
      try {
        const emailTool = await runUpdateLeadEmailTool(supabase, {
          userId: args.userId,
          lead: args.lead,
          body: args.body,
          sendApplication: caps.email_application,
        });
        actions.push(...emailTool.actions);
        sentApplication = !!emailTool.sentApplication;
        if (emailTool.needsHuman) {
          parsed.needs_human = true;
          parsed.human_reason = parsed.human_reason || emailTool.humanReason || 'Lead sent an email that looks invalid.';
        }
      } catch (err) {
        actions.push({
          type: 'update_lead_email',
          updated: false,
          error: err instanceof Error ? err.message : 'email tool failed',
        });
      }
    }
  } else if (parsed.update_lead_email) {
    actions.push({ type: 'update_lead_email', skipped: true, reason: 'capability_off' });
  }

  const biz = ctx.facts.businessName;
  if (parsed.email_application && caps.email_application && !sentApplication) {
    try {
      const emailed = await emailApplicationToLead(supabase, { userId: args.userId, lead: args.lead });
      actions.push({ type: 'email_application', ...emailed });
      if (emailed.sent) {
        sms = sms || `Just emailed the application to ${args.lead.email}. Reply with the completed form and recent bank statements.`;
      } else if (emailed.error?.startsWith('Missing')) {
        sms = `I can email the application once we have a bit more on file (${emailed.error.replace('Missing application fields: ', '')}). Want me to have someone from ${biz || 'our team'} reach out?`;
      } else if (emailed.error === 'Lead has no email') {
        sms = 'Happy to email the application — what email should I send it to?';
      } else {
        sms = `I can have ${biz || 'our team'} email the application shortly. In the meantime, last 3–6 months of bank statements help a lot.`;
      }
    } catch (err) {
      actions.push({ type: 'email_application', sent: false, error: err instanceof Error ? err.message : 'email failed' });
    }
  } else if (parsed.email_application && !caps.email_application) {
    actions.push({ type: 'email_application', skipped: true, reason: 'capability_off' });
  }

  if (parsed.needs_human) {
    actions.push({ type: 'needs_human', reason: parsed.human_reason || 'Lead asked for a person' });
    await supabase.from('agent_decisions').insert({
      user_id: args.userId,
      lead_id: args.lead.id,
      lead_name: args.lead.name || 'Lead',
      company: args.lead.company ?? null,
      type: 'casper_needs_human',
      status: 'pending',
      priority: 'urgent',
      proposal: parsed.human_reason || `${args.lead.name || 'Lead'} asked Casper for a human.`,
      metadata: { phase: parsed.phase || 'handed_off' },
    });
    const ping = await sendCasperPing(supabase, {
      userId: args.userId,
      kind: 'needs_human',
      body: `Casper: ${args.lead.name || 'A lead'} needs you. ${parsed.human_reason || 'They asked for a person.'}`.slice(0, 320),
    });
    actions.push({ type: 'ping', ...ping });
  }

  const phase: CasperPhase = parsed.needs_human
    ? 'handed_off'
    : (parsed.phase && ['chatting', 'awaiting_app', 'awaiting_banks', 'handed_off'].includes(parsed.phase)
      ? parsed.phase
      : ((state?.phase as CasperPhase) || 'chatting'));

  const persistPlan = async (runId?: string | null, guard?: string | null) => {
    await upsertCasperLeadState(supabase, {
      leadId: args.lead.id,
      userId: args.userId,
      phase,
      ...(runId !== undefined ? { lastRunId: runId } : {}),
      pausedReason: phase === 'handed_off' ? (parsed.human_reason || 'handed_off') : null,
      planNote,
      lastGuardResult: guard ?? null,
    });
  };

  if (!sms) {
    actions.push({ type: 'sms', skipped: true, reason: 'no_sms' });
    const runId = await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      thinking,
      actions,
      model: GROK_MINI_MODEL,
      inputSummary: args.body.slice(0, 240),
      error: 'no_sms',
      stage: ctx.stage,
      planNote,
      contextSnapshot: snapshotOf(ctx.text),
    });
    await persistPlan(runId, 'blocked: no_sms');
    return { replied: false, reason: 'no_sms' };
  }

  const toPhone = args.from || args.lead.phone || '';
  const rails = await checkCasperSms(supabase, {
    userId: args.userId,
    leadId: args.lead.id,
    toPhone,
    body: sms,
    initiatedBy: 'merchant_reply',
    thinking: parsed.thinking,
  });
  sms = rails.body;
  actions.push(...railActionRows(rails.results));
  const guardLine = lastGuardLine(rails.results);

  if (!rails.ok) {
    const runId = await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'ok',
      thinking,
      actions,
      model: GROK_MINI_MODEL,
      inputSummary: args.body.slice(0, 240),
      outputSummary: sms,
      error: rails.blocked,
      stage: rails.stage || ctx.stage,
      guardResults: rails.results,
      planNote,
      contextSnapshot: snapshotOf(ctx.text),
    });
    await persistPlan(runId, rails.blocked);
    return { replied: false, reason: rails.blocked || 'blocked' };
  }

  const creds = await getTwilioCreds(supabase, args.userId);
  if (!creds) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'error',
      thinking,
      actions,
      error: 'No Twilio connection',
      inputSummary: args.body.slice(0, 200),
      outputSummary: sms,
      model: GROK_MINI_MODEL,
      stage: ctx.stage,
      planNote,
      contextSnapshot: snapshotOf(ctx.text),
    });
    await persistPlan(null, 'blocked: no_twilio');
    return { replied: false, reason: 'no_twilio' };
  }

  const sendNow = async (fallbackReason?: string) => {
    const again = await checkCasperSms(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      toPhone,
      body: sms,
      initiatedBy: 'merchant_reply',
      thinking: parsed.thinking,
    });
    actions.push(...railActionRows(again.results));
    if (!again.ok) {
      const runId = await logCasperRun(supabase, {
        userId: args.userId,
        leadId: args.lead.id,
        trigger: 'inbound_sms',
        status: 'ok',
        thinking,
        actions,
        model: GROK_MINI_MODEL,
        inputSummary: args.body.slice(0, 240),
        outputSummary: again.body,
        error: again.blocked,
        stage: again.stage || ctx.stage,
        guardResults: again.results,
        planNote,
        contextSnapshot: snapshotOf(ctx.text),
      });
      await persistPlan(runId, again.blocked);
      return { replied: false, reason: again.blocked || 'blocked' };
    }
    sms = again.body;

    let sid: string | null = null;
    let sendStatus: 'sent' | 'failed' = 'sent';
    let sendError: string | null = null;
    try {
      const sent = await sendTwilioSms(creds, toPhone, sms);
      sid = sent.sid;
      if (sent.status === 'failed') {
        sendStatus = 'failed';
        sendError = sent.error ?? 'Send failed';
      }
    } catch (err) {
      sendStatus = 'failed';
      sendError = err instanceof Error ? err.message : 'Send failed';
    }
    await applySmsOptOutFromFailure(supabase, {
      userId: args.userId,
      phone: toPhone,
      leadId: args.lead.id,
      error: sendError,
    });

    await recordOutboundInboxSms(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      toPhone,
      body: sms,
      twilioSid: sid,
      status: sendStatus,
      errorMessage: sendError,
      sentBy: CASPER_SENT_BY,
    });
    actions.push({ type: 'sms', sid, status: sendStatus, error: sendError, fallback: fallbackReason || undefined });

    const runId = await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: sendStatus === 'failed' ? 'error' : 'ok',
      thinking,
      actions,
      model: GROK_MINI_MODEL,
      inputSummary: args.body.slice(0, 240),
      outputSummary: sms,
      error: sendError || fallbackReason || null,
      stage: ctx.stage,
      guardResults: again.results,
      planNote,
      contextSnapshot: snapshotOf(ctx.text),
    });

    await persistPlan(runId, lastGuardLine(again.results));
    return { replied: sendStatus !== 'failed', reason: sendError || fallbackReason || undefined };
  };

  if (args.delay === false) return sendNow();

  const delayRange = parseReplyDelay(settings?.casper_capabilities);
  const delayMs = outboxDelayMs(sms, delayRange);
  let sendAtMs = Date.now() + delayMs;
  if (args.burstStartedAt) {
    const burst = new Date(args.burstStartedAt).getTime();
    if (Number.isFinite(burst)) sendAtMs = Math.max(Date.now() + 2000, burst + delayMs);
  }
  if (rails.rescheduleTo) {
    const rs = new Date(rails.rescheduleTo).getTime();
    if (Number.isFinite(rs)) sendAtMs = Math.max(sendAtMs, rs);
  }
  const sendAt = new Date(sendAtMs).toISOString();

  const queued = await enqueueCasperOutbox(supabase, {
    userId: args.userId,
    leadId: args.lead.id,
    toPhone,
    body: sms,
    thinking: parsed.thinking,
    actions,
    phase,
    inputSummary: args.body.slice(0, 240),
    model: GROK_MINI_MODEL,
    sendAt,
    burstStartedAt: args.burstStartedAt,
  });

  if (!queued.id) {
    console.error('[casper] outbox enqueue failed — sending now');
    return sendNow('outbox_failed');
  }

  actions.push({ type: 'sms_scheduled', send_at: queued.sendAt, outbox_id: queued.id, replaced: queued.cancelled });
  kickOutboxPump(queued.id);

  const runId = await logCasperRun(supabase, {
    userId: args.userId,
    leadId: args.lead.id,
    trigger: 'inbound_sms',
    status: 'ok',
    thinking,
    actions,
    model: GROK_MINI_MODEL,
    inputSummary: args.body.slice(0, 240),
    outputSummary: sms,
    stage: ctx.stage,
    guardResults: rails.results,
    planNote,
    contextSnapshot: snapshotOf(ctx.text),
  });

  await upsertCasperLeadState(supabase, {
    leadId: args.lead.id,
    userId: args.userId,
    phase,
    lastRunId: runId,
    pausedReason: 'replying',
    planNote,
    lastGuardResult: guardLine,
  });

  return { replied: true, reason: 'scheduled', body: sms, send_at: queued.sendAt };
}
