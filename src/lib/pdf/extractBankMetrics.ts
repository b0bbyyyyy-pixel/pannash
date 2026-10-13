/** Pull deposit / balance totals from any common bank-statement text layer. */

const MONEY = '\\$?\\s*(-?[\\d,]+\\.\\d{2})';
const MONEY_ONLY = '\\$?\\s*-?[\\d,]+\\.\\d{2}';

const CORE_KEYS = [
  'monthlyRevenue', 'totalDeposits', 'endingBalance', 'openingBalance',
] as const;

export function hasBankMetrics(fields: Record<string, string>): boolean {
  return CORE_KEYS.some(k => {
    const n = Number(String(fields[k] ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && String(fields[k] ?? '').trim() !== '';
  });
}

function money(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? String(n) : undefined;
}

function first(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

function captureMoney(match: RegExpMatchArray | null): string | undefined {
  if (!match) return undefined;
  let found: string | undefined;
  for (let i = 1; i < match.length; i++) {
    const raw = String(match[i] ?? '');
    if (!/\d+\.\d{2}/.test(raw) && !/,\d{3}/.test(raw)) continue;
    const v = money(raw);
    if (v) found = v;
  }
  return found;
}

/** Repair common glued bank-statement tokens so regex can see the summary box. */
export function unglueBankText(text: string): string {
  let s = text.replace(/\r/g, '');
  const pairs: [RegExp, string][] = [
    [/DEPOSITSOTHER/gi, 'DEPOSITS OTHER'],
    [/OTHERCREDITS/gi, 'OTHER CREDITS'],
    [/CREDITSTOTALING/gi, 'CREDITS TOTALING'],
    [/DEBITSTOTALING/gi, 'DEBITS TOTALING'],
    [/PREVIOUSBALANCE/gi, 'PREVIOUS BALANCE'],
    [/NEWBALANCE/gi, 'NEW BALANCE'],
    [/ENDINGBALANCE/gi, 'ENDING BALANCE'],
    [/BEGINNINGBALANCE/gi, 'BEGINNING BALANCE'],
    [/OPENINGBALANCE/gi, 'OPENING BALANCE'],
    [/CHECKINGSUMMARY/gi, 'CHECKING SUMMARY'],
    [/ACCOUNTSUMMARY/gi, 'ACCOUNT SUMMARY'],
    [/CHECKSTOTALING/gi, 'CHECKS TOTALING'],
    [/CHECKTOTALING/gi, 'CHECKS TOTALING'],
    [/OTHERWITHDRAWALS/gi, 'OTHER WITHDRAWALS'],
    [/WITHDRAWALSDEBITS/gi, 'WITHDRAWALS DEBITS'],
    [/RETURNEDITEM/gi, 'RETURNED ITEM'],
    [/OVERDRAFTFEE/gi, 'OVERDRAFT FEE'],
    [/DEPOSITSAND/gi, 'DEPOSITS AND'],
    [/ANDADDITIONS/gi, 'AND ADDITIONS'],
    [/ANDOTHER/gi, 'AND OTHER'],
    [/TOTALCREDITS/gi, 'TOTAL CREDITS'],
    [/TOTALDEBITS/gi, 'TOTAL DEBITS'],
    [/TOTALDEPOSITS/gi, 'TOTAL DEPOSITS'],
    [/TOTALWITHDRAWALS/gi, 'TOTAL WITHDRAWALS'],
    [/(\d)TOTALING/gi, '$1 TOTALING'],
    [/PLUS(\d)/gi, 'PLUS $1'],
    [/LESS(\d)/gi, 'LESS $1'],
  ];
  for (const [re, rep] of pairs) s = s.replace(re, rep);
  return s;
}

function statementMonthFromText(text: string): string | undefined {
  const named = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  );
  if (named) return `${named[1]} ${named[2]}`;
  const range = text.match(
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*(?:through|thru|to|[–-])\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i,
  );
  if (range) {
    const y = range[6].length === 2 ? `20${range[6]}` : range[6];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mi = Number(range[4]) - 1;
    if (mi >= 0 && mi < 12) return `${months[mi]} ${y}`;
  }
  return undefined;
}

function largestDepositFromLines(text: string): string | undefined {
  let max = 0;
  for (const line of text.split('\n')) {
    if (!/deposit/i.test(line)) continue;
    if (/total(?:ing)?|summary|credits\s*:/i.test(line)) continue;
    const amounts = [...line.matchAll(/-?[\d,]+\.\d{2}/g)].map(m => Number(m[0].replace(/,/g, '')));
    for (const n of amounts) {
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max > 0 ? String(max) : undefined;
}

/** Label on one line, $ amount on the same line or the next. */
function amountByLabel(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!label.test(line)) continue;
    const same = line.match(new RegExp(MONEY, 'i'));
    if (same) return money(same[1]);
    const next = (lines[i + 1] || '').match(new RegExp(`^${MONEY}$`, 'i'));
    if (next) return money(next[1]);
  }
  return undefined;
}

function fromLabeledLines(text: string): Record<string, string> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  const opening = amountByLabel(lines, /(?:previous|beginning|opening|start(?:ing)?)\s+balance/i);
  const ending = amountByLabel(lines, /(?:new|ending|closing|present|ending\s+ledger)\s+balance/i);
  const deposits = amountByLabel(lines, /(?:total\s+)?deposits?(?:\s*(?:\/|,)?\s*other\s+credits)?(?:\s+and\s+(?:other\s+)?(?:additions|credits))?|total\s+credits|deposits?\s+and\s+additions/i);
  const withdrawals = amountByLabel(lines, /(?:total\s+)?withdrawals?(?:\s*(?:\/|,)?\s*(?:other\s+)?debits)?|total\s+debits|withdrawals?\s+and\s+(?:other\s+)?subtractions/i);
  if (opening) out.openingBalance = opening;
  if (ending) out.endingBalance = ending;
  if (deposits) {
    out.totalDeposits = deposits;
    out.monthlyRevenue = deposits;
  }
  if (withdrawals) out.totalWithdrawals = withdrawals;
  return out;
}

export function extractBankMetricsFromText(raw: string): Record<string, string> {
  const text = unglueBankText(raw || '');
  if (text.replace(/\s/g, '').length < 20) return {};
  const out: Record<string, string> = {};

  const opening = first(text, [
    new RegExp(`(?:PREVIOUS|BEGINNING|OPENING|STARTING)\\s+BALANCE\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`${MONEY}\\s*(?:PREVIOUS|BEGINNING|OPENING)\\s+BALANCE`, 'i'),
  ]);
  const openingAmt = captureMoney(opening);
  if (openingAmt) out.openingBalance = openingAmt;

  const ending = first(text, [
    new RegExp(`(?:NEW|ENDING|CLOSING|PRESENT)\\s+BALANCE\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`${MONEY}\\s*(?:NEW|ENDING|CLOSING)\\s+BALANCE`, 'i'),
  ]);
  const endingAmt = captureMoney(ending);
  if (endingAmt) out.endingBalance = endingAmt;

  const deposits = first(text, [
    new RegExp(`PLUS\\s+(\\d+)\\s+DEPOSITS?[\\s\\S]{0,90}?TOTAL(?:ING)?\\s*${MONEY}`, 'i'),
    new RegExp(`DEPOSITS?(?:\\s*\\/?\\s*OTHER\\s+CREDITS)?\\s*[:\\s]*\\(\\s*(\\d+)\\s*TOTAL(?:ING)?\\s*${MONEY}`, 'i'),
    new RegExp(`DEPOSITS?(?:\\s*\\/?\\s*OTHER\\s+CREDITS)?[^\\d\\-\\n$]{0,40}(\\d+)\\s*TOTAL(?:ING)?\\s*${MONEY}`, 'i'),
    new RegExp(`(?:TOTAL\\s+)?DEPOSITS?(?:\\s*(?:\\/|,)?\\s*OTHER\\s+CREDITS)?(?:\\s+AND\\s+(?:OTHER\\s+)?(?:ADDITIONS|CREDITS))?\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`DEPOSITS?\\s+AND\\s+ADDITIONS\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`TOTAL\\s+CREDITS\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`${MONEY}\\s*(?:TOTAL\\s+)?DEPOSITS?(?:\\s+AND\\s+ADDITIONS)?`, 'i'),
  ]);
  if (deposits) {
    const count = deposits[1] && /^\d+$/.test(deposits[1]) && !deposits[1].includes('.') ? deposits[1] : undefined;
    const amt = captureMoney(deposits);
    if (amt) {
      out.totalDeposits = amt;
      out.monthlyRevenue = amt;
    }
    if (count && Number(count) < 500) out.depositCount = count;
  }

  const withdrawals = first(text, [
    new RegExp(`LESS\\s+(\\d+)\\s+OTHER\\s+WITHDRAWALS?[\\s\\S]{0,90}?TOTAL(?:ING)?\\s*${MONEY}`, 'i'),
    new RegExp(`OTHER\\s+WITHDRAWALS?(?:\\s*\\/?\\s*DEBITS)?[\\s\\S]{0,60}?TOTAL(?:ING)?\\s*${MONEY}`, 'i'),
    new RegExp(`(?:TOTAL\\s+)?WITHDRAWALS?(?:\\s*(?:\\/|,)?\\s*(?:OTHER\\s+)?DEBITS)?\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`TOTAL\\s+DEBITS\\s*[:\\s]*${MONEY}`, 'i'),
    new RegExp(`WITHDRAWALS?\\s+AND\\s+(?:OTHER\\s+)?SUBTRACTIONS\\s*[:\\s]*${MONEY}`, 'i'),
  ]);
  const wd = captureMoney(withdrawals);
  if (wd) out.totalWithdrawals = wd;

  const lined = fromLabeledLines(text);
  if (!out.openingBalance && lined.openingBalance) out.openingBalance = lined.openingBalance;
  if (!out.endingBalance && lined.endingBalance) out.endingBalance = lined.endingBalance;
  if (!out.totalDeposits && lined.totalDeposits) {
    out.totalDeposits = lined.totalDeposits;
    out.monthlyRevenue = lined.monthlyRevenue || lined.totalDeposits;
  }
  if (!out.totalWithdrawals && lined.totalWithdrawals) out.totalWithdrawals = lined.totalWithdrawals;

  const nsf = first(text, [
    new RegExp(`TOTAL\\s+RETURNED\\s+ITEM\\s+FEES?\\s*[|\\s]+${MONEY}`, 'i'),
    new RegExp(`RETURNED\\s+ITEM\\s+FEES?\\s*[:\\s|]*${MONEY}`, 'i'),
  ]);
  if (nsf && captureMoney(nsf) === '0') out.nsfCount = '0';

  const month = statementMonthFromText(text);
  if (month) out.statementMonth = month;

  const largest = largestDepositFromLines(text);
  if (largest) out.largestDeposit = largest;

  if (out.openingBalance && out.endingBalance && !out.avgDailyBalance) {
    const a = Number(out.openingBalance);
    const b = Number(out.endingBalance);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      out.avgDailyBalance = String(Math.round(((a + b) / 2) * 100) / 100);
    }
  }

  return out;
}

export { MONEY_ONLY };
