/**
 * Run: npx tsx scripts/send-accounts.test.ts
 */
import {
  pickSendConnection,
  signatureFor,
  toSendAccountOptions,
} from '../src/lib/email/sendAccounts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const a = {
  id: 'a',
  provider: 'gmail',
  from_email: 'bob@one.com',
  from_name: 'Bob One',
  email_signature: 'Sig A',
  access_token: 'tok',
};
const b = {
  id: 'b',
  provider: 'gmail',
  from_email: 'bob@two.com',
  from_name: 'Bob Two',
  email_signature: 'Sig B',
  access_token: 'tok',
};

assert(pickSendConnection([a, b], 'b')?.id === 'b', 'preferred mailbox wins');
assert(pickSendConnection([a, b], 'b', 'a')?.id === 'a', 'requested mailbox wins over preferred');
assert(signatureFor(b, 'fallback') === 'Sig B', 'per-mailbox signature');
assert(signatureFor({ id: 'x', provider: 'gmail', access_token: 't' }, 'fallback') === 'fallback', 'falls back to user signature');

const opts = toSendAccountOptions([a, b], { preferredId: 'a' });
assert(opts.length === 2, 'lists both send accounts');
assert(opts[0].preferred && !opts[1].preferred, 'marks preferred');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('send-accounts tests passed');
