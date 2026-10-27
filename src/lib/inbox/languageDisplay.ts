const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French',
  ht: 'Haitian Creole', zh: 'Chinese', ar: 'Arabic', vi: 'Vietnamese',
  ko: 'Korean', ru: 'Russian', de: 'German', it: 'Italian',
  pl: 'Polish', tl: 'Tagalog', hi: 'Hindi',
};

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_NAMES).flatMap(([code, name]) => [[name.toLowerCase(), code], [code, code]]),
);

export function normalizeLang(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
  if (!t) return null;
  const base = t.split('-')[0];
  if (base === 'und' || base === 'unknown' || base === 'null') return null;
  if (NAME_TO_CODE[t]) return NAME_TO_CODE[t];
  if (NAME_TO_CODE[base]) return NAME_TO_CODE[base];
  if (/^[a-z]{2}$/.test(base)) return base;
  return null;
}

export function languageLabel(code: string | null | undefined): string {
  const n = normalizeLang(code);
  if (!n) return '';
  return LANG_NAMES[n] || n.toUpperCase();
}

export function sameSmsText(a: string, b: string) {
  return String(a || '').replace(/\s+/g, ' ').trim().toLowerCase()
    === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function inboxEnglishGloss(msg: { body?: string | null; body_en?: string | null }) {
  const body = String(msg.body || '').trim();
  const en = String(msg.body_en || '').trim();
  if (!en || !body || sameSmsText(en, body)) return null;
  return en;
}

export function sentInLabel(msg: { detected_lang?: string | null }) {
  const lang = normalizeLang(msg.detected_lang);
  if (!lang || lang === 'en') return null;
  return `sent in ${lang.toUpperCase()}`;
}
