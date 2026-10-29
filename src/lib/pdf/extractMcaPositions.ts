/**
 * MCA remittances on merchant statements are almost always:
 *   - ACH / electronic debit
 *   - same dollar amount
 *   - every business day (~12–22× / month) or weekly (~3–5×)
 *   - originator printed as the funder, a 16-char NACHA truncation, or a servicer
 *     ("MCA SERVICING", "CFGMS", "FORWARDFIN", "Orig CO Name: RAPID FINANCE")
 *
 * Named aliases catch the common shops. Recurring same-amount ACH catches
 * everyone else (boutique funders, white-label originators).
 */
import { LENDERS } from '@/data/lenders';

type McaPosition = {
  lender: string;
  payment: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  monthlyPayment: number;
  outstanding?: number;
  fundedDate?: string;
  fundedAmount?: number;
};

function monthlyFrom(pay: number, frequency: McaPosition['frequency']): number {
  if (frequency === 'daily') return Math.round(pay * 21);
  if (frequency === 'weekly') return Math.round(pay * 4.33);
  return Math.round(pay);
}

function parsePositionsField(raw: unknown): McaPosition[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) list = p;
    } catch {
      return [];
    }
  }
  const out: McaPosition[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const lender = String(r.lender ?? r.name ?? '').trim();
    const payment = Number(r.payment) || 0;
    const freqRaw = String(r.frequency ?? 'daily').toLowerCase();
    const frequency: McaPosition['frequency'] =
      freqRaw.startsWith('week') ? 'weekly' : freqRaw.startsWith('month') ? 'monthly' : 'daily';
    if (!lender && payment <= 0) continue;
    out.push({
      lender: lender || 'Unknown funder',
      payment,
      frequency,
      monthlyPayment: Number(r.monthlyPayment) || monthlyFrom(payment, frequency),
      ...(typeof r.outstanding === 'number' ? { outstanding: r.outstanding } : {}),
      ...(r.fundedDate ? { fundedDate: String(r.fundedDate) } : {}),
      ...(typeof r.fundedAmount === 'number' && r.fundedAmount > 0 ? { fundedAmount: r.fundedAmount } : {}),
    });
  }
  return out;
}

function mergeLocal(...lists: Array<McaPosition[] | unknown>): McaPosition[] {
  const byKey = new Map<string, McaPosition>();
  for (const list of lists) {
    for (const p of parsePositionsField(list)) {
      const key = p.lender.toLowerCase();
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, p);
        continue;
      }
      const preferNew = (p.payment || 0) > (prev.payment || 0);
      const keep = preferNew ? p : prev;
      const other = preferNew ? prev : p;
      byKey.set(key, {
        ...keep,
        lender: keep.lender !== 'Unknown funder' ? keep.lender : other.lender,
        fundedDate: keep.fundedDate || other.fundedDate,
        fundedAmount: keep.fundedAmount ?? other.fundedAmount,
        outstanding: keep.outstanding ?? other.outstanding,
      });
    }
  }
  return [...byKey.values()];
}

export const MCA_BANK_PROMPT = `MCA positions — this is required, not optional.
Merchant cash advances print as recurring ACH / electronic WITHDRAWALS (debits), not in the summary box.
Look through the full transaction list, including later pages, ACH deductions, electronic withdrawals, and "Orig CO Name" / DES: / INDN: continuation lines.

How they look:
- Same dollar amount every business day (12–22 times in the month) or the same day each week (3–5 times).
- Description is the funder or a truncation: RAPID FIN, KAPITUS, CREDIBLY, FORWARDFIN, NATIONAL FUNDI, CFGMS, EVEREST BUS FDG, ONDECK, LIBERTAS, PEARL CAPITAL, MCA SERVICING, RETAIL CAPITAL, STRATEGIC FUNDING, ITRIA VENTURES, COLONIAL FUNDING.
- Chase/BofA often split: "ACH WITHDRAWAL 185.50" then next line "Orig CO Name: RAPID FINANCE".
- Do NOT treat payroll (ADP, Gusto, Paychex), rent, utilities, IRS, card spend, Amazon.com purchases, or internal transfers as MCA.
- DO treat Amazon Lending / AMZN LENDING, PayPal Capital, Square Capital as positions.
- Each distinct originator is its own position. payment = the repeating debit amount. frequency = daily if ~12+ times, weekly if ~4 times.
- monthlyPayment = payment * 21 if daily, * 4.33 if weekly.
- Funding credit: a large incoming ACH/wire FROM that same funder on this statement → fundedDate + fundedAmount. Never use the debit amount as fundedAmount.
If you see those repeating ACH debits, you MUST fill mcaPositions. Empty mcaPositions when the statement clearly shows Rapid/Kapitus/daily ACH is wrong.`;

