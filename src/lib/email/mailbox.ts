import { google, type gmail_v1 } from 'googleapis';
import { refreshGmailToken, isTokenExpired } from '@/lib/gmail-refresh';
import { firstPreferredOfferUrl, offerLinkHost } from '@/lib/email/offerLink';

// Same loose client as other email helpers — column names vary by migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type MailFolder = 'inbox' | 'sent';

export type MailListItem = {
  id: string;
  folder: MailFolder;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  hasOfferLink?: boolean;
  offerLinkHost?: string;
};

export type MailAttachmentRef = {
  attachmentId: string;
  filename: string;
  mime: string;
};

export type MailMessage = MailListItem & {
  body: string;
  htmlText: string;
  links: string[];
  attachments: MailAttachmentRef[];
};

export class MailboxError extends Error {
  needsReconnect: boolean;
  constructor(message: string, needsReconnect = false) {
    super(message);
    this.name = 'MailboxError';
    this.needsReconnect = needsReconnect;
  }
}

function headerOf(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
) {
  const want = name.toLowerCase();
  return headers?.find(h => (h.name || '').toLowerCase() === want)?.value?.trim() || '';
}

function decodeB64Url(data?: string | null) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function walkParts(part: gmail_v1.Schema$MessagePart | undefined, out: { text: string; html: string }) {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  if (mime === 'text/plain') out.text += decodeB64Url(part.body?.data);
  if (mime === 'text/html') out.html += decodeB64Url(part.body?.data);
  for (const child of part.parts || []) walkParts(child, out);
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function hrefsFromHtml(html: string) {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let href = m[1].trim().replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(href)) out.push(href);
  }
  return out;
}

function urlsFromText(text: string) {
  return (text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []).map(u => u.replace(/[.,;]+$/, ''));
}

function uniqueUrls(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function collectAttachments(part: gmail_v1.Schema$MessagePart | undefined, out: MailAttachmentRef[]) {
  if (!part) return;
  const filename = String(part.filename || '').trim();
  const id = part.body?.attachmentId;
  const mime = String(part.mimeType || '');
  if (filename && id) out.push({ attachmentId: id, filename, mime });
  for (const child of part.parts || []) collectAttachments(child, out);
}

function bodyFromPayload(payload: gmail_v1.Schema$MessagePart | undefined): {
  body: string;
  htmlText: string;
  links: string[];
  attachments: MailAttachmentRef[];
} {
  const out = { text: '', html: '' };
  walkParts(payload, out);
  const text = out.text.trim();
  const htmlText = htmlToText(out.html);
  const body = [htmlText, text].filter(Boolean).join('\n\n').slice(0, 24_000);
  const links = uniqueUrls([...hrefsFromHtml(out.html), ...urlsFromText(text), ...urlsFromText(body)]);
  const attachments: MailAttachmentRef[] = [];
  collectAttachments(payload, attachments);
  return { body, htmlText, links, attachments };
}

function labelsOf(msg: gmail_v1.Schema$Message): MailFolder {
  const labels = msg.labelIds ?? [];
  return labels.includes('SENT') ? 'sent' : 'inbox';
}

function summarize(msg: gmail_v1.Schema$Message): MailListItem {
  const headers = msg.payload?.headers;
  return {
    id: String(msg.id || ''),
    folder: labelsOf(msg),
    from: headerOf(headers, 'From'),
    to: headerOf(headers, 'To'),
    subject: headerOf(headers, 'Subject') || '(no subject)',
    date: headerOf(headers, 'Date'),
    snippet: String(msg.snippet || '').trim(),
  };
}

function asMailboxError(err: unknown): MailboxError {
  if (err instanceof MailboxError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const reconnect = /insufficient|scope|invalid_grant|invalid credentials|unauthorized|PERMISSION_DENIED|Failed to get access token/i.test(msg);
  return new MailboxError(
    reconnect
      ? 'Gmail needs inbox access. Reconnect Gmail in Settings → Email.'
      : msg || 'Could not read Gmail.',
    reconnect,
  );
}

async function gmailForUser(supabase: Sb, userId: string) {
  const { data: readConns, error: readErr } = await supabase
    .from('email_read_connections')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (readErr && /email_read_connections|schema cache|does not exist/i.test(readErr.message || '')) {
    throw new MailboxError('Gmail read table is missing. Run add-email-read-connections.sql in Supabase.', true);
  }
  const gmailConn = (readConns ?? []).find(
    (c: { access_token?: string; refresh_token?: string }) => c.access_token || c.refresh_token,
  );
  if (!gmailConn) {
    throw new MailboxError('Connect Gmail (read) in Settings to open Inbox and Sent.', true);
  }

  let accessToken = (gmailConn.access_token as string | null) || null;
  const refreshToken = (gmailConn.refresh_token as string | null) || null;
  const expiry = (gmailConn.expiry_date || gmailConn.expires_at) as string | null;
  if (refreshToken && isTokenExpired(expiry)) {
    const refreshed = await refreshGmailToken(userId, refreshToken, supabase, {
      table: 'email_read_connections',
    });
    if (refreshed) accessToken = refreshed.access_token;
  }
  if (!accessToken) {
    throw new MailboxError('Gmail read session expired. Reconnect Gmail (read) in Settings.', true);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`,
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function listMailbox(
  supabase: Sb,
  userId: string,
  opts: { folder: MailFolder; q?: string; pageToken?: string },
): Promise<{ messages: MailListItem[]; nextPageToken: string | null }> {
  try {
    const gmail = await gmailForUser(supabase, userId);
    const listed = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [opts.folder === 'sent' ? 'SENT' : 'INBOX'],
      maxResults: 25,
      q: opts.q?.trim() || undefined,
      pageToken: opts.pageToken || undefined,
    });
    const ids = (listed.data.messages ?? []).map(m => m.id).filter((id): id is string => !!id);
    const messages = (
      await Promise.all(
        ids.map(async id => {
          try {
            const got = await gmail.users.messages.get({
              userId: 'me',
              id,
              format: 'full',
            });
            const item = summarize(got.data);
            const parsed = bodyFromPayload(got.data.payload);
            const offer = firstPreferredOfferUrl(parsed.links);
            return {
              ...item,
              hasOfferLink: !!offer,
              offerLinkHost: offer ? offerLinkHost(offer) : '',
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter((m): m is MailListItem => !!m && !!m.id);
    messages.sort((a, b) => Number(!!b.hasOfferLink) - Number(!!a.hasOfferLink));
    return { messages, nextPageToken: listed.data.nextPageToken || null };
  } catch (err) {
    throw asMailboxError(err);
  }
}

export async function getMailboxMessage(
  supabase: Sb,
  userId: string,
  messageId: string,
): Promise<MailMessage> {
  try {
    const gmail = await gmailForUser(supabase, userId);
    const got = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    const item = summarize(got.data);
    if (!item.id) throw new MailboxError('Email not found.');
    const parsed = bodyFromPayload(got.data.payload);
    return {
      ...item,
      body: parsed.body,
      htmlText: parsed.htmlText,
      links: parsed.links,
      attachments: parsed.attachments,
    };
  } catch (err) {
    throw asMailboxError(err);
  }
}

export async function downloadMailboxAttachment(
  supabase: Sb,
  userId: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer | null> {
  try {
    const gmail = await gmailForUser(supabase, userId);
    const att = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    const data = att.data.data;
    if (!data) return null;
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch {
    return null;
  }
}
