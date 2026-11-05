/**
 * Webphone lock — only one tab should register as Twilio client:agent.
 * Run: npx tsx scripts/webphone-lock.test.ts
 */
import {
  isPhoneBrowser,
  parseWebphoneLock,
  shouldTakeWebphoneLock,
} from '../src/lib/telephony/webphoneLock';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(parseWebphoneLock(null) === null, 'empty lock');
assert(parseWebphoneLock('{') === null, 'bad json');
assert(parseWebphoneLock(JSON.stringify({ id: 'a', at: 1 }))?.id === 'a', 'parses lock');

const now = 10_000;
assert(shouldTakeWebphoneLock({ mine: 'me', existing: null, now, steal: false }), 'empty is takeable');
assert(shouldTakeWebphoneLock({
  mine: 'me',
  existing: { id: 'me', at: now },
  now,
  steal: false,
}), 'owner keeps lock');
assert(!shouldTakeWebphoneLock({
  mine: 'me',
  existing: { id: 'other', at: now },
  now,
  steal: false,
}), 'fresh other tab is left alone');
assert(shouldTakeWebphoneLock({
  mine: 'me',
  existing: { id: 'other', at: now },
  now,
  steal: true,
}), 'focus steals');
assert(shouldTakeWebphoneLock({
  mine: 'me',
  existing: { id: 'other', at: now - 9_000 },
  now,
  steal: false,
}), 'stale other tab is takeable');

assert(isPhoneBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'iphone');
assert(isPhoneBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), 'android mobile');
assert(!isPhoneBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop mac');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
