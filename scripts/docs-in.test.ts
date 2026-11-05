/**
 * Docs In when a lead sends the application plus bank statements.
 * Run: npx tsx scripts/docs-in.test.ts
 */
import { docsPackageReady } from '../src/lib/leads/markDocsIn';

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
  docsPackageReady([
    { file_name: 'ABF_Application.pdf', column_field: 'documents' },
    { file_name: 'Chase_statement_Sep.pdf', column_field: 'bank_statements' },
  ]),
  'application + one statement is Docs In',
);
assert(
  !docsPackageReady([{ file_name: 'ABF_Application.pdf', column_field: 'documents' }]),
  'application alone is not Docs In',
);
assert(
  docsPackageReady(
    [{ file_name: 'ABF_Application.pdf', column_field: 'documents' }],
    { fromOutside: true },
  ),
  'any file from outside the CRM is Docs In',
);
assert(
  !docsPackageReady([], { fromOutside: true }),
  'outside source with no files is not Docs In',
);
assert(
  docsPackageReady([{ file_name: 'One_Funding_Application_Sweets_Painting_2026-11-05.pdf' }]),
  'One Funding application PDF is Docs In',
);
assert(
  docsPackageReady([
    { file_name: 'a.pdf', column_field: 'documents' },
    { file_name: 'b.pdf', column_field: 'documents' },
    { file_name: 'c.pdf', column_field: 'documents' },
    { file_name: 'd.pdf', column_field: 'documents' },
  ]),
  'four files still counts',
);
assert(
  !docsPackageReady([
    { file_name: 'a.pdf', column_field: 'documents' },
    { file_name: 'b.pdf', column_field: 'documents' },
    { file_name: 'c.pdf', column_field: 'documents' },
  ]),
  'three unclassified files is not enough',
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
