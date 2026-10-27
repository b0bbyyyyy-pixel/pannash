import { parseFlashIntensity, type FlashIntensity } from '@/lib/switchboard/prefs';

export const CASPER_MISSION = 'collect_app_and_banks';

export type CasperCapabilities = {
  chat_sms: boolean;
  email_application: boolean;
  update_lead_email: boolean;
  upload_docs_to_crm: boolean;
  submit_deals_waterfall: boolean;
  propose_deals: boolean;
};

export type CasperSendWindow = { start: string; end: string; days: number[] };

export const DEFAULT_SEND_WINDOW: CasperSendWindow = {
  start: '08:00',
  end: '21:00',
  days: [0, 1, 2, 3, 4, 5, 6],
};

function parseHHMM(raw: unknown, fallback: string) {
  const t = String(raw ?? '').trim();
  return /^\d{1,2}:\d{2}$/.test(t) ? t : fallback;
}

export function parseSendWindow(raw: unknown): CasperSendWindow {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const nested = obj.send_window && typeof obj.send_window === 'object'
    ? obj.send_window as Record<string, unknown>
    : obj;
  const start = parseHHMM(nested.start ?? nested.send_window_start ?? obj.send_window_start, DEFAULT_SEND_WINDOW.start);
  const end = parseHHMM(nested.end ?? nested.send_window_end ?? obj.send_window_end, DEFAULT_SEND_WINDOW.end);
  const daysRaw = nested.days ?? obj.send_days;
  const days = Array.isArray(daysRaw)
    ? daysRaw.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    : DEFAULT_SEND_WINDOW.days;
  return { start, end, days: days.length ? days : DEFAULT_SEND_WINDOW.days };
}

export const DEFAULT_CASPER_CAPABILITIES: CasperCapabilities = {
  chat_sms: true,
  email_application: true,
  update_lead_email: false,
  upload_docs_to_crm: false,
  submit_deals_waterfall: false,
  propose_deals: false,
};

export type CasperPhase =
  | 'chatting'
  | 'awaiting_app'
  | 'awaiting_banks'
  | 'app_received'
  | 'banks_received'
  | 'handed_off';

export const STOPPED_PHASES: CasperPhase[] = [
  'app_received',
  'banks_received',
  'handed_off',
];

export function mergeCapabilities(raw: unknown): CasperCapabilities {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    chat_sms: obj.chat_sms !== false,
    email_application: obj.email_application !== false,
    update_lead_email: obj.update_lead_email === true,
    upload_docs_to_crm: obj.upload_docs_to_crm === true,
    submit_deals_waterfall: obj.submit_deals_waterfall === true,
    propose_deals: obj.propose_deals === true,
  };
}

export type CasperReplyDelay = { minSec: number; maxSec: number };

export const DEFAULT_REPLY_DELAY: CasperReplyDelay = { minSec: 30, maxSec: 90 };

export function parseReplyDelay(raw: unknown): CasperReplyDelay {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const nested = obj.reply_delay && typeof obj.reply_delay === 'object'
    ? obj.reply_delay as Record<string, unknown>
    : obj;
  let min = Number(nested.reply_delay_min_sec ?? nested.min_sec ?? nested.minSec ?? obj.reply_delay_min_sec);
  let max = Number(nested.reply_delay_max_sec ?? nested.max_sec ?? nested.maxSec ?? obj.reply_delay_max_sec);
  if (!Number.isFinite(min)) min = DEFAULT_REPLY_DELAY.minSec;
  if (!Number.isFinite(max)) max = DEFAULT_REPLY_DELAY.maxSec;
  min = Math.round(Math.min(600, Math.max(5, min)));
  max = Math.round(Math.min(600, Math.max(5, max)));
  if (max < min) {
    const swap = min;
    min = max;
    max = swap;
  }
  return { minSec: min, maxSec: max };
}

/** Keep toggle flags, reply-delay, send window, and switchboard prefs together in casper_capabilities JSON. */
export function persistCapabilities(
  raw: unknown,
  delay?: CasperReplyDelay,
  flashIntensity?: FlashIntensity,
  sendWindow?: CasperSendWindow,
): Record<string, unknown> {
  const d = delay ?? parseReplyDelay(raw);
  return {
    ...mergeCapabilities(raw),
    reply_delay_min_sec: d.minSec,
    reply_delay_max_sec: d.maxSec,
    send_window: sendWindow ?? parseSendWindow(raw),
    switchboard_flash_intensity: flashIntensity ?? parseFlashIntensity(raw),
  };
}

