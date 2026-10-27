/**
 * Tiny harness for Casper foundation (no vitest in this repo).
 * Run: npx tsx scripts/casper-foundation.test.ts
 */
import { bankAnalysisIsStale } from '../src/lib/casper/context';
import {
  parseSendWindow,
  DEFAULT_SEND_WINDOW,
  composeCasperSystemPrompt,
  isStaleCasperPrompt,
  resolveSavedCasperPrompt,
} from '../src/lib/casper/defaults';
import { rewriteBannedPhrases, checkCasperSms, isNotedRail } from '../src/lib/casper/rails';
import { isCasperSender } from '../src/lib/casper/sender';
import {
  DEFAULT_STATUS_NAMES,
  dealStageFromLead,
  submittedLockoutResult,
  type DealStage,
} from '../src/lib/casper/stage';
import { isInSendWindow, nextWindowStart } from '../src/lib/smsDrip/timezones';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}
function eq<T>(a: T, b: T, msg: string) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)} expected ${JSON.stringify(b)})`);
}

const expected: Record<string, DealStage> = {
  'New Lead': 'NEW',
  Prospect: 'ACTIVE',
  Contacted: 'ACTIVE',
  'Callback Scheduled': 'ACTIVE',
  Revisit: 'ACTIVE',
  'App Out': 'ACTIVE',
  'Application Acknowledgement': 'ACTIVE',
  'Documents Acknowledgment': 'ACTIVE',
  'Docs Requested': 'ACTIVE',
  'Missing Docs/info': 'ACTIVE',
  'Needs More Docs': 'ACTIVE',
  'Docs In': 'PENDING_SUBMISSION',
  'Docs Received': 'PENDING_SUBMISSION',
  Submitted: 'SUBMITTED',
  'Submitted To Non-MCA': 'SUBMITTED',
  'Submitted to Underwriting': 'SUBMITTED',
  'In Underwriting': 'SUBMITTED',
  'Pre-Qualified': 'OFFER_RECEIVED',
  'Conditionally Approved': 'OFFER_RECEIVED',
  Approved: 'OFFER_RECEIVED',
  'Contract Sent': 'OFFER_RECEIVED',
  'Contract In': 'OFFER_RECEIVED',
  'Contract Signed': 'OFFER_RECEIVED',
  'Contract Out': 'OFFER_RECEIVED',
  Funded: 'FUNDED',
  'Renewal Eligible': 'ACTIVE',
  'Renewal In Progress': 'ACTIVE',
  Renewal: 'ACTIVE',
  LOC: 'ACTIVE',
  Declined: 'DEAD',
  'All Declined/Final': 'DEAD',
  'Merchant Declined Offer': 'DEAD',
  'Not Interested': 'DEAD',
  Dead: 'DEAD',
  DNC: 'DEAD',
  'In Default': 'DEAD',
  Wood: 'NEW',
  'SPANISH SPEAKING ONLY': 'NEW',
};

for (const name of DEFAULT_STATUS_NAMES) {
  const want = expected[name];
  const got = dealStageFromLead({ lead_status: name, in_pipeline: false }).stage;
  eq(got, want, `stage ${name}`);
}

eq(dealStageFromLead({ lead_status: 'Wood', in_pipeline: true }).stage, 'ACTIVE', 'unknown in_pipeline → ACTIVE');
eq(dealStageFromLead({ lead_status: 'New Lead', in_pipeline: false, list_id: 'list-1' }).stage, 'DRIP', 'drip list');
eq(dealStageFromLead({ lead_status: 'Prospect', sms_opt_out: true }).stage, 'DEAD', 'opt-out dead');
eq(
  dealStageFromLead({ lead_status: 'Prospect' }, [{ status: 'Approved', created_at: '2026-01-01' }]).stage,
  'OFFER_RECEIVED',
  'Approved submission → OFFER_RECEIVED',
);
eq(
  dealStageFromLead({ lead_status: 'Prospect' }, [{ status: 'Sent', created_at: '2026-01-02' }]).stage,
  'SUBMITTED',
  'Sent submission → SUBMITTED',
);

const lock = submittedLockoutResult({
  stage: 'SUBMITTED',
  submittedAt: '2026-01-15T12:00:00Z',
  newestInboundAfterSubmit: false,
});
assert(lock.ok === false && /blocked: submitted_lockout/.test(lock.result || ''), 'submitted lockout blocks');
assert(
  submittedLockoutResult({ stage: 'SUBMITTED', submittedAt: '2026-01-15T12:00:00Z', newestInboundAfterSubmit: true }).ok,
  'submitted lockout allows merchant text after submit',
);
assert(submittedLockoutResult({ stage: 'OFFER_RECEIVED', submittedAt: null, newestInboundAfterSubmit: false }).ok, 'offer lifts lockout');

eq(isCasperSender('casper'), true, 'isCasperSender casper');
eq(isCasperSender('calvin'), true, 'isCasperSender calvin');
eq(isCasperSender('user'), false, 'isCasperSender user');

const banned = rewriteBannedPhrases('Need working capital this week');
eq(banned.hit, true, 'banned phrase hit');
eq(banned.body, 'Need business funding this week', 'banned phrase rewrite');

assert(
  bankAnalysisIsStale({ bankStatementAnalysis: { analyzedAt: '2026-01-01T00:00:00Z' } }, [
    { file_name: 'bank.pdf', column_field: 'bank_statements', created_at: '2026-02-01T00:00:00Z' },
  ]),
  'stale when new bank after analysis',
);
assert(
  !bankAnalysisIsStale({ bankStatementAnalysis: { analyzedAt: '2026-03-01T00:00:00Z' } }, [
    { file_name: 'bank.pdf', column_field: 'bank_statements', created_at: '2026-02-01T00:00:00Z' },
  ]),
  'fresh analysis',
);
assert(
  bankAnalysisIsStale({}, [{ file_name: 'statement.pdf', created_at: '2026-02-01T00:00:00Z' }]),
  'stale when no analysis',
);

const win = parseSendWindow({ send_window: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] } });
eq(win.start, '09:00', 'send window start');
eq(win.end, '18:00', 'send window end');
eq(DEFAULT_SEND_WINDOW.start, '08:00', 'default send window');

const noonEt = new Date('2026-10-27T16:00:00.000Z'); // 12:00 ET
assert(isInSendWindow('America/New_York', '08:00', '21:00', [0, 1, 2, 3, 4, 5, 6], noonEt), 'ET noon in window');
const midnightEt = new Date('2026-10-27T05:00:00.000Z'); // 1:00 ET
assert(!isInSendWindow('America/New_York', '08:00', '21:00', [0, 1, 2, 3, 4, 5, 6], midnightEt), 'ET 1am outside window');
assert(isInSendWindow('America/Chicago', '08:00', '21:00', [0, 1, 2, 3, 4, 5, 6], noonEt), 'CT 11am in window');
assert(isInSendWindow('America/Los_Angeles', '08:00', '21:00', [0, 1, 2, 3, 4, 5, 6], noonEt), 'PT 9am in window');
const next = nextWindowStart('America/New_York', '08:00', [0, 1, 2, 3, 4, 5, 6], midnightEt);
assert(next.getTime() > midnightEt.getTime(), 'next window is in the future');

function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(name: string) {
      const rows = tables[name] || [];
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const q: Record<string, unknown> = {};
      const self = q as {
        select: () => typeof self;
        eq: (col: string, val: unknown) => typeof self;
        gte: () => typeof self;
        order: () => typeof self;
        limit: () => typeof self;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
        then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise<unknown>;
      };
      self.select = () => self;
      self.eq = (col, val) => { filters.push(r => r[col] === val); return self; };
      self.gte = () => self;
      self.order = () => self;
      self.limit = () => self;
      self.maybeSingle = async () => ({ data: rows.find(r => filters.every(f => f(r))) || null, error: null });
      self.then = (resolve) => Promise.resolve({ data: rows.filter(r => filters.every(f => f(r))), error: null }).then(resolve);
      return self;
    },
  };
}

async function railCheck() {
  const noon = new Date('2026-10-27T16:00:00.000Z');
  const late = new Date('2026-10-27T04:00:00.000Z');

  const base = {
    user_settings: [{ user_id: 'u1', casper_enabled: true, casper_capabilities: {}, timezone: 'America/New_York', business_name: 'Test Co' }],
    leads: [{
      id: 'l1', list_id: null, casper_enabled: null, sms_opt_out: false, lead_status: 'Prospect',
      in_pipeline: true, underwriting_data: { businessState: 'NY' }, dnc: false,
    }],
    casper_lead_state: [{ lead_id: 'l1', phase: 'chatting', paused_reason: null }],
    inbox_messages: [{ lead_id: 'l1', direction: 'inbound', body: 'hi', sent_by: 'user', created_at: noon.toISOString() }],
    lender_submissions: [],
  };

  const allow = await checkCasperSms(fakeSupabase(base), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hello from Test Co', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(allow.ok, `merchant reply allowed (${allow.blocked})`);

  const opt = await checkCasperSms(fakeSupabase({
    ...base,
    leads: [{ ...base.leads[0], sms_opt_out: true }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hi', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(!opt.ok && /opt_out/.test(opt.blocked || ''), 'opt_out rail');

  const off = await checkCasperSms(fakeSupabase({
    ...base,
    user_settings: [{ ...base.user_settings[0], casper_enabled: false }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hi', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(!off.ok && /casper_off/.test(off.blocked || ''), 'casper_off rail');

  const paused = await checkCasperSms(fakeSupabase({
    ...base,
    casper_lead_state: [{ lead_id: 'l1', phase: 'banks_received', paused_reason: 'docs_received' }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hi', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(!paused.ok && /paused/.test(paused.blocked || ''), 'paused rail');

  const submitted = await checkCasperSms(fakeSupabase({
    ...base,
    leads: [{ ...base.leads[0], lead_status: 'Submitted' }],
    inbox_messages: [{ lead_id: 'l1', direction: 'outbound', body: 'status', sent_by: 'casper', created_at: noon.toISOString() }],
    lender_submissions: [{ lead_id: 'l1', status: 'Sent', created_at: '2026-01-01T00:00:00Z' }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hi', initiatedBy: 'casper_proactive', now: noon,
  });
  assert(!submitted.ok && /submitted_lockout/.test(submitted.blocked || ''), 'submitted_lockout proactive');

  const afterText = await checkCasperSms(fakeSupabase({
    ...base,
    leads: [{ ...base.leads[0], lead_status: 'Submitted' }],
    inbox_messages: [{ lead_id: 'l1', direction: 'inbound', body: 'any update?', sent_by: 'user', created_at: '2026-02-01T00:00:00Z' }],
    lender_submissions: [{ lead_id: 'l1', status: 'Sent', created_at: '2026-01-01T00:00:00Z' }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Still with lenders.', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(afterText.ok, `submitted lockout allows after merchant text (${afterText.blocked})`);

  const cooldown = await checkCasperSms(fakeSupabase({
    ...base,
    inbox_messages: [{ lead_id: 'l1', direction: 'outbound', body: 'already', sent_by: 'user', created_at: noon.toISOString() }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hi again', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(!cooldown.ok && /cooldown/.test(cooldown.blocked || ''), 'cooldown already answered');

  const quietPro = await checkCasperSms(fakeSupabase({
    ...base,
    inbox_messages: [{ lead_id: 'l1', direction: 'inbound', body: 'hi', sent_by: 'user', created_at: '2026-10-26T12:00:00.000Z' }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Checking in', initiatedBy: 'casper_proactive', now: late,
  });
  assert(!quietPro.ok && /quiet_hours/.test(quietPro.blocked || ''), 'quiet_hours blocks proactive');

  const quietOverride = await checkCasperSms(fakeSupabase({
    ...base,
    inbox_messages: [{ lead_id: 'l1', direction: 'inbound', body: 'hi', sent_by: 'user', created_at: late.toISOString() }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Got it', initiatedBy: 'merchant_reply', now: late,
  });
  assert(quietOverride.ok && quietOverride.results.some(r => isNotedRail(r) && r.result.includes('overridden: quiet_hours — merchant texted first')), 'quiet_hours merchant override');

  const quietResched = await checkCasperSms(fakeSupabase({
    ...base,
    inbox_messages: [{ lead_id: 'l1', direction: 'inbound', body: 'hi', sent_by: 'user', created_at: '2026-10-26T12:00:00.000Z' }],
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Got it', initiatedBy: 'merchant_reply', now: late,
  });
  assert(quietResched.ok && quietResched.rescheduleTo, 'quiet_hours reschedule');
  assert(quietResched.results.some(r => isNotedRail(r) && r.result.includes('overridden: quiet_hours — rescheduled')), 'quiet_hours reschedule result');

  const phrase = await checkCasperSms(fakeSupabase(base), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'We offer working capital', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(phrase.ok && phrase.body.includes('business funding'), 'banned_phrase rewrite on send');

  const missingTables = await checkCasperSms(fakeSupabase({
    user_settings: [{ user_id: 'u1', casper_enabled: true, casper_capabilities: {}, timezone: 'America/New_York', business_name: 'Test Co' }],
    leads: base.leads,
    casper_lead_state: [],
    inbox_messages: base.inbox_messages,
  }), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hello', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(typeof missingTables.ok === 'boolean', 'build/rails survive missing optional rows');

  const leftover = await checkCasperSms(fakeSupabase(base), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Hi from {business_name}', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(leftover.ok && leftover.body.includes('Test Co') && !leftover.body.includes('{'), 'placeholder filled from business name');

  const unknownPh = await checkCasperSms(fakeSupabase(base), {
    userId: 'u1', leadId: 'l1', toPhone: '+15551212', body: 'Call {owner_name}', initiatedBy: 'merchant_reply', now: noon,
  });
  assert(!unknownPh.ok && /placeholder_in_sms/.test(unknownPh.blocked || ''), 'placeholder_in_sms rail');
}

assert(isStaleCasperPrompt('You are Casper, AI co-pilot for Robert Gulinello at One Funding / Meadow Lake.'), 'old One Funding prompt is stale');
assert(!isStaleCasperPrompt('You are Casper, the AI SMS agent for {business_name}.'), 'new prompt is not stale');
const upgraded = resolveSavedCasperPrompt('You introduce One Funding. You text leads on Robert Gulinello\'s behalf.');
assert(upgraded.upgraded && /\{business_name\}/.test(upgraded.prompt), 'stale prompt upgrades to new default');
assert(/plan_note/.test(composeCasperSystemPrompt(upgraded.prompt)), 'composed prompt includes plan_note');
assert(/You represent \{business_name\}/.test(composeCasperSystemPrompt('custom tone only')), 'locked identity always appended');
assert(/Write "sms" in the lead's language/.test(composeCasperSystemPrompt('custom tone only')), 'locked language rule always appended');

railCheck().then(() => {
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nall passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
