import { pickDialerCallerId } from '../src/lib/dialerCallerId';

const FALLBACK = '+16318922787';

const leads: { label: string; npa: string; phone: string }[] = [
  { label: '213 Los Angeles', npa: '213', phone: '+12135550123' },
  { label: '619 San Diego', npa: '619', phone: '+16195550123' },
  { label: '214 Dallas', npa: '214', phone: '+12145550123' },
  { label: '713 Houston', npa: '713', phone: '+17135550123' },
  { label: '786 Miami', npa: '786', phone: '+17865550123' },
  { label: '215 Philadelphia', npa: '215', phone: '+12155550123' },
  { label: '212 NYC', npa: '212', phone: '+12125550123' },
  { label: '312 Chicago', npa: '312', phone: '+13125550123' },
  { label: '602 Phoenix', npa: '602', phone: '+16025550123' },
  { label: '303 Denver', npa: '303', phone: '+13035550123' },
];

const expectedNpa: Record<string, string> = {
  '213': '909',
  '619': '909',
  '602': '909',
  '214': '832',
  '713': '832',
  '212': '631',
  '215': '631',
};

function npaOf(e164: string) {
  return e164.replace(/\D/g, '').slice(1, 4);
}

let failed = 0;
for (const lead of leads) {
  const picked = pickDialerCallerId(lead.phone, FALLBACK);
  const got = npaOf(picked);
  const exp = expectedNpa[lead.npa];
  const ok = exp ? got === exp : true;
  if (!ok) failed += 1;
  const note = exp ? (ok ? 'OK' : `FAIL expected ${exp}`) : 'nearest';
  console.log(`${lead.label.padEnd(22)} → ${picked} (${got})  ${note}`);
}

if (failed) {
  console.error(`\n${failed} expected match(es) failed`);
  process.exit(1);
}
console.log('\nAll expected area-code / state matches passed.');
