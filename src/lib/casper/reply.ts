import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { canCasperAutoReply } from '@/lib/casper/allow';
import {
  DEFAULT_CASPER_SYSTEM_PROMPT,
  mergeCapabilities,
  type CasperPhase,
} from '@/lib/casper/defaults';
import { emailApplicationToLead } from '@/lib/casper/emailApplication';
import { logCasperRun, upsertCasperLeadState } from '@/lib/casper/runs';
import { recordOutboundInboxSms } from '@/lib/inbox/recordOutboundSms';
import { sendTwilioSms } from '@/lib/telephony/sms';
import { getTwilioCreds } from '@/lib/telephony/twilio';

type MissionJson = {
  thinking?: string;
  sms?: string;
  email_application?: boolean;
  phase?: CasperPhase;
  needs_human?: boolean;
  human_reason?: string;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function humanDelayMs(text: string) {
  return Math.min(12_000, Math.max(4_000, 2_800 + text.length * 42));
}

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
  return { sms: text.slice(0, 320), thinking: 'plain-text fallback' };
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
      casper_enabled?: boolean | null;
      sms_opt_out?: boolean | null;
    };
    body: string;
    from: string;
    to: string;
    delay?: boolean;
  },
): Promise<{ replied: boolean; reason?: string }> {
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
    .select('phase, paused_reason, updated_at')
    .eq('lead_id', args.lead.id)
    .maybeSingle();

  if ((state?.paused_reason === 'replying' || state?.paused_reason === 'thinking') && state.updated_at) {
    const age = Date.now() - new Date(state.updated_at).getTime();
    if (age < 45_000) return { replied: false, reason: 'already_running' };
  }

  const gate = canCasperAutoReply({
    globalEnabled: !!settings?.casper_enabled,
    leadCasperEnabled: args.lead.casper_enabled,
    smsOptOut: args.lead.sms_opt_out,
    capabilities: settings?.casper_capabilities,
    phase: state?.phase,
    pausedReason: state?.paused_reason,
  });
  if (!gate.ok) {
    return { replied: false, reason: gate.reason };
  }

  const caps = mergeCapabilities(settings?.casper_capabilities);
  const brain = (settings?.casper_system_prompt || '').trim() || DEFAULT_CASPER_SYSTEM_PROMPT;

  const { data: thread } = await supabase
    .from('inbox_messages')
    .select('direction, body, created_at, sent_by')
    .eq('lead_id', args.lead.id)
    .order('created_at', { ascending: false })
    .limit(12);

  const lastIn = (thread ?? []).find((m: { direction: string }) => m.direction === 'inbound');
  const lastOut = (thread ?? []).find((m: { direction: string }) => m.direction === 'outbound');
  if (lastIn && lastOut && new Date(lastOut.created_at).getTime() >= new Date(lastIn.created_at).getTime()) {
    return { replied: false, reason: 'already_replied' };
  }

  await upsertCasperLeadState(supabase, {
    leadId: args.lead.id,
    userId: args.userId,
    phase: state?.phase || 'chatting',
    pausedReason: 'thinking',
  });

  const history = (thread ?? []).slice().reverse()
    .map((m: { direction: string; body: string }) => `${m.direction === 'outbound' ? 'You' : 'Lead'}: ${m.body}`)
    .join('\n');

  let parsed: MissionJson = {};
  try {
    const openai = getAIClient();
    const completion = await openai.chat.completions.create({
      model: GROK_MINI_MODEL,
      messages: [
        { role: 'system', content: brain },
        {
          role: 'user',
          content: `Lead: ${args.lead.name || 'Unknown'} | Company: ${args.lead.company || 'n/a'} | Email: ${args.lead.email || 'none'} | Phone: ${args.lead.phone || args.from}
Phase: ${state?.phase || 'chatting'}
Mission: ${settings?.casper_mission || 'collect_app_and_banks'}
Capabilities: chat_sms=${caps.chat_sms} email_application=${caps.email_application} (waterfall/propose/upload are off)

Thread:
${history || '(no prior thread)'}

Lead just texted: "${args.body}"`,
        },
      ],
      temperature: 0.6,
      max_tokens: 400,
    });
    parsed = parseMission(completion.choices[0]?.message?.content);
  } catch (err) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'error',
      error: err instanceof Error ? err.message : 'AI error',
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

  const actions: unknown[] = [];
  let sms = (parsed.sms || '').trim().slice(0, 480);
  if (!sms) sms = 'Thanks — can you send the completed application and last 3–6 months of bank statements when you get a chance?';

  if (parsed.email_application && caps.email_application) {
    try {
      const emailed = await emailApplicationToLead(supabase, { userId: args.userId, lead: args.lead });
      actions.push({ type: 'email_application', ...emailed });
      if (emailed.sent) {
        sms = sms || `Just emailed the application to ${args.lead.email}. Reply with the completed form and recent bank statements.`;
      } else if (emailed.error?.startsWith('Missing')) {
        sms = `I can email the application once we have a bit more on file (${emailed.error.replace('Missing application fields: ', '')}). Robert can also send it — want me to have him reach out?`;
      } else if (emailed.error === 'Lead has no email') {
        sms = 'Happy to email the application — what email should I send it to?';
      } else {
        sms = 'I can have Robert email the application shortly. In the meantime, last 3–6 months of bank statements help a lot.';
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
  }

  if (args.delay !== false) {
    await upsertCasperLeadState(supabase, {
      leadId: args.lead.id,
      userId: args.userId,
      phase: state?.phase || 'chatting',
      pausedReason: 'replying',
    });
    await sleep(humanDelayMs(sms));
  }

  const creds = await getTwilioCreds(supabase, args.userId);
  if (!creds) {
    await logCasperRun(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      trigger: 'inbound_sms',
      status: 'error',
      thinking: parsed.thinking,
      actions,
      error: 'No Twilio connection',
      inputSummary: args.body.slice(0, 200),
      outputSummary: sms,
      model: GROK_MINI_MODEL,
    });
    return { replied: false, reason: 'no_twilio' };
  }

  let sid: string | null = null;
  let sendStatus: 'sent' | 'failed' = 'sent';
  let sendError: string | null = null;
  try {
    const sent = await sendTwilioSms(creds, args.from || args.lead.phone || '', sms);
    sid = sent.sid;
    if (sent.status === 'failed') {
      sendStatus = 'failed';
      sendError = sent.error ?? 'Send failed';
    }
  } catch (err) {
    sendStatus = 'failed';
    sendError = err instanceof Error ? err.message : 'Send failed';
  }

  await recordOutboundInboxSms(supabase, {
    userId: args.userId,
    leadId: args.lead.id,
    toPhone: args.from || args.lead.phone,
    body: sms,
    twilioSid: sid,
    status: sendStatus,
    errorMessage: sendError,
    sentBy: 'calvin',
  });
  actions.push({ type: 'sms', sid, status: sendStatus, error: sendError });

  const phase: CasperPhase = parsed.needs_human
    ? 'handed_off'
    : (parsed.phase && ['chatting', 'awaiting_app', 'awaiting_banks', 'handed_off'].includes(parsed.phase)
      ? parsed.phase
      : ((state?.phase as CasperPhase) || 'chatting'));

  const runId = await logCasperRun(supabase, {
    userId: args.userId,
    leadId: args.lead.id,
    trigger: 'inbound_sms',
    status: sendStatus === 'failed' ? 'error' : 'ok',
    thinking: parsed.thinking,
    actions,
    model: GROK_MINI_MODEL,
    inputSummary: args.body.slice(0, 240),
    outputSummary: sms,
    error: sendError,
  });

  await upsertCasperLeadState(supabase, {
    leadId: args.lead.id,
    userId: args.userId,
    phase,
    lastRunId: runId,
    pausedReason: phase === 'handed_off' ? (parsed.human_reason || 'handed_off') : null,
  });

  return { replied: sendStatus !== 'failed', reason: sendError || undefined };
}
