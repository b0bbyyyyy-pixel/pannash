import { casperEffectiveForLead } from '@/lib/casper/allow';
import { parseSendWindow } from '@/lib/casper/defaults';
import { getBusinessName } from '@/lib/casper/businessName';
import { classifyDoc } from '@/lib/casper/docs';
import { isCasperSender } from '@/lib/casper/sender';
import { dealStageFromLead, type DealStage } from '@/lib/casper/stage';
import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';
import { languageLabel } from '@/lib/inbox/languageDisplay';
import { ensureLeadSmsLanguage } from '@/lib/inbox/language';
import { buildFundingApplication } from '@/lib/fundingApplication';
import { formatLocal, isInSendWindow, nextWindowStart, zoneForLocation } from '@/lib/smsDrip/timezones';

const FINANCIAL_KEYS = [
  'monthlyRevenue', 'timeInBusiness', 'creditScore', 'industry', 'requestedAmount',
] as const;

const DISPLAY_METRIC_KEYS = [
  'month1Revenue', 'month2Revenue', 'month3Revenue', 'month4Revenue',
  'avgDailyBalance', 'endingBalance', 'nsfCount', 'depositsCount',
] as const;

type AttachmentRow = {
  id?: string;
  file_name?: string | null;
  column_field?: string | null;
  created_at?: string | null;
};