/** Editable Brain text. Identity, rails, and JSON output are appended in code. */
export const DEFAULT_CASPER_EDITABLE_PROMPT = `You are Casper, the AI SMS agent for {business_name}. You text MCA (merchant cash advance) leads on the owner's behalf.

WHO YOU ARE
- You never invent rates, approvals, terms, or "you're approved."
- You never submit deals to lenders or propose specific offers. If asked, say the owner handles underwriting and lender matching.
- If they ask for a human, a callback, or to stop automated texts: acknowledge and say the owner will take it from here.

MISSION (v1)
Get the lead to send:
1) the completed funding application, and
2) recent business bank statements (last 3–6 months).
You may offer to email the application if they give or already have an email.

STAGE
- SUBMITTED: answer questions and give status. Do not push docs or offers.
- OFFER_RECEIVED: help them review, or set needs_human so the owner can schedule.

TOOLS
- update_lead_email: when they text an email address, copy it into the lead's Email field, replacing any existing one, then send the APPLICATION template if "Email application to lead" is on. Do not invent an address. If the address looks invalid, set needs_human.

TONE
- Short SMS. One or two sentences. Under 320 characters. No emoji unless they use them first.
- Professional, warm, direct. Customer-care wording. No spammy hype, no ALL CAPS, no "guaranteed funding."
- Never say "working capital". Say "business funding" or "funding".
- Do not repeat the same ask twice in a row. Advance the conversation.

COMPLIANCE
- STOP / HELP / opt-out are handled by the system. Do not argue with STOP.
- Never ask for SSN, full card numbers, or bank login credentials over text.

Set update_lead_email true when they just provided an email address — the system copies it into the lead's Email field (replacing any existing one) and can send the APPLICATION template.
Set email_application true only if they asked you to email the application (or clearly want it by email) and an email is available or they just provided one.
Set needs_human true if they want the owner, are angry, or this is beyond document collection.
Set phase handed_off when you are stepping back for the owner.`;

export const DEFAULT_CASPER_SYSTEM_PROMPT = DEFAULT_CASPER_EDITABLE_PROMPT;

export const CASPER_LOCKED_PROMPT_MARKER = '--- CASPER LOCKED (applied in code) ---';

export const LOCKED_CASPER_SYSTEM_PROMPT = `LOCKED RULES (enforced in code; do not contradict)
- You represent {business_name}. You are NOT a lender and never say you are.
- Do not use a persona name or invent a first name for yourself.
- Rails (opt-out, quiet hours, cooldown, submitted lockout, paused) are enforced in code. If the briefing says a send was blocked or overridden, do not argue with it — adapt and say so in plan_note.
- Write "sms" in the lead's language from LANGUAGE in the briefing. thinking, reasoning, and plan_note stay English.

OUTPUT
Reply with JSON only:
{
  "thinking": "brief internal note of what you are doing and why — never shown to the lead",
  "reasoning": "short reason for this reply",
  "plan_note": "what we are waiting for and the next step (max 400 characters)",
  "sms": "the text the lead will read — or empty string to send nothing",
  "update_lead_email": false,
  "email_application": false,
  "phase": "chatting | awaiting_app | awaiting_banks | handed_off",
  "needs_human": false,
  "human_reason": ""
}

"sms" is ONLY what the lead reads. Never put thinking, instructions, "no reply needed", JSON, quote marks, or stage directions in sms.
If they decline / say they are not interested / a clear "no" to funding: set "sms" to an empty string (we send nothing), phase handed_off, needs_human false.
Empty sms means send nothing. Do not send "", """", or any quotes. Do not invent a follow-up pitch.`;

function normPrompt(raw: string) {
  return raw.replace(/\s+/g, ' ').trim();
}

const OLD_DEFAULT_NEEDLES = [
  'AI co-pilot for Robert Gulinello',
  'One Funding / Meadow Lake',
  'You introduce One Funding',
  'stepping back for Robert',
];

export function isStaleCasperPrompt(raw: string | null | undefined): boolean {
  const t = String(raw || '');
  if (!t.trim()) return true;
  if (/one\s*funding/i.test(t) || /robert\s*gulinello/i.test(t)) return true;
  const n = normPrompt(t);
  return OLD_DEFAULT_NEEDLES.some(needle => n.includes(normPrompt(needle)));
}

export function stripLockedCasperPrompt(raw: string): string {
  let t = String(raw || '');
  const marker = t.indexOf(CASPER_LOCKED_PROMPT_MARKER);
  if (marker >= 0) t = t.slice(0, marker);
  const lockedIdx = t.indexOf(LOCKED_CASPER_SYSTEM_PROMPT);
  if (lockedIdx >= 0) t = t.slice(0, lockedIdx);
  const lockedRules = t.search(/\nLOCKED RULES \(enforced in code/);
  if (lockedRules >= 0) t = t.slice(0, lockedRules);
  const outputIdx = t.search(/\nOUTPUT\nReply with JSON only:/);
  if (outputIdx >= 0 && /"plan_note"/.test(t.slice(outputIdx))) t = t.slice(0, outputIdx);
  return t.trim();
}

export function resolveSavedCasperPrompt(raw: string | null | undefined): { prompt: string; upgraded: boolean } {
  const saved = String(raw || '').trim();
  if (isStaleCasperPrompt(saved)) {
    return { prompt: DEFAULT_CASPER_EDITABLE_PROMPT, upgraded: true };
  }
  const stripped = stripLockedCasperPrompt(saved);
  return { prompt: stripped || DEFAULT_CASPER_EDITABLE_PROMPT, upgraded: stripped !== saved };
}

export function composeCasperSystemPrompt(saved: string | null | undefined): string {
  const editable = resolveSavedCasperPrompt(saved).prompt;
  return `${editable.trim()}\n\n${CASPER_LOCKED_PROMPT_MARKER}\n${LOCKED_CASPER_SYSTEM_PROMPT}`;
}
