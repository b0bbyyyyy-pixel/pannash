/**
 * Inbound caller block matching.
 * Run: npx tsx scripts/block-caller.test.ts
 */
import { phoneOnBlockList } from '../src/lib/telephony/blockMatch';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const blocked = ['+15551234567'];
assert(phoneOnBlockList('+15551234567', blocked), 'exact e164');
assert(phoneOnBlockList('5551234567', blocked), '10-digit matches e164');
assert(phoneOnBlockList('(555) 123-4567', blocked), 'formatted matches e164');
assert(phoneOnBlockList('15551234567', blocked), '11-digit matches e164');
assert(!phoneOnBlockList('+15557654321', blocked), 'other number is not blocked');
assert(!phoneOnBlockList('', blocked), 'empty is not blocked');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('block-caller tests passed');
