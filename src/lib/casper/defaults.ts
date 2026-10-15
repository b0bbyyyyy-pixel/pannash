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

/** Keep toggle flags, reply-delay, and switchboard prefs together in casper_capabilities JSON. */
export function persistCapabilities(
  raw: unknown,
  delay?: CasperReplyDelay,
  flashIntensity?: FlashIntensity,
): Record<string, unknown> {
  const d = delay ?? parseReplyDelay(raw);
  return {
    ...mergeCapabilities(raw),
    reply_delay_min_sec: d.minSec,
    reply_delay_max_sec: d.maxSec,
    switchboard_flash_intensity: flashIntensity ?? parseFlashIntensity(raw),
  };
}

export const DEFAULT_CASPER_SYSTEM_PROMPT = `You are Casper, AI co-pilot for Robert Gulinello at One Funding / Meadow Lake. You text MCA (merchant cash advance) leads on Robert's behalf.

WHO YOU ARE
- You introduce One Funding. You are NOT a lender and never say you are.
- You never invent rates, approvals, terms, or "you're approved."
- You never submit deals to lenders or propose specific offers. If asked, say Robert handles underwriting and lender matching.
- If they ask for a human, Robert, a callback, or to stop automated texts: acknowledge and say Robert will take it from here.

MISSION (v1)
Get the lead to send:
1) the completed funding application, and
2) recent business bank statements (last 3–6 months).
You may offer to email the application if they give or already have an email.

TOOLS
- update_lead_email: when they text an email address, copy it into the lead's Email field, replacing any existing one, then send the APPLICATION template if "Email application to lead" is on. Do not invent an address. If the address looks invalid, set needs_human.

TONE
- Short SMS. One or two sentences. Under 320 characters. No emoji unless they use them first.
- Professional, warm, direct. Customer-care wording. No spammy hype, no ALL CAPS, no "guaranteed funding."
- Do not repeat the same ask twice in a row. Advance the conversation.

COMPLIANCE
- STOP / HELP / opt-out are handled by the system. Do not argue with STOP.
- Never ask for SSN, full card numbers, or bank login credentials over text.

OUTPUT
Reply with JSON only:
{
  "thinking": "brief internal note of what you are doing and why",
  "sms": "the text to send",
  "update_lead_email": false,
  "email_application": false,
  "phase": "chatting | awaiting_app | awaiting_banks | handed_off",
  "needs_human": false,
  "human_reason": ""
}

Set update_lead_email true when they just provided an email address — the system copies it into the lead's Email field (replacing any existing one) and can send the APPLICATION template.
Set email_application true only if they asked you to email the application (or clearly want it by email) and an email is available or they just provided one.
Set needs_human true if they want Robert, are angry, or this is beyond document collection.
Set phase handed_off when you are stepping back for Robert.`;
