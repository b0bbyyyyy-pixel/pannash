/**
 * Merchant portal helpers.
 * Run: npx tsx scripts/merchant-portal.test.ts
 */
import { createHash } from 'crypto';
import { DEFAULT_STAGE_MAP, mapLeadStatus, resolveMerchantStage } from '../src/lib/merchantPortal/stages';
import { maskEin, maskSsn } from '../src/lib/merchantPortal/mask';
import { equalHex, hashToken } from '../src/lib/merchantPortal/tokens';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(maskSsn('123-45-6789') === '•••-••-6789', 'ssn last 4');
assert(maskEin('12-3456789') === '••-•••6789', 'ein last 4');
assert(maskSsn('') === '', 'empty ssn');
assert(mapLeadStatus('New Lead') === 'Received', 'new lead received');
assert(mapLeadStatus('Docs Requested') === 'Docs needed', 'docs requested');
assert(mapLeadStatus('Something invented') === 'Reviewing', 'unknown reviewing');
assert(DEFAULT_STAGE_MAP['funded'] === 'Funded', 'funded default');
assert(resolveMerchantStage({ leadStatus: 'Contacted', hasActiveOffer: true }) === 'Offers ready', 'offer wins');
assert(resolveMerchantStage({ leadStatus: 'Declined', hasActiveOffer: true }) === 'Closed', 'closed stays closed');
assert(resolveMerchantStage({ leadStatus: 'Contacted', hasPartnerSubmission: true }) === 'Submitted to partners', 'submission');

const raw = 'abc';
const hashed = hashToken(raw);
assert(hashed === createHash('sha256').update(raw, 'utf8').digest('hex'), 'sha256');
assert(equalHex(hashed, hashed), 'timing equal');
assert(!equalHex(hashed, hashToken('nope')), 'timing unequal');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
