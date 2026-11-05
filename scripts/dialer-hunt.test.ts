/**
 * Hunt-mode AMD classification.
 * Run: npx tsx scripts/dialer-hunt.test.ts
 */
import { huntVerdict, isHumanAnsweredBy, isMachineAnsweredBy } from '../src/lib/dialer/hunt';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(isMachineAnsweredBy('machine_start'), 'machine_start is machine');
assert(isMachineAnsweredBy('machine_end_beep'), 'machine_end_beep is machine');
assert(isMachineAnsweredBy('fax'), 'fax is machine');
assert(!isMachineAnsweredBy('human'), 'human is not machine');
assert(isHumanAnsweredBy('human'), 'human');
assert(isHumanAnsweredBy('unknown'), 'unknown treated as human so we do not drop a person');

assert(huntVerdict({ answered_by: 'human' }) === 'human', 'human → hand off');
assert(huntVerdict({ answering_machine: false }) === 'human', 'flag false → hand off');
assert(huntVerdict({ answered_by: 'machine_start' }) === 'voicemail', 'machine → skip VM');
assert(huntVerdict({ answering_machine: true }) === 'voicemail', 'flag true → skip VM');
assert(huntVerdict({ status: 'busy' }) === 'busy', 'busy');
assert(huntVerdict({ status: 'no-answer' }) === 'no_answer', 'no-answer');
assert(huntVerdict({ status: 'completed' }) === 'no_answer', 'completed with no pickup → no_answer');
assert(huntVerdict({ status: 'in_progress' }) === 'wait', 'in progress, no AMD yet → wait');
assert(
  huntVerdict({
    answered_at: new Date(Date.now() - 2000).toISOString(),
    status: 'in_progress',
  }) === 'wait',
  'just answered, AMD pending → wait'
);
assert(
  huntVerdict({
    answered_at: new Date(Date.now() - 9000).toISOString(),
    status: 'in_progress',
  }) === 'human',
  'answered 8s+ with no AMD → hand off (do not drop)'
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
