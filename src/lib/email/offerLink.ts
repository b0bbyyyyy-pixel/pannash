const SKIP = /unsubscribe|mailto:|privacy|terms-of|facebook|twitter|linkedin|instagram|logo\.|pixel|tracking|cdn\.|schemas\.microsoft|aka\.ms\/|support\.google/i;
const PREFER = /offer|approv|portal|click|deal|view|fund|ls\/click|upn=|application|term.?sheet/i;

function isPublicHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^(127\.|10\.|192\.168\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (host === '::1' || host === '[::1]') return false;
    return true;
  } catch {
    return false;
  }
}

export function offerLinkHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').replace(/^url\d+\./i, '');
  } catch {
    return '';
  }
}

export function pickOfferUrls(raw: string[]) {
  const clean = raw
    .map(u => u.replace(/[.,;]+$/, '').trim())
    .filter(u => isPublicHttpUrl(u) && !SKIP.test(u));
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const u of clean) {
    if (seen.has(u)) continue;
    seen.add(u);
    uniq.push(u);
  }
  uniq.sort((a, b) => Number(PREFER.test(b)) - Number(PREFER.test(a)));
  return uniq.slice(0, 2);
}

export function firstPreferredOfferUrl(raw: string[]) {
  return pickOfferUrls(raw).find(u => PREFER.test(u)) || '';
}

function extractStructuredOfferHints(html: string) {
  const hints: string[] = [];
  const next = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (next?.[1]) hints.push(next[1].slice(0, 12_000));
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1] || '';
    if (/commission|buyRate|factorRate|maxCommission|max_commission|prepay|epo/i.test(body)) {
      hints.push(body.slice(0, 8_000));
    }
  }
  const attrs = html.match(/(?:data-commission|data-max-commission|maxCommission|commissionMax|maxPoints)[^<>]{0,120}/gi);
  if (attrs?.length) hints.push(attrs.join('\n'));
  return hints.join('\n');
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchOne(url: string): Promise<string> {
  const tries = [url];
  if (url.startsWith('http://')) tries.push(`https://${url.slice('http://'.length)}`);
  for (const target of tries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(target, {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
      });
      const raw = (await res.text()).slice(0, 400_000);
      const refresh = raw.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i);
      if (refresh?.[1] && isPublicHttpUrl(refresh[1]) && refresh[1] !== target) {
        const bounced = await fetchOne(refresh[1]);
        if (bounced) {
          clearTimeout(timer);
          return bounced;
        }
      }
      const hints = extractStructuredOfferHints(raw);
      const text = [htmlToText(raw).slice(0, 14_000), hints].filter(Boolean).join('\n');
      if (text) {
        clearTimeout(timer);
        return text.slice(0, 24_000);
      }
    } catch {
      /* try next */
    } finally {
      clearTimeout(timer);
    }
  }
  return '';
}

export async function fetchOfferPages(urls: string[]) {
  if (!urls.length) return '';
  const chunks: string[] = [];
  for (const url of urls) {
    const text = await fetchOne(url);
    if (text) chunks.push(`LINKED PAGE (${url}):\n${text}`);
  }
  return chunks.join('\n\n');
}
