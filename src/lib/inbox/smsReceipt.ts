export type SmsReceipt = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

type ReceiptMsg = {
  direction?: string | null;
  status?: string | null;
  twilio_sid?: string | null;
  created_at?: string | null;
};

/** Carrier SMS has no open receipt. Read = they replied after this outbound, or Twilio sent `read` (RCS/WhatsApp). */
export function outboundSmsReceipt(msg: ReceiptMsg, thread: ReceiptMsg[] = []): SmsReceipt {
  const status = String(msg.status ?? '');
  if (status === 'failed') return 'failed';
  if (status === 'read') return 'read';

  const laterReply = thread.some(
    other =>
      other.direction === 'inbound' &&
      String(other.created_at ?? '') > String(msg.created_at ?? ''),
  );
  if (laterReply) return 'read';

  if (status === 'queued' && msg.twilio_sid) return 'sent';
  if (status === 'delivered') return 'delivered';
  if (status === 'sent' || status === 'accepted' || status === 'sending') return 'sent';
  if (status === 'queued') return 'queued';
  return 'sent';
}
