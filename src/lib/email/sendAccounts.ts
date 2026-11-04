import { mailboxEmail, type EmailMailbox } from '@/lib/email-from';

export type SendConnection = EmailMailbox & {
  id?: string;
  provider?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: string | null;
  expires_at?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  email_signature?: string | null;
};

export type SendAccountOption = {
  id: string;
  email: string;
  fromName: string;
  signature: string;
  provider: string;
  preferred: boolean;
};

export function isGmailSend(conn: SendConnection | null | undefined): conn is SendConnection {
  return !!conn && conn.provider === 'gmail' && !!(conn.access_token || conn.refresh_token);
}

export function isSmtpSend(conn: SendConnection | null | undefined): conn is SendConnection {
  return !!conn && !!conn.smtp_host;
}

export function canSendFrom(conn: SendConnection | null | undefined) {
  return isGmailSend(conn) || isSmtpSend(conn);
}

export function listSendConnections(rows: SendConnection[] | null | undefined): SendConnection[] {
  return (rows ?? []).filter(canSendFrom);
}

export function pickSendConnection(
  rows: SendConnection[] | null | undefined,
  preferredId?: string | null,
  requestedId?: string | null,
): SendConnection | null {
  const sendable = listSendConnections(rows);
  if (!sendable.length) return null;
  if (requestedId) {
    const hit = sendable.find(c => c.id === requestedId);
    if (hit) return hit;
  }
  if (preferredId) {
    const hit = sendable.find(c => c.id === preferredId);
    if (hit) return hit;
  }
  return sendable.find(isGmailSend) || sendable[0];
}

export function signatureFor(
  conn: SendConnection | null | undefined,
  fallback?: string | null,
) {
  return String(conn?.email_signature || fallback || '').trim();
}

export function toSendAccountOptions(
  rows: SendConnection[] | null | undefined,
  opts?: {
    preferredId?: string | null;
    fallbackSignature?: string | null;
    fallbackFromName?: string | null;
  },
): SendAccountOption[] {
  const preferredId = opts?.preferredId || '';
  const fallbackSig = String(opts?.fallbackSignature || '');
  const fallbackName = String(opts?.fallbackFromName || '').trim();
  return listSendConnections(rows).map(c => ({
    id: String(c.id || ''),
    email: mailboxEmail(c) || '',
    fromName: String(c.from_name || fallbackName || '').trim(),
    signature: String(c.email_signature || fallbackSig || ''),
    provider: String(c.provider || 'gmail'),
    preferred: !!c.id && c.id === preferredId,
  })).filter(a => a.id && a.email);
}

export function emailsMatch(a?: string | null, b?: string | null) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/** Lender submissions always send from this mailbox when it is connected. */
export const LENDER_SUBMISSION_FROM = 'hello@onefundingsolution.com';

export function pickConnectionByEmail(
  rows: SendConnection[] | null | undefined,
  email: string,
): SendConnection | null {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  return listSendConnections(rows).find(c => emailsMatch(mailboxEmail(c), target)) || null;
}
