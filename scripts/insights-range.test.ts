/**
 * Campaign insights date windows.
 * Run: npx tsx scripts/insights-range.test.ts
 */
import {
  currentZonedMonth,
  inInsightsRange,
  insightsTally,
  isSuccessfulDripStatus,
  monthLabel,
  monthRange,
  parseInsightsRange,
  zonedWallToIso,
} from '../src/lib/smsDrip/insightsRange';
import { buildOutboundCsv, csvEscape } from '../src/lib/smsDrip/insightsData';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const tz = 'America/New_York';
const now = new Date('2026-11-03T14:00:00.000Z');

const days30 = parseInsightsRange({ days: '30', tz, now });
assert(days30.days === 30, 'last 30 days count');
assert(days30.label === 'Last 30 days', 'last 30 days label');
assert(!!days30.since && days30.since < now.toISOString(), 'last 30 days has since');
assert(days30.until == null, 'rolling window has no until');

const all = parseInsightsRange({ days: 'all', tz, now });
assert(all.since == null && all.until == null, 'all time is unbounded');
assert(all.label === 'All time', 'all time label');

const nov = parseInsightsRange({ month: '2026-11', tz, now });
assert(nov.label === 'November 2026', 'november label');
assert(nov.month === '2026-11', 'november key');
assert(nov.since === zonedWallToIso(2026, 11, 1, 0, 0, tz), 'november start');
assert(nov.until === zonedWallToIso(2026, 12, 1, 0, 0, tz), 'november end');

const thisMonth = parseInsightsRange({ days: 'month', tz, now });
assert(thisMonth.month === currentZonedMonth(tz, now), 'this month uses zoned calendar');
assert(thisMonth.label === 'November 2026', 'this month label in November');

const oct = monthRange('2026-10', tz);
assert(oct?.label === 'October 2026', 'october label');
assert(inInsightsRange(oct!.since, oct!), 'start is inside month');
assert(!inInsightsRange(oct!.until, oct!), 'next month start is exclusive');
assert(monthLabel('2026-01') === 'January 2026', 'january label');

assert(isSuccessfulDripStatus('sent'), 'sent is successful');
assert(isSuccessfulDripStatus('replied'), 'replied still counts as sent');
assert(!isSuccessfulDripStatus('failed'), 'failed is not successful');
assert(!isSuccessfulDripStatus('skipped_dnc'), 'skipped is not successful');

const tally = insightsTally([
  { sms_status: 'sent' },
  { sms_status: 'delivered' },
  { sms_status: 'replied' },
  { sms_status: 'failed' },
  { sms_status: 'skipped_dup' },
  { sms_status: 'queued' },
]);
assert(tally.sent === 3, 'tally counts replied as sent');
assert(tally.failed === 1, 'tally failed');
assert(tally.skipped === 1, 'tally skipped excludes replied');
assert(tally.pending === 1, 'tally pending');

assert(csvEscape('Acme, Inc') === '"Acme, Inc"', 'csv quotes comma');
assert(csvEscape('He said "hi"') === '"He said ""hi"""', 'csv escapes quotes');
const csv = buildOutboundCsv([
  { lead_id: '1', phone: '5551112222', company: 'Acme', sentAt: '11/01/2026, 01:00 PM', replied: true },
  { lead_id: '2', phone: '5553334444', company: 'Beta', sentAt: '11/02/2026, 02:00 PM', replied: false },
]);
assert(csv.includes('phone,business_name,date_sent,replied'), 'csv header');
assert(csv.includes('5551112222,Acme,'), 'csv phone and business');
assert(csv.includes('yes') && csv.includes('no'), 'csv replied flags');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('insights-range tests passed');
