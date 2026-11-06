/**
 * Navbar upload badge: one lead with app+docs counts as 1, and
 * "Application and documents received" still flags unseen without SQL columns.
 * Run: npx tsx scripts/upload-unread.test.ts
 */
import {
  isUploadPreview,
  mergeUnseenUploads,
  readUnseenUploads,
  unseenUploadsCleared,
  uploadUnreadStillOpen,
} from '../src/lib/inbox/uploadUnread';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(isUploadPreview('Application and documents received'), 'app+docs preview');
assert(isUploadPreview('Application received'), 'app preview');
assert(isUploadPreview('Documents received'), 'docs preview');
assert(!isUploadPreview('I sent the application yesterday'), 'regular sms is not an upload');
assert(!isUploadPreview('Casper: a lead sent the funding application'), 'casper ping is not the badge');

const merged = mergeUnseenUploads(
  { application: 0, documents: 0 },
  { application: 1, documents: 1 },
);
assert(merged.application === 1 && merged.documents === 1, 'merge takes the upload');

assert(readUnseenUploads({ unseenUploads: { application: 1, documents: 2 } }).documents === 2, 'reads ud');
assert(!unseenUploadsCleared({ unseenUploads: { application: 1 } }), 'open unseen is not cleared');
assert(unseenUploadsCleared({ uploadUnreadClearedAt: '2026-11-05T00:00:00Z' }), 'cleared flag');
assert(
  uploadUnreadStillOpen({ unseenUploads: { application: 1 }, unseenUploadAt: '2026-11-06T16:00:00Z' }),
  'website submit stays on the badge',
);
assert(
  !uploadUnreadStillOpen({
    unseenUploads: { application: 1 },
    unseenUploadAt: '2026-11-05T00:00:00Z',
    uploadUnreadClearedAt: '2026-11-05T12:00:00Z',
  }),
  'checked lead drops off the badge',
);
assert(
  uploadUnreadStillOpen({
    unseenUploads: { application: 1 },
    unseenUploadAt: '2026-11-06T16:00:00Z',
    uploadUnreadClearedAt: '2026-11-05T12:00:00Z',
  }),
  'new website submit after checking shows again',
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