type FunderAlias = { name: string; aliases: string[] };

/** Industry ACH descriptors that often differ from the brand on the contract. */
const ACH_DIRECTORY: FunderAlias[] = [
  { name: 'Rapid Finance', aliases: ['rapid finance', 'rapidfinance', 'rapidadvance', 'rapid advance', 'rapid fin', 'rapidfund', 'rapid adv', 'rapidfin'] },
  { name: 'Kapitus', aliases: ['kapitus', 'strategic funding', 'strategicfunding', 'strategic fundi', 'colonial funding', 'colonialfunding', 'colonial fundi', 'sfs ny'] },
  { name: 'Credibly', aliases: ['credibly', 'retail capital', 'retailcapital'] },
  { name: 'OnDeck', aliases: ['ondeck', 'on deck capital', 'on deck'] },
  { name: 'National Funding', aliases: ['national funding', 'nationalfunding', 'national fundi', 'natl funding'] },
  { name: 'Forward Financing', aliases: ['forward financing', 'forward fin', 'forwardfin', 'forwardfinancin', 'ff funding', 'forward finance', 'forwardfinusa'] },
  { name: 'Libertas', aliases: ['libertas funding', 'libertas'] },
  { name: 'Pearl Capital', aliases: ['pearl capital', 'pearl beta', 'pearlcap'] },
  { name: 'Everest Business Funding', aliases: ['everest business', 'everest bus fdg', 'everest bus', 'everest funding', 'everest'] },
  { name: 'IOU', aliases: ['iou financial', 'iou fin', 'ioufunding'] },
  { name: 'Yellowstone Capital', aliases: ['yellowstone capital', 'yellowstone'] },
  { name: 'ClearFund', aliases: ['clearfund', 'clear fund'] },
  { name: 'Fox Business Fund', aliases: ['fox business fund', 'fox capital', 'fox funding'] },
  { name: 'CFG', aliases: ['cfg merchant', 'cfgms', 'cfg merchant solutions'] },
  { name: 'BFS Capital', aliases: ['bfs capital', 'bfscapital'] },
  { name: 'CAN Capital', aliases: ['can capital', 'cancapital'] },
  { name: 'Fora Financial', aliases: ['fora financial', 'forafin', 'fora funding'] },
  { name: 'Greenbox Capital', aliases: ['greenbox capital', 'greenbox'] },
  { name: 'Mulligan Funding', aliases: ['mulligan funding', 'mulligan'] },
  { name: 'Biz2Credit', aliases: ['biz2credit', 'itria ventures', 'itria'] },
  { name: 'BlueVine', aliases: ['bluevine', 'blue vine'] },
  { name: 'Fundbox', aliases: ['fundbox'] },
  { name: 'Headway Capital', aliases: ['headway capital', 'headway'] },
  { name: 'Kabbage', aliases: ['kabbage', 'k servicing', 'kservicing'] },
  { name: 'Amazon Lending', aliases: ['amazon lending', 'amazon capital', 'amzn lending'] },
  { name: 'Square Capital', aliases: ['square capital'] },
  { name: 'PayPal Capital', aliases: ['paypal capital', 'paypal working capital'] },
  { name: 'Stripe Capital', aliases: ['stripe capital'] },
  { name: 'Shopify Capital', aliases: ['shopify capital'] },
  { name: 'Bitty Advance', aliases: ['bitty advance', 'bittyadv'] },
  { name: 'ByzCap', aliases: ['byzfunder', 'byz funder', 'byzcap', 'byz cap'] },
  { name: 'Clearco', aliases: ['clearco', 'clearbanc'] },
  { name: 'FundKite', aliases: ['fundkite', 'fund kite'] },
  { name: 'LG Funding', aliases: ['lg funding'] },
  { name: 'Idea Financial', aliases: ['idea financial', 'idea fin'] },
  { name: 'Fintegra', aliases: ['fintegra'] },
  { name: 'CloudFund', aliases: ['cloudfund', 'cloud fund'] },
  { name: 'Lendr', aliases: ['lendr online', 'lendr'] },
  { name: 'TVT Capital', aliases: ['tvt capital', 'tvtcap'] },
  { name: 'Mr Advance', aliases: ['mr advance', 'mradvance'] },
  { name: 'Vox Funding', aliases: ['vox funding', 'voxfunding'] },
  { name: 'Torro', aliases: ['torro capital', 'torro'] },
  { name: 'Fuji Funding', aliases: ['fuji funding', 'fiji gold'] },
  { name: '1st Merchant Funding', aliases: ['1st merchant', 'first merchant funding'] },
  { name: 'Unique Funding', aliases: ['unique funding'] },
  { name: 'Business Backer', aliases: ['business backer'] },
  { name: 'Swift Capital', aliases: ['swift capital'] },
  { name: 'Reliant Funding', aliases: ['reliant funding'] },
  { name: 'Expansion Capital', aliases: ['expansion capital'] },
  { name: 'Principal Capital', aliases: ['principal capital'] },
  { name: 'Gibraltar Capital', aliases: ['gibraltar'] },
  { name: 'Knight Capital', aliases: ['knight capital'] },
  { name: 'American Finance Solutions', aliases: ['american finance solutions', 'afs ny'] },
  { name: 'MCA Servicing', aliases: ['mca servicing', 'mcaservicing', 'mca pmt', 'mca payment'] },
  { name: 'Balboa Capital', aliases: ['balboa capital', 'balboacapital'] },
  { name: 'World Business Lenders', aliases: ['world business lenders', 'world bus lend'] },
  { name: '1 Global Capital', aliases: ['1 global capital', '1global'] },
  { name: 'Ace Funding Source', aliases: ['ace funding source', 'ace funding src'] },
  { name: 'GRP Funding', aliases: ['grp funding'] },
  { name: 'Funding Metrics', aliases: ['funding metrics'] },
  { name: 'Pinnacle Business Funding', aliases: ['pinnacle business funding', 'pinnacle bus'] },
  { name: 'Velocity Capital Group', aliases: ['velocity capital'] },
  { name: 'Kalamata Capital', aliases: ['kalamata capital', 'kalamata'] },
  { name: 'Highland Hill Capital', aliases: ['highland hill'] },
  { name: 'Backd', aliases: ['backd business', 'backd'] },
  { name: 'Smart Step Funding', aliases: ['smart step funding', 'smartstep'] },
  { name: 'Union Funding Source', aliases: ['union funding source'] },
  { name: 'Westwood Funding', aliases: ['westwood funding'] },
  { name: 'The Smarter Merchant', aliases: ['smarter merchant'] },
  { name: 'Cashable', aliases: ['cashable'] },
  { name: 'Breakout Finance', aliases: ['breakout finance'] },
  { name: 'Funderial', aliases: ['funderial'] },
  { name: 'In Advance Capital', aliases: ['in advance capital'] },
  { name: 'Kings Funding Group', aliases: ['kings funding'] },
  { name: 'Lendini', aliases: ['lendini'] },
  { name: 'Capytal', aliases: ['capytal'] },
  { name: 'Spier Capital', aliases: ['spier capital'] },
  { name: 'Trofeo Capital', aliases: ['trofeo capital'] },
  { name: 'Vader Mountain Capital', aliases: ['vader mountain'] },
  { name: 'Emmy Capital', aliases: ['emmy capital'] },
  { name: 'Fratello Capital', aliases: ['fratello capital'] },
  { name: 'American Express Kabbage', aliases: ['amex kabbage', 'american express kabbage'] },
];

