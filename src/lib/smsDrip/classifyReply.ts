import { isSmsStopBody } from '@/lib/leads/dnc';

export type ReplyTone = 'positive' | 'negative' | 'opt_out' | 'other';

const POSITIVE =
  /\b(yes|yeah|yep|yup|sure|ok|okay|interested|send (it|the)|go ahead|let'?s|call me|email me|more info|tell me more|sounds good|please send|how much|what (are )?the rates|apply|ready|do it|i am|i'm in)\b/i;

const NEGATIVE =
  /\b(nope|nah|not interested|no thanks|no thank|already (have|got|funded)|leave me|don'?t text|do not text|never|wrong number|not looking|stop texting|remove me|all set|not now)\b/i;

export function classifyReply(body: string | null | undefined): ReplyTone {
  const t = String(body ?? '').trim();
  if (!t) return 'other';
  if (isSmsStopBody(t)) return 'opt_out';
  const lower = t.toLowerCase().replace(/[.!?]+$/g, '');
  if (/^(no|nope|nah|na)$/.test(lower)) return 'negative';
  if (NEGATIVE.test(t)) return 'negative';
  if (POSITIVE.test(t)) return 'positive';
  return 'other';
}
