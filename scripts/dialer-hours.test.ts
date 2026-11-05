/**
 * Dialer calling-hours / timezone compliance.
 * Run: npx tsx scripts/dialer-hours.test.ts
 */
import {
  callingTimezone,
  isEligible,
  isWithinDialingHours,
  type DialerLeadShape,
} from '../src/lib/dialer/canDial';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

function lead(over: Partial<DialerLeadShape> & { phone_e164: string }): DialerLeadShape {
  return {
    dnc: false,
    dialer_status: null,
    next_eligible_at: null,
    locked_by: null,
    locked_at: null,
    attempts_today: 0,
    attempts_today_on: null,
    timezone: null,
    ...over,
  };
}

// Thursday Nov 5 2026 is PST (DST ended Nov 1). 6:53 AM PT = 9:53 AM ET.
const AM653_PT = new Date('2026-11-05T14:53:00.000Z');
const AM800_PT = new Date('2026-11-05T16:00:00.000Z');
const AM830_PT = new Date('2026-11-05T16:30:00.000Z');
const AM900_PT = new Date('2026-11-05T17:00:00.000Z');
const PM859_PT = new Date('2026-11-06T04:59:00.000Z');
const PM900_PT = new Date('2026-11-06T05:00:00.000Z');
const AM830_ET = new Date('2026-11-05T13:30:00.000Z');
const AM730_ET = new Date('2026-11-05T12:30:00.000Z');

const CA = lead({ phone_e164: '+19514960720' }); // Riverside 951
const NY = lead({ phone_e164: '+12125551212' }); // Manhattan 212
const storedCA = lead({ phone_e164: '+15555551212', timezone: 'America/Los_Angeles' });
const unknown = lead({ phone_e164: '+9995551234' });

assert(callingTimezone(CA) === 'America/Los_Angeles', '951 area code → Los Angeles');
assert(callingTimezone(NY) === 'America/New_York', '212 area code → New York');
assert(callingTimezone(storedCA) === 'America/Los_Angeles', 'stored IANA timezone wins');
assert(
  callingTimezone(lead({ phone_e164: '+19514960720', timezone: 'PST' })) === 'America/Los_Angeles',
  'invalid stored tz falls back to area code'
);
assert(callingTimezone(unknown) === null, 'unknown NANP zone is null (do not guess ET)');

assert(
  !isWithinDialingHours(null, undefined, undefined, AM653_PT),
  'null timezone is never in window (old bug defaulted to ET)'
);
assert(
  !isWithinDialingHours('America/Los_Angeles', undefined, undefined, AM653_PT),
  '6:53 AM Pacific is outside TCPA window'
);
assert(
  isWithinDialingHours('America/New_York', undefined, undefined, AM653_PT),
  'same instant is 9:53 AM Eastern — in window'
);
assert(
  isWithinDialingHours('America/Los_Angeles', undefined, undefined, AM800_PT),
  '8:00 AM Pacific is in TCPA window'
);
assert(
  !isWithinDialingHours('America/Los_Angeles', undefined, undefined, PM900_PT),
  '9:00 PM Pacific is not in window (end exclusive)'
);
assert(
  isWithinDialingHours('America/Los_Angeles', undefined, undefined, PM859_PT),
  '8:59 PM Pacific is still in window'
);

assert(!isEligible(CA, { at: AM653_PT }), 'auto-queue skips CA at 6:53 AM local (no tz on lead)');
assert(isEligible(NY, { at: AM653_PT }), 'auto-queue still offers NY at 9:53 AM local');
assert(!isEligible(storedCA, { at: AM653_PT }), 'stored Pacific tz also skipped at 6:53 AM');
assert(isEligible(CA, { at: AM900_PT }), 'CA is eligible at 9:00 AM local');
assert(!isEligible(unknown, { at: AM900_PT }), 'unknown timezone is not auto-dialed');

assert(
  !isEligible(CA, { at: AM830_PT, windowStart: '09:00', windowEnd: '20:00' }),
  'user 9am–8pm window skips CA at 8:30 AM even though TCPA allows 8am'
);
assert(
  !isEligible(NY, { at: AM830_ET, windowStart: '09:00', windowEnd: '20:00' }),
  'user 9am window skips NY at 8:30 AM ET'
);
assert(
  !isEligible(NY, { at: AM730_ET, windowStart: '07:00', windowEnd: '22:00' }),
  'TCPA clamp blocks 7:30 AM even if user window starts at 7am'
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