const GENERIC_ALIAS = new Set([
  'the', 'and', 'group', 'capital', 'funding', 'fund', 'finance', 'financial',
  'business', 'merchant', 'services', 'partners', 'llc', 'inc', 'corp', 'source',
  'advance', 'loans', 'loan', 'new', 'one', 'also', 'reverse',
]);

const SHORT_OK = new Set(['iou', 'cfg', 'tvt', 'fms', 'lcf', 'bitty', 'goose', 'torro', 'fora', 'bfs', 'sfs']);

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function aliasesFromLenderName(name: string): string[] {
  const base = name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[,/].*$/, ' ').replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  if (base.length >= 3) out.add(base.toLowerCase());
  const smashed = compact(base);
  if (smashed.length >= 6) out.add(smashed);
  const words = base.split(/\s+/).filter(w => !GENERIC_ALIAS.has(w.toLowerCase()));
  if (words.length >= 2) out.add(words.slice(0, 2).join(' ').toLowerCase());
  const first = (words[0] || '').toLowerCase();
  if (first.length >= 6 || SHORT_OK.has(first)) out.add(first);
  return [...out];
}

function buildDirectory(): FunderAlias[] {
  const byName = new Map<string, Set<string>>();
  const add = (name: string, aliases: string[]) => {
    const key = name.trim();
    if (!key) return;
    const set = byName.get(key) ?? new Set<string>();
    for (const a of aliases) {
      const t = a.trim().toLowerCase();
      if (t.length < 3) continue;
      if (GENERIC_ALIAS.has(t) && t.length < 8) continue;
      set.add(t);
      set.add(compact(t));
    }
    byName.set(key, set);
  };
  for (const row of ACH_DIRECTORY) add(row.name, [row.name, ...row.aliases]);
  for (const lender of LENDERS) add(lender.name, aliasesFromLenderName(lender.name));
  return [...byName.entries()]
    .map(([name, aliases]) => ({ name, aliases: [...aliases].sort((a, b) => b.length - a.length) }))
    .sort((a, b) => b.aliases[0].length - a.aliases[0].length);
}