function asUd(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function fmtMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtWhen(iso: string | null | undefined, tz: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-US', {
      timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

function previousCalendarMonthKey(at = new Date()) {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromName(name: string | null | undefined) {
  const m = String(name ?? '').match(/(20\d{2})[-_/ ]?(0[1-9]|1[0-2])/);
  if (!m) return '';
  return `${m[1]}-${m[2]}`;
}

export function bankAnalysisIsStale(
  ud: Record<string, unknown> | null | undefined,
  attachments: AttachmentRow[],
): boolean {
  const analysis = ud?.bankStatementAnalysis && typeof ud.bankStatementAnalysis === 'object'
    ? ud.bankStatementAnalysis as Record<string, unknown>
    : null;
  const analyzedAt = analysis?.analyzedAt ? new Date(String(analysis.analyzedAt)).getTime() : 0;
  const banks = attachments.filter(a => classifyDoc(a.file_name, a.column_field) === 'bank');
  if (!banks.length) return false;
  if (!analyzedAt) return true;
  return banks.some(a => a.created_at && new Date(a.created_at).getTime() > analyzedAt);
}

function threadLabel(m: { direction?: string; sent_by?: string | null }) {
  if (m.direction !== 'outbound') return 'MERCHANT';
  if (isCasperSender(m.sent_by)) return 'YOU (Casper)';
  if (m.sent_by === 'system') return 'SYSTEM';
  return 'ROBERT';
}

export function maskPhones(text: string) {
  return text.replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, (m) => {
    const d = m.replace(/\D/g, '');
    return `***${d.slice(-4)}`;
  });
}

export type LeadContext = {
  text: string;
  stage: DealStage;
  facts: {
    stage: DealStage;
    leadStatus: string;
    phase: string;
    enabled: boolean;
    tz: string;
    inWindow: boolean;
    businessName: string;
    lastGuard: string | null;
    planNote: string | null;
    smsLanguage: string | null;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildLeadContext(
  supabase: any,
  args: { userId: string; leadId: string },
): Promise<LeadContext> {
  const empty = (extra = ''): LeadContext => ({
    text: extra || '(context unavailable)',
    stage: 'NEW',
    facts: {
      stage: 'NEW', leadStatus: '', phase: 'chatting', enabled: false,
      tz: 'America/New_York', inWindow: true, businessName: '', lastGuard: null, planNote: null, smsLanguage: null,
    },
  });

  try {
    const [leadRes, settingsRes, stateRes, threadRes, filesRes, subsRes] = await Promise.all([
      supabase.from('leads').select('name, company, email, phone, lead_status, in_pipeline, list_id, casper_enabled, sms_opt_out, underwriting_data').eq('id', args.leadId).maybeSingle(),
      supabase.from('user_settings').select('casper_enabled, casper_capabilities, casper_mission, timezone').eq('user_id', args.userId).maybeSingle(),
      supabase.from('casper_lead_state').select('phase, paused_reason, plan_note, plan_updated_at, last_guard_result').eq('lead_id', args.leadId).maybeSingle(),
      supabase.from('inbox_messages').select('direction, body, sent_by, created_at').eq('lead_id', args.leadId).order('created_at', { ascending: true }).limit(20),
      supabase.from('lead_attachments').select('id, file_name, column_field, created_at').eq('lead_id', args.leadId).order('created_at', { ascending: false }).limit(80),
      supabase.from('lender_submissions').select('lender_name, status, created_at, updated_at').eq('lead_id', args.leadId).order('created_at', { ascending: false }).limit(20),
    ]);

    for (const res of [leadRes, settingsRes, stateRes, threadRes, filesRes, subsRes]) {
      if (res.error && isMissingSchema(res.error)) warnMissingSchema('buildLeadContext', res.error);
    }

    const lead = leadRes.data;
    if (!lead) return empty('Lead not found');
    const settings = settingsRes.data;
    const state = stateRes.data;
    const thread = (threadRes.data ?? []) as Array<{ direction?: string; body?: string; sent_by?: string; created_at?: string }>;
    const files = (filesRes.data ?? []) as AttachmentRow[];
    const subs = subsRes.data ?? [];
    const ud = asUd(lead.underwriting_data);
    const biz = await getBusinessName(supabase, args.userId);

    const derived = dealStageFromLead(lead, subs);
    const tz = zoneForLocation(String(ud.businessCity ?? ud.city ?? ''), String(ud.businessState ?? ud.state ?? ''))
      ?? settings?.timezone
      ?? 'America/New_York';
    const win = parseSendWindow(settings?.casper_capabilities);
    const now = new Date();
    const inWindow = isInSendWindow(tz, win.start, win.end, win.days, now);
    const nextOpen = nextWindowStart(tz, win.start, win.days, now);
    const enabled = casperEffectiveForLead(!!settings?.casper_enabled, lead.casper_enabled);
    const override = lead.casper_enabled === true ? 'lead override on' : lead.casper_enabled === false ? 'lead override off' : 'global';

    const nowLocal = now.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const nowEt = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    const financialBits: string[] = [];
    for (const k of FINANCIAL_KEYS) {
      const v = ud[k];
      if (v == null || v === '') continue;
      financialBits.push(`${k}=${typeof v === 'number' ? (k.toLowerCase().includes('score') ? v : fmtMoney(v) || v) : String(v)}`);
    }
    const analysis = ud.bankStatementAnalysis && typeof ud.bankStatementAnalysis === 'object'
      ? ud.bankStatementAnalysis as Record<string, unknown>
      : null;
    if (analysis?.analyzedAt) financialBits.push(`bankAnalyzedAt=${analysis.analyzedAt}`);
    for (const k of DISPLAY_METRIC_KEYS) {
      if (ud[k] == null || ud[k] === '' || ud[k] === 0) continue;
      financialBits.push(`${k}=${fmtMoney(ud[k]) || ud[k]}`);
    }

    const app = buildFundingApplication(lead);
    const blockers: string[] = [];
    if (app.missing.length) blockers.push(`missing application: ${app.missing.filter(m => !/ssn|dob/i.test(m)).join(', ')}`);
    const kinds = { application: 0, bank: 0, other: 0 };
    let newestFile: string | null = null;
    let newestBankMonth = '';
    for (const f of files) {
      const k = classifyDoc(f.file_name, f.column_field);
      kinds[k] += 1;
      if (!newestFile && f.created_at) newestFile = f.created_at;
      if (k === 'bank') {
        const mk = monthKeyFromName(f.file_name);
        if (mk > newestBankMonth) newestBankMonth = mk;
      }
    }
    if (kinds.application === 0) blockers.push('no application doc');
    if (kinds.bank < 3) blockers.push(`bank statements: ${kinds.bank} (need 3)`);
    const prevMonth = previousCalendarMonthKey();
    if (newestBankMonth && newestBankMonth < prevMonth) blockers.push(`latest statement month ${newestBankMonth} older than ${prevMonth}`);
    if (!String(lead.email || '').includes('@')) blockers.push('no email');
    if (bankAnalysisIsStale(ud, files)) blockers.push('new statement since last analysis');

    const lenderLines = (subs as Array<{ lender_name?: string; status?: string; created_at?: string }>).map(s =>
      `- ${s.lender_name || 'lender'} · ${s.status || '—'} · ${fmtWhen(s.created_at, tz)}`
    );

    const threadLines = thread.map(m =>
      `${fmtWhen(m.created_at, tz)} ${threadLabel(m)}: ${String(m.body || '').slice(0, 280)}`
    );

    const lastGuard = state?.last_guard_result ? String(state.last_guard_result) : null;
    const planNote = state?.plan_note ? String(state.plan_note) : null;
    const smsLanguage = await ensureLeadSmsLanguage(supabase, args.leadId, thread);
    const langName = languageLabel(smsLanguage);
    const languageLine = smsLanguage
      ? `LANGUAGE: ${langName || smsLanguage} (${smsLanguage}). Write sms in this language. thinking and plan_note stay English.`
      : 'LANGUAGE: unknown (detect from THREAD; default English). thinking and plan_note stay English.';

    const lines = [
      `NOW: ${nowLocal} (${tz}) | ET ${nowEt} | send window ${win.start}–${win.end} ${inWindow ? 'OPEN' : 'CLOSED'} | next open ${formatLocal(nextOpen, tz)}`,
      `STAGE: ${derived.stage} | lead_status=${lead.lead_status || '(none)'} | casper phase=${state?.phase || 'chatting'}${state?.paused_reason ? ` paused=${state.paused_reason}` : ''} | AI enabled: ${enabled ? 'yes' : 'no'} (${override}) | business=${biz.name || '(unset)'}`,
      languageLine,
      `FINANCIALS: ${financialBits.join('; ') || '(none)'}`,
      `READINESS BLOCKERS: ${blockers.join('; ') || 'none'}`,
      `DOCS: application=${kinds.application} bank=${kinds.bank} other=${kinds.other} newest=${newestFile ? fmtWhen(newestFile, tz) : 'none'}`,
      `LENDERS:\n${lenderLines.join('\n') || '(none)'}`,
      `THREAD:\n${threadLines.join('\n') || '(no prior thread)'}`,
      `PLAN NOTE: ${planNote || '(none)'}${state?.plan_updated_at ? ` (${fmtWhen(state.plan_updated_at, tz)})` : ''}`,
      lastGuard ? `Last send attempt: ${lastGuard}` : 'Last send attempt: (none)',
    ];

    return {
      text: lines.join('\n'),
      stage: derived.stage,
      facts: {
        stage: derived.stage,
        leadStatus: String(lead.lead_status || ''),
        phase: String(state?.phase || 'chatting'),
        enabled,
        tz,
        inWindow,
        businessName: biz.name,
        lastGuard,
        planNote,
        smsLanguage,
      },
    };
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('buildLeadContext', err);
    return empty();
  }
}
