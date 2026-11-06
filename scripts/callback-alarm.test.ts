/**
 * Callback timers land in an hour / tomorrow, not as an auto-text.
 * Run: npx tsx scripts/callback-alarm.test.ts
 */
import {
  CALLBACK_TIMERS,
  callbackTitle,
  followUpDueFromMinutes,
  followUpDueTomorrow,
  resolveFollowUpDue,
} from '../src/lib/lead-follow-up';
import { atTimePingSchedule, pingLeadLabel } from '../src/lib/casper/calendarPingSchedule';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const now = new Date('2026-11-06T15:20:00');

const hour = followUpDueFromMinutes(60, now);
assert(hour.getTime() - now.getTime() === 60 * 60_000, '1 hour is 60 minutes from now');

const tomorrow = followUpDueTomorrow(now);
assert(tomorrow.getDate() === 7, 'tomorrow is next calendar day');
assert(tomorrow.getHours() === 10 && tomorrow.getMinutes() === 0, 'tomorrow lands at 10:00');

assert(resolveFollowUpDue({ timerId: '1_hour', now })?.getTime() === hour.getTime(), 'resolve 1_hour');
assert(resolveFollowUpDue({ timerId: 'tomorrow', now })?.getTime() === tomorrow.getTime(), 'resolve tomorrow');
assert(CALLBACK_TIMERS.some(t => t.id === '1_hour'), '1 hour preset exists');

assert(callbackTitle({ company: 'JT SMITH LLC' }) === 'Call back — JT SMITH LLC', 'callback title uses company');

const sched = atTimePingSchedule(hour);
assert(sched.offsets[0] === 0 && sched.times['0'] === hour.toISOString(), 'ping fires at the due time');
assert(pingLeadLabel(0) === 'now', 'at-time ping is labeled now');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