const DIRECTORY = buildDirectory();

const EXCLUDE = [
  'adp payroll', 'adp wage', 'adp tax', 'gusto', 'paychex', 'paylocity', 'rippling',
  'quickbooks payroll', 'intuit payroll', 'payroll', 'insperity', 'zenefits',
  'irs treas', 'irs usa', 'usataxpymt', 'tax payment', 'child support',
  'geico', 'state farm', 'allstate', 'progressive ins', 'nationwide ins',
  'verizon wireless', 'at&t', 't-mobile', 'comcast', 'xfinity', 'spectrum',
  'duke energy', 'con edison', 'national grid',
  'internal transfer', 'online transfer', 'online banking transfer', 'account transfer',
  'zelle', 'venmo', 'cash app',
  'amazon.com', 'amzn mktp', 'amazon mktp', 'amazon prime',
  'walmart', 'costco', 'staples', 'office depot', 'shell oil', 'chevron',
  'amex epayment', 'american express epay', 'chase credit crd', 'capital one crcard',
  'synchrony', 'citicards',
];

const LENDER_SHAPE = /\b(capital|funding|fund|finance|financial|advance|lending|lender|merchant|factor|mca|cash\s*adv)/i;

function isExcluded(desc: string): boolean {
  const d = desc.toLowerCase();
  if (/\b(amazon lending|amzn lending|paypal capital|square capital|stripe capital)\b/.test(d)) return false;
  return EXCLUDE.some(x => d.includes(x));
}

function isCreditLine(desc: string): boolean {
  return /\b(deposit|credit|incoming|wire in|ach add|additions?|origination|funded|funding credit)\b/i.test(desc)
    && !/\b(debit|withdrawal|withdraw)\b/i.test(desc);
}

function isDebitLine(desc: string, amount: number, funder: string | null): boolean {
  if (amount < 0) return true;
  if (isCreditLine(desc)) return false;
  if (funder) return true;
  return /\b(ach|withdrawal|withdraw|debit|electronic|preauthorized|recurring|ppd|ccd|tel\b|web\b|collection|remit|orig\s*co)\b/i.test(desc);
}

const MONEY_RE = /\$?\s*(\(?-?[\d,]+\.\d{2}\)?)/g;

function parseAmounts(line: string): number[] {
  const out: number[] = [];
  MONEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONEY_RE.exec(line))) {
    const token = m[1];
    const n = Number(token.replace(/[(),]/g, ''));
    if (!Number.isFinite(n) || Math.abs(n) < 1) continue;
    out.push(token.includes('(') && n > 0 ? -n : n);
  }
  return out;
}

