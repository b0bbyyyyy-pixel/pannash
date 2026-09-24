import { writeFileSync } from 'fs';
import { buildFundingApplication } from '../src/lib/fundingApplication';
import { buildFundingApplicationPdf } from '../src/lib/fundingApplicationPdf';

const complete = {
  name: 'Kamal Goundar',
  email: 'Kishan0101@hotmail.com',
  phone: '2069480822',
  company: 'Goundars Transport Iic',
  value: 50000,
  underwriting_data: {
    dba: '',
    businessAddress: '5918 Scenic Drive Northeast',
    businessCity: 'Tacoma',
    businessState: 'WA',
    businessZip: '98422',
    businessPhone: '2069480822',
    ein: '46-3022207',
    businessStartDate: '2020-01-02',
    entityType: 'LLC',
    industry: 'Junk Removal / Waste Management',
    purposeOfFunds: 'Working Capital',
    monthlyRevenue: 20000,
    homeAddress: '5918 Scenic Dr NE',
    city: 'Tacoma',
    state: 'WA',
    zip: '98422',
    ssn: '000-00-0000',
    dob: '1980-01-01',
    ownershipPercent: '100',
  },
};

const { data, missing } = buildFundingApplication(complete);
console.log('complete missing:', missing.length ? missing.join(', ') : 'none');
console.log('annualRevenue', data.annualRevenue, 'requested', data.requestedAmount, 'credit', data.owner1Credit);

const empty = buildFundingApplication({ name: 'Test', email: '', company: '' });
console.log('empty missing count:', empty.missing.length);
console.log(empty.missing.join('\n'));

async function main() {
  const bytes = await buildFundingApplicationPdf(data, {
    signedAt: new Date('2026-09-24T16:00:00'),
    ip: '240.82.49.22',
  });
  writeFileSync('/tmp/abf-application-check.pdf', Buffer.from(bytes));
  console.log('wrote /tmp/abf-application-check.pdf', bytes.byteLength, 'bytes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
