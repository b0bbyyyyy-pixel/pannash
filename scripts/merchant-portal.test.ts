/**
 * Merchant portal helpers.
 * Run: npx tsx scripts/merchant-portal.test.ts
 */
import { createHash } from 'crypto';
import { isPortalHost, isPortalPublicPath, portalHostsFromEnv, portalRequestHost } from '../src/lib/merchantPortal/hosts';
import { maskEin, maskSsn } from '../src/lib/merchantPortal/mask';
import { normalizePortalDomain } from '../src/lib/merchantPortal/origin';
import { DEFAULT_STAGE_MAP, mapLeadStatus, resolveMerchantStage } from '../src/lib/merchantPortal/stages';
import { equalHex, hashToken, merchantLoginUrl, merchantPortalUrl } from '../src/lib/merchantPortal/tokens';

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

const origin = 'https://portal.example.test';
assert(normalizePortalDomain('').ok && (normalizePortalDomain('') as { value: string | null }).value === null, 'empty domain');
assert(normalizePortalDomain(`${origin}/`).ok && (normalizePortalDomain(`${origin}/`) as { value: string | null }).value === origin, 'strip slash');
assert(!normalizePortalDomain('http://portal.example.test').ok, 'reject http');
assert(!normalizePortalDomain(`${origin}/app`).ok, 'reject path');
assert(merchantPortalUrl('tok', origin) === `${origin}/merchant/tok`, 'portal url origin');
assert(merchantLoginUrl(origin) === `${origin}/merchant/login`, 'login url origin');
assert(portalHostsFromEnv(` ${origin}, other.test `).includes('portal.example.test'), 'hosts env');
assert(isPortalHost('portal.example.test:443', origin), 'host match');
assert(!isPortalHost('app.example.test', origin), 'host miss');
assert(isPortalPublicPath('/merchant/login'), 'allow merchant');
assert(isPortalPublicPath('/api/merchant/login'), 'allow merchant api');
assert(isPortalPublicPath('/portal/abc'), 'allow offer portal');
assert(isPortalPublicPath('/api/portal/abc/log'), 'allow offer api');
assert(isPortalPublicPath('/robots.txt'), 'allow robots');
assert(!isPortalPublicPath('/dashboard'), 'block crm');
assert(!isPortalPublicPath('/api/telephony/token'), 'block other api');
assert(!isPortalPublicPath('/login'), 'block login');
assert(
  portalRequestHost({
    headers: { get: (n) => (n === 'x-forwarded-host' ? 'Portal.Example.test:443, vercel.app' : 'ignored.host') },
    nextUrl: { hostname: 'wrong.vercel.app' },
  }) === 'portal.example.test',
  'xfh host',
);
assert(
  portalRequestHost({
    headers: { get: (n) => (n === 'host' ? 'portal.example.test' : null) },
    nextUrl: { hostname: 'wrong.vercel.app' },
  }) === 'portal.example.test',
  'host header',
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
