/**
 * Campaign RESPONSE counts real SMS replies, not last_direction.
 * Run: npx tsx scripts/campaign-reply-ids.test.ts
 */
import {
  convLooksInbound,
  expandRepliedByPhone,
} from '../src/lib/smsDrip/campaignReplyIds';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(
  convLooksInbound({ last_inbound_at: '2026-11-05T18:35:00Z', last_direction: 'outbound' }),
  'owner follow-up after a reply still counts',
);
assert(
  convLooksInbound({ last_inbound_at: null, last_direction: 'inbound' }),
  'last inbound message counts',
);
assert(
  !convLooksInbound({ last_inbound_at: null, last_direction: 'outbound' }),
  'outbound-only thread is not a reply',
);

const campaignLead = { id: 'list-copy', phone: '(530) 953-6231' };
const inboundLeadIds = new Set(['pipeline-copy']);
const inboundPhones = new Set(['5309536231']);
const replied = expandRepliedByPhone({
  leads: [campaignLead, { id: 'other', phone: '2125550100' }],
  inboundLeadIds,
  inboundPhones,
});
assert(replied.has('list-copy'), 'same-phone pipeline copy counts on the campaign row');
assert(!replied.has('other'), 'unrelated phone is not a reply');

const sameId = expandRepliedByPhone({
  leads: [{ id: 'pipeline-copy', phone: '+15309536231' }],
  inboundLeadIds,
  inboundPhones: new Set(),
});
assert(sameId.has('pipeline-copy'), 'direct lead id match still counts');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
