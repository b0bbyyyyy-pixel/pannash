/**
 * Sheet import must keep each row's identity with that row's phone.
 * Run: npx tsx scripts/sheet-lead-identity.test.ts
 */
import { mergeSheetLead, preferRowValue } from '../src/lib/import/extractSheetLead';
import { groupDuplicateLeads } from '../src/lib/inbox/dedupeInboxLeads';
import { isSamePersonLead } from '../src/lib/leads/phone';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const webcorpRow = [
  '2026-10-28 15',
  'Webcorp, INC',
  'Tj Kirgin',
  '10665 Stonecast Saint Paul',
  'Saint Paul',
  '3145812408',
  '33160',
  'Tj',
  'Kirgin',
  '437-04-2476',
  '(636) 379-6994',
  '1974-05-04',
];

const mixed = mergeSheetLead({
  name: 'Christopher Kyte',
  company: 'Uncommon Journeys LLC',
  email: 'ckyte@uncommonjourneys.com',
  phone: '3145812408',
}, webcorpRow);

assert(mixed.company === 'Webcorp, INC', `company stayed Webcorp, got ${mixed.company}`);
assert(mixed.name === 'Tj Kirgin', `name stayed Tj Kirgin, got ${mixed.name}`);
assert(String(mixed.phone).replace(/\D/g, '').endsWith('3145812408'), `phone stayed 3145812408, got ${mixed.phone}`);

assert(
  preferRowValue('Christopher Kyte', 'Tj Kirgin', webcorpRow.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ')) === 'Tj Kirgin',
  'preferRowValue uses the row name',
);

assert(
  !isSamePersonLead(
    { name: 'Christopher Kyte', company: 'Uncommon Journeys LLC', phone: '7602182377' },
    { name: 'Christopher Kyte', company: 'Uncommon Journeys LLC', phone: '3145812408' },
  ),
  'two real phone numbers are not the same person',
);

assert(
  isSamePersonLead(
    { name: 'Christopher Kyte', company: 'Uncommon Journeys LLC', phone: '7602182377' },
    { name: 'Christopher Kyte', company: 'Uncommon Journeys LLC', phone: '760-218-2377' },
  ),
  'same number still groups',
);

const grouped = groupDuplicateLeads([
  { id: 'a', name: 'Christopher Kyte', company: 'Uncommon Journeys LLC', phone: '7602182377' },
  { id: 'b', name: 'Christopher Kyte', company: 'Uncommon Journeys LLC', phone: '3145812408' },
]);
assert(grouped.length === 2, `inbox keeps two threads, got ${grouped.length}`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
