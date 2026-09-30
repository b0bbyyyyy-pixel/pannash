/**
 * Outbound From header: "Display Name" <address>
 *
 * Env (optional):
 *   EMAIL_FROM_NAME=Bob
 *   EMAIL_FROM_ADDRESS=bob@businessfundusa.com  — fallback address only when no mailbox is connected
 *
 * Priority for the display name:
 *   mailbox from_name → user_settings.email_from_name → EMAIL_FROM_NAME → "Bob"
 * The sending address is never replaced; only the friendly name is added.
 */

export const DEFAULT_FROM_NAME = (process.env.EMAIL_FROM_NAME || 'Bob').trim() || 'Bob';

export type EmailMailbox = {
  from_name?: string | null;
  email?: string | null;
  from_email?: string | null;
  email_address?: string | null;
  smtp_username?: string | null;
};

function cleanName(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, '')
    .trim();
}

export function mailboxEmail(conn: EmailMailbox | null | undefined): string | null {
  const raw =
    conn?.email ||
    conn?.from_email ||
    conn?.email_address ||
    conn?.smtp_username ||
    '';
  const email = String(raw).trim();
  return email || null;
}

/** RFC 5322 display-name + angle-addr. Never returns a bare address. */
export function formatFromHeader(fromName: string | null | undefined, fromEmail: string): string {
  const email = String(fromEmail || '').trim();
  const name = cleanName(fromName) || DEFAULT_FROM_NAME;
  if (!email) return `"${name}"`;
  return `"${name}" <${email}>`;
}

export function resolveFromHeader(opts: {
  connection?: EmailMailbox | null;
  settingsFromName?: string | null;
  extraName?: string | null;
  fallbackEmail?: string | null;
}): { from: string; fromName: string; fromEmail: string } {
  const fromEmail =
    mailboxEmail(opts.connection) ||
    String(opts.fallbackEmail || '').trim() ||
    String(process.env.EMAIL_FROM_ADDRESS || '').trim();

  const fromName =
    cleanName(opts.connection?.from_name) ||
    cleanName(opts.settingsFromName) ||
    cleanName(opts.extraName) ||
    DEFAULT_FROM_NAME;

  return {
    from: formatFromHeader(fromName, fromEmail),
    fromName,
    fromEmail,
  };
}
