import { toE164 } from '@/lib/dialer/e164';

export type InboxSmsStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export type RecordOutboundSmsArgs = {
  userId?: string | null;
  leadId?: string | null;
  toPhone?: string | null;
  body: string;
  twilioSid?: string | null;
  status: InboxSmsStatus;
  errorMessage?: string | null;
  sentBy?: 'user' | 'system' | 'calvin';
  bumpLastMessageAt?: boolean;
  existingMessageId?: string | null;
};

function last10(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

function phoneVariants(raw: string): string[] {
  const e164 = toE164(raw);
  const d = last10(raw);
  return [...new Set([raw, e164, d, d ? `+1${d}` : '', d ? `1${d}` : ''].filter(Boolean))] as string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findLeadByPhone(supabase: any, phone: string, userId?: string | null) {
  const variants = phoneVariants(phone);
  const digits = last10(phone);

  let q = supabase.from('leads').select('id, user_id, phone, phone_e164').in('phone', variants);
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.limit(5);
  if (data?.[0]) return data[0];

  if (digits.length === 10) {
    let q2 = supabase.from('leads').select('id, user_id, phone, phone_e164').eq('phone_e164', `+1${digits}`);
    if (userId) q2 = q2.eq('user_id', userId);
    const { data: byE164 } = await q2.limit(1);
    if (byE164?.[0]) return byE164[0];
  }

  return null;
}

/**
 * Write (or update) an outbound inbox_messages row so status webhooks can attach later.
 * Idempotent on twilio_sid.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordOutboundInboxSms(supabase: any, args: RecordOutboundSmsArgs) {
  const sid = args.twilioSid?.trim() || null;
  const body = (args.body ?? '').trim();
  if (!body && !sid) return null;

  if (args.existingMessageId) {
    const { error } = await supabase
      .from('inbox_messages')
      .update({
        status: args.status,
        twilio_sid: sid,
        error_message: args.errorMessage ?? null,
      })
      .eq('id', args.existingMessageId);
    if (error) console.error('[inbox] recordOutboundInboxSms update', error);
    return { messageId: args.existingMessageId };
  }

  if (sid) {
    const { data: existing } = await supabase
      .from('inbox_messages')
      .select('id, conversation_id')
      .eq('twilio_sid', sid)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('inbox_messages')
        .update({
          status: args.status,
          error_message: args.errorMessage ?? null,
          ...(body ? { body } : {}),
        })
        .eq('id', existing.id);
      return { messageId: existing.id, conversationId: existing.conversation_id };
    }
  }

  let leadId = args.leadId ?? null;
  let userId = args.userId ?? null;

  if (!leadId && args.toPhone) {
    const lead = await findLeadByPhone(supabase, args.toPhone, userId);
    if (lead) {
      leadId = lead.id;
      userId = userId || lead.user_id;
    }
  }

  if (!leadId || !userId) {
    console.warn('[inbox] recordOutboundInboxSms: no lead/user for SID', sid, 'to', args.toPhone);
    return null;
  }

  let { data: conv } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .maybeSingle();

  if (!conv) {
    const { data: created, error: convErr } = await supabase
      .from('inbox_conversations')
      .insert({ user_id: userId, lead_id: leadId })
      .select('id')
      .single();
    if (convErr) console.error('[inbox] recordOutboundInboxSms conv', convErr);
    conv = created;
  }
  if (!conv) return null;

  const { data: msg, error } = await supabase
    .from('inbox_messages')
    .insert({
      conversation_id: conv.id,
      lead_id: leadId,
      direction: 'outbound',
      body: body || '(no body)',
      status: args.status,
      sent_by: args.sentBy ?? 'system',
      twilio_sid: sid,
      error_message: args.errorMessage ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[inbox] recordOutboundInboxSms insert', error);
    return null;
  }

  const preview = body.length > 100 ? `${body.slice(0, 97)}…` : body;
  const convPatch: Record<string, unknown> = {
    last_message_preview: preview || undefined,
    last_direction: 'outbound',
  };
  if (args.bumpLastMessageAt !== false) convPatch.last_message_at = new Date().toISOString();

  await supabase.from('inbox_conversations').update(convPatch).eq('id', conv.id);

  return { messageId: msg?.id as string, conversationId: conv.id as string };
}