function glueLines(text: string): string[] {
  const raw = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const out: string[] = [];
  const cont = /^(orig(?:inator)?\s*co(?:mpany)?\s*name|orig\s*id|des\s*:|indn\s*:|co(?:mpany)?\s*id|entry\s*class|sec\s*:|trace|to\s+|from\s+)/i;
  const nameOnly = /^(?:[A-Z][A-Z0-9 .,&'/-]{2,48})$/;
  const amountOnly = /^\$?\s*\(?[\d,]+\.\d{2}\)?\s*(?:CR|DR)?$/i;
  for (const line of raw) {
    if (!out.length) {
      out.push(line);
      continue;
    }
    const prev = out[out.length - 1];
    if (cont.test(line) || (nameOnly.test(line) && !parseAmounts(line).length && parseAmounts(prev).length)) {
      out[out.length - 1] += ` ${line}`;
      continue;
    }
    if (amountOnly.test(line) && prev.length < 90 && !parseAmounts(prev).length) {
      out[out.length - 1] += ` ${line}`;
      continue;
    }
    out.push(line);
  }
  return out;
}

function aliasHits(descLower: string, smashed: string, alias: string): boolean {
  const t = alias.trim();
  if (t.length < 3) return false;
  if (t.includes(' ')) return descLower.includes(t);
  const c = compact(t);
  if (c.length >= 10) return smashed.includes(c);
  const re = new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i');
  return re.test(descLower);
}

function matchFunder(desc: string): string | null {
  const lower = desc.toLowerCase();
  const smashed = compact(desc);
  for (const row of DIRECTORY) {
    for (const alias of row.aliases) {
      if (aliasHits(lower, smashed, alias)) return row.name;
    }
  }
  return null;
}

function normalizeClusterKey(desc: string): string {
  let s = desc.toLowerCase();
  s = s.replace(/\b(ach|withdrawal|withdrawals|debit|debits|electronic|preauthorized|recurring|online|payment|pmt|web|ppd|ccd|tel|pos|purchase|authorized|orig(?:inator)?|co(?:mpany)?|name|des|indn|id|trace|entry|class|sec)\b/g, ' ');
  s = s.replace(/\$?[\d,]+\.\d{2}/g, ' ');
  s = s.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s.slice(0, 32);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function similarAmount(a: number, b: number): boolean {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(Math.abs(a) - Math.abs(b)) / max <= 0.06;
}

type Hit = { desc: string; amount: number; funder: string | null; key: string };

function collectHits(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const line of glueLines(text)) {
    if (isExcluded(line)) continue;
    const amounts = parseAmounts(line);
    if (!amounts.length) continue;
    const amount = amounts[amounts.length - 1];
    const funder = matchFunder(line);
    if (!isDebitLine(line, amount, funder)) continue;
    const pay = Math.abs(amount);
    if (pay < 40 || pay > 25000) continue;
    const descKey = normalizeClusterKey(line);
    const key = funder
      ? `funder:${funder.toLowerCase()}`
      : descKey.length >= 8
        ? `desc:${descKey}`
        : `amt:${Math.round(pay * 100)}`;
    hits.push({ desc: line, amount: pay, funder, key });
  }
  return hits;
}

function hitsFromFullText(text: string, already: Set<string>): Hit[] {
  const extra: Hit[] = [];
  const smashed = compact(text);
  const lower = text.toLowerCase();
  for (const row of DIRECTORY) {
    if (already.has(row.name.toLowerCase())) continue;
    let found = false;
    for (const alias of row.aliases) {
      if (alias.length < 5) continue;
      if (alias.includes(' ') ? lower.includes(alias) : smashed.includes(compact(alias))) {
        found = true;
        break;
      }
    }
    if (!found) continue;
    const pieces = row.aliases.filter(a => a.length >= 5).slice(0, 6);
    if (!pieces.length) continue;
    const re = new RegExp(pieces.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    const nearby: number[] = [];
    let m: RegExpExecArray | null;
    const blob = text;
    while ((m = re.exec(blob))) {
      const window = blob.slice(Math.max(0, m.index - 24), m.index + m[0].length + 48);
      for (const n of parseAmounts(window)) {
        const pay = Math.abs(n);
        if (pay >= 40 && pay <= 25000) nearby.push(pay);
      }
    }
    if (nearby.length < 3 && (blob.toLowerCase().split(row.name.toLowerCase()).length - 1) < 4) continue;
    const pay = nearby.length ? median(nearby.filter(n => similarAmount(n, median(nearby)))) : 0;
    extra.push({
      desc: row.name,
      amount: pay,
      funder: row.name,
      key: `funder:${row.name.toLowerCase()}`,
    });
  }
  return extra;
}

function positionFromHits(hits: Hit[], known: boolean): McaPosition | null {
  if (!hits.length) return null;
  const amounts = hits.map(h => h.amount).filter(n => n > 0);
  const pay = amounts.length ? median(amounts.filter(n => similarAmount(n, median(amounts)))) : 0;
  const count = amounts.length ? amounts.filter(n => similarAmount(n, pay || median(amounts))).length : hits.length;
  if (!known && count < 3) return null;
  if (known && count < 2 && pay <= 0) {
    /* name appeared; keep it with unknown payment */
  } else if (!known && count < 6 && !LENDER_SHAPE.test(hits[0].desc)) {
    return null;
  }
  let frequency: McaPosition['frequency'] = 'daily';
  if (count <= 6) frequency = count <= 2 ? 'monthly' : 'weekly';
  if (count >= 10) frequency = 'daily';
  const lender = hits.find(h => h.funder)?.funder
    || titleCase(normalizeClusterKey(hits[0].desc))
    || `Unknown funder (${pay.toFixed(2)})`;
  if (!known && isExcluded(lender)) return null;
  return {
    lender,
    payment: Math.round(pay * 100) / 100,
    frequency,
    monthlyPayment: monthlyFrom(pay, frequency),
  };
}

function titleCase(s: string): string {
  return s.split(/\s+/).filter(Boolean).map(w => w.slice(0, 1).toUpperCase() + w.slice(1)).join(' ');
}

export function extractMcaPositionsFromText(raw: string): McaPosition[] {
  const text = String(raw || '');
  if (text.replace(/\s/g, '').length < 40) return [];
  const hits = collectHits(text);
  const groups = new Map<string, Hit[]>();
  for (const hit of hits) {
    const list = groups.get(hit.key) ?? [];
    list.push(hit);
    groups.set(hit.key, list);
  }
  const found = new Set<string>();
  const positions: McaPosition[] = [];
  for (const [, list] of groups) {
    const known = list.some(h => h.funder);
    const pos = positionFromHits(list, known);
    if (!pos) continue;
    positions.push(pos);
    found.add(pos.lender.toLowerCase());
  }
  for (const hit of hitsFromFullText(text, found)) {
    const pos = positionFromHits([hit, ...hits.filter(h => h.funder === hit.funder)], true);
    if (pos) {
      positions.push(pos);
      found.add(pos.lender.toLowerCase());
    }
  }
  const usedCents = new Set(positions.filter(p => p.payment > 0).map(p => Math.round(p.payment * 100)));
  const byAmt = new Map<number, Hit[]>();
  for (const hit of hits) {
    if (hit.funder) continue;
    const cents = Math.round(hit.amount * 100);
    if (usedCents.has(cents)) continue;
    const list = byAmt.get(cents) ?? [];
    list.push(hit);
    byAmt.set(cents, list);
  }
  for (const [, list] of byAmt) {
    if (list.length < 8) continue;
    const pos = positionFromHits(list, false);
    if (!pos || pos.payment <= 0) continue;
    if (!found.has(pos.lender.toLowerCase())) {
      positions.push(pos);
      found.add(pos.lender.toLowerCase());
    }
  }
  return mergeLocal(positions);
}

export function mcaFieldsFromText(text: string): Record<string, string> {
  const positions = extractMcaPositionsFromText(text);
  if (!positions.length) return {};
  return {
    mcaPositions: JSON.stringify(positions),
    hasOtherMCALoans: 'true',
  };
}

export function unionMcaFields(...parts: Array<Record<string, string> | null | undefined>): Record<string, string> {
  const merged = mergeLocal(...parts.map(p => p?.mcaPositions));
  if (!merged.length) return {};
  return {
    mcaPositions: JSON.stringify(merged),
    hasOtherMCALoans: 'true',
  };
}
