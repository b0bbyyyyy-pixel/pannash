/**
 * Outbound MMS helpers.
 * Run: npx tsx scripts/outbound-mms.test.ts
 */
import {
  attachmentSmsBody,
  classifyMmsFile,
  isAttachmentPlaceholder,
  isOwnedMmsPath,
  MMS_MAX_BYTES,
  parseOutboundMedia,
} from '../src/lib/inbox/outboundMms';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(classifyMmsFile({ name: 'shot.jpg', type: 'image/jpeg', size: 1200 }).ok, 'jpeg ok');
assert(classifyMmsFile({ name: 'shot.PNG', type: '', size: 800 }).ok, 'png by extension');
assert(classifyMmsFile({ name: 'app.pdf', type: 'application/pdf', size: 2400 }).ok, 'pdf ok');
assert(!classifyMmsFile({ name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1000 }).ok, 'docx rejected');
assert(!classifyMmsFile({ name: 'huge.jpg', type: 'image/jpeg', size: MMS_MAX_BYTES + 1 }).ok, 'oversize rejected');
assert(isOwnedMmsPath('u1/l1/mms/1_shot.jpg', 'u1', 'l1'), 'owned path');
assert(!isOwnedMmsPath('u1/l1/documents/1_shot.jpg', 'u1', 'l1'), 'other column rejected');
assert(!isOwnedMmsPath('../u1/l1/mms/x.jpg', 'u1', 'l1'), 'traversal rejected');
assert(attachmentSmsBody(['image/jpeg']) === 'Attachment: 1 Photo', 'one photo body');
assert(attachmentSmsBody(['application/pdf', 'application/pdf']) === 'Attachment: 2 PDFs', 'two pdf body');
assert(isAttachmentPlaceholder('Attachment: 1 Photo'), 'placeholder photo');
assert(isAttachmentPlaceholder('Attachment: 2 PDFs'), 'placeholder pdfs');
assert(!isAttachmentPlaceholder('Here is the statement'), 'regular text is not placeholder');
assert(parseOutboundMedia([{ path: 'u/l/mms/a.jpg', type: 'image/jpeg', name: 'a.jpg' }]).length === 1, 'parse one');
assert(parseOutboundMedia([{ path: 'u/l/mms/a.exe', type: 'application/x-msdownload' }]).length === 0, 'parse rejects exe');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('outbound-mms tests passed');
