/** US Letter page at 96dpi — 8.5in × 11in. */
export const LETTER_WIDTH_PX = 816;
export const LETTER_HEIGHT_PX = 1056;

export const EMAIL_FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24] as const;
export const DEFAULT_EMAIL_FONT_PT = 12;

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

function brNewlinesOutsideTags(html: string) {
  let out = '';
  let inTag = false;
  for (const c of html) {
    if (c === '<') inTag = true;
    if (inTag) {
      out += c;
      if (c === '>') inTag = false;
      continue;
    }
    if (c === '\r') continue;
    out += c === '\n' ? '<br/>' : c;
  }
  return out;
}

/** Turn stored template HTML/plain text into body markup. */
export function prepareEmailBodyHtml(raw: string) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const hasMarkup = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  let html = hasMarkup ? trimmed : escapeHtml(trimmed);
  if (!/<br\s*\/?>/i.test(html) && html.includes('\n')) {
    html = brNewlinesOutsideTags(html);
  } else if (!/<br\s*\/?>/i.test(html) && !html.includes('\n')) {
    html = html
      .replace(/(Thank you!?)/i, '<br/>$1')
      .replace(/\s+(Website:)/i, '<br/>$1')
      .replace(/\s+(NOTICE:)/i, '<br/><br/>NOTICE:');
  }
  if (/NOTICE:/i.test(html) && !/email-notice/.test(html)) {
    html = html.replace(/(NOTICE:\s*[\s\S]*)$/i, '<div class="email-notice">$1</div>');
  }
  return sanitizeEmailHtml(html);
}

export function clampEmailFontPt(n: unknown, fallback = DEFAULT_EMAIL_FONT_PT) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < 10) return 10;
  if (v > 24) return 24;
  return v;
}

/** Wrap body so Gmail/Outlook render as a letter-sized email. */
export function wrapLetterHtml(body: string, fontSizePt = DEFAULT_EMAIL_FONT_PT) {
  const size = clampEmailFontPt(fontSizePt);
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:${size}pt;` +
    `line-height:1.5;color:#222222;max-width:8.5in">${prepareEmailBodyHtml(body)}</div>`
  );
}
