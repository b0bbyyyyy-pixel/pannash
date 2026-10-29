/**
 * MCA bank-statement fingerprints: named funders, NACHA truncations,
 * Orig CO Name glue, recurring ACH, and false-positive filters.
 * Run: npx tsx scripts/mca-positions.test.ts
 */
import { extractBankMetricsFromText } from '../src/lib/pdf/extractBankMetrics';
import { extractMcaPositionsFromText } from '../src/lib/pdf/extractMcaPositions';
import { mergeParsedFieldMaps } from '../src/lib/normalizeParsedFields';
import { parseMcaPositions } from '../src/lib/bankAnalyzer';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

function daily(name: string, amount: string, n: number, fmt: (i: number, name: string, amount: string) => string): string {
  return Array.from({ length: n }, (_, i) => fmt(i, name, amount)).join('\n');
}

const chase = daily('RAPID FINANCE', '185.50', 16, (i, name, amount) => {
  const d = String((i % 20) + 1).padStart(2, '0');
  return `03/${d}  ACH WITHDRAWAL                    ${amount}\nOrig CO Name: ${name}`;
});

const wells = daily('Rapid Finance', '185.50', 14, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} ACH Pmt ${name}           -${amount}`);

const boaPpd = daily('RAPIDFINANCE', '185.50', 15, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} Electronic Withdrawal ${name} PPD ID: 1234567890  ${amount}`);

const nachaTrunc = daily('NATIONAL FUNDI', '412.00', 12, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} ACH DEBIT ${name}  ${amount}`);

const kapitus = daily('STRATEGIC FUNDI', '275.00', 4, (i, name, amount) =>
  `03/${String(i * 7 + 3).padStart(2, '0')} ACH Withdrawal ${name}  ${amount}`);

const cfgms = daily('CFGMS', '330.25', 13, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} ACH ${name} CCD  (${amount})`);

const forward = daily('FORWARDFIN', '198.00', 11, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} ACH WITHDRAWAL ${name} ${amount}`);

const everest = daily('EVEREST BUS FDG', '150.00', 10, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} Preauthorized ACH ${name} ${amount}`);

const amazonLending = daily('AMZN LENDING', '90.00', 12, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} ACH DEBIT ${name} ${amount}`);

const amazonShop = daily('AMAZON.COM', '54.99', 12, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} DEBIT CARD ${name} ${amount}`);

const payroll = daily('ADP PAYROLL', '4200.00', 4, (i, name, amount) =>
  `03/${String(i * 7 + 1).padStart(2, '0')} ACH ${name} ${amount}`);

const unknownDaily = daily('ACH WITHDRAWAL', '167.40', 18, (i, name, amount) =>
  `03/${String((i % 20) + 1).padStart(2, '0')} ${name} ${amount}`);

const stacked = [
  chase,
  kapitus,
  cfgms,
  '03/04  DEBIT CARD AMAZON.COM  32.11',
  '03/05  ACH ADP PAYROLL  3800.00',
].join('\n');

function lenders(text: string): string[] {
  return extractMcaPositionsFromText(text).map(p => p.lender.toLowerCase());
}

function hasFunder(text: string, needle: string): boolean {
  return lenders(text).some(n => n.includes(needle.toLowerCase()));
}

assert(hasFunder(chase, 'rapid'), 'Chase Orig CO Name Rapid Finance');
assert(extractMcaPositionsFromText(chase)[0]?.payment === 185.5, 'Chase repeating debit amount');
assert(extractMcaPositionsFromText(chase)[0]?.frequency === 'daily', 'Chase daily cadence');

assert(hasFunder(wells, 'rapid'), 'Wells ACH Pmt Rapid Finance');
assert(hasFunder(boaPpd, 'rapid'), 'Bank of America PPD RapidFinance');
assert(hasFunder(nachaTrunc, 'national'), 'NACHA truncation NATIONAL FUNDI');
assert(hasFunder(kapitus, 'kapitus'), 'Strategic Funding truncation is Kapitus');
assert(extractMcaPositionsFromText(kapitus)[0]?.frequency === 'weekly', 'Weekly Strategic cadence');
assert(hasFunder(cfgms, 'cfg'), 'CFGMS servicer');
assert(hasFunder(forward, 'forward'), 'FORWARDFIN truncation');
assert(hasFunder(everest, 'everest'), 'EVEREST BUS FDG');
assert(hasFunder(amazonLending, 'amazon'), 'Amazon Lending is a position');
assert(!hasFunder(amazonShop, 'amazon'), 'Amazon.com purchases are not MCA');
assert(lenders(payroll).length === 0, 'ADP payroll is not MCA');
assert(extractMcaPositionsFromText(unknownDaily).some(p => p.payment === 167.4), 'Unknown daily ACH same amount');

const multi = extractMcaPositionsFromText(stacked);
assert(multi.length >= 2, `stacked statement has multiple positions, got ${multi.length}`);
assert(multi.some(p => /rapid/i.test(p.lender)), 'stacked includes Rapid');
assert(multi.some(p => /kapitus|cfg/i.test(p.lender)), 'stacked includes Kapitus or CFG');

const fromMetrics = extractBankMetricsFromText(`Beginning Balance 12000.00\nTotal Deposits 45000.00\n${chase}`);
assert(fromMetrics.hasOtherMCALoans === 'true', 'extractBankMetricsFromText sets hasOtherMCALoans');
const metricPos = parseMcaPositions(fromMetrics.mcaPositions);
assert(metricPos.some(p => /rapid/i.test(p.lender)), 'extractBankMetricsFromText includes Rapid');

const merged = mergeParsedFieldMaps(
  { monthlyRevenue: '45000', mcaPositions: '[]', hasOtherMCALoans: 'false' },
  fromMetrics,
);
assert(parseMcaPositions(merged.mcaPositions).some(p => /rapid/i.test(p.lender)), 'mergeParsedFieldMaps unions MCA over empty AI array');
assert(merged.hasOtherMCALoans === 'true', 'merge sets hasOtherMCALoans when positions exist');

const hitCount = [
  chase, wells, boaPpd, nachaTrunc, kapitus, cfgms, forward, everest, amazonLending, unknownDaily,
].filter(t => extractMcaPositionsFromText(t).length > 0).length;
assert(hitCount >= 9, `typical MCA fingerprints ${hitCount}/10 (>=9)`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
