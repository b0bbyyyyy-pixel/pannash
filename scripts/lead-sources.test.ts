/**
 * Lead source categories for campaign insights.
 * Run: npx tsx scripts/lead-sources.test.ts
 */
import {
  guessLeadSource,
  isFullPacksSource,
  isOptimizedPack,
  optimizedPackId,
  optimizedPackName,
  resolveListSource,
  slugLeadSource,
} from '../src/lib/smsDrip/leadSources';
import { upsertOptimizedPack } from '../src/lib/smsDrip/optimizeTemplates';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(guessLeadSource('New Data 10-27 (5-209)')?.key === 'new-data', 'guess New Data');
assert(guessLeadSource('Old AI Full Packs 9-16')?.key === 'old-ai-full-packs', 'guess Old AI Full Packs');
assert(guessLeadSource('AI Full Packs 9-8')?.key === 'ai-full-packs', 'guess AI Full Packs');
assert(guessLeadSource('Old Data 10-26 (3900-6900)')?.key === 'old-data', 'guess Old Data');
assert(guessLeadSource('Random list') == null, 'unknown name is null');
assert(resolveListSource({ name: 'New Data 10-27' }).key === 'new-data', 'resolve from name');
assert(resolveListSource({ name: 'x', source_category: 'old-data' }).key === 'old-data', 'stored wins');
assert(resolveListSource({ name: 'Random list' }).key === 'uncategorized', 'unknown is uncategorized');
assert(isFullPacksSource('ai-full-packs'), 'full packs key');
assert(!isFullPacksSource('new-data'), 'new data is not full packs');
assert(optimizedPackId('new-data') === 'optimized:new-data', 'pack id');
assert(optimizedPackName('New Data') === 'Optimized · New Data', 'pack name');
assert(isOptimizedPack({ id: 'optimized:new-data', name: 'Optimized · New Data' }), 'source pack is optimized');
assert(!isOptimizedPack({ id: 'abc', name: 'Set 1' }), 'regular pack');
assert(slugLeadSource('Broker Data!') === 'broker-data', 'custom slug');

const merged = upsertOptimizedPack(
  [
    { id: 'set-1', name: 'Set 1', templates: ['a'] },
    { id: 'optimized:ai-full-packs', name: 'Optimized · AI Full Packs', templates: ['uw'] },
  ],
  { id: 'optimized:new-data', name: 'Optimized · New Data', templates: ['hi'] },
);
assert(merged.some(p => p.id === 'optimized:ai-full-packs'), 'keeps other source pack');
assert(merged.some(p => p.id === 'optimized:new-data' && p.templates[0] === 'hi'), 'adds this source pack');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('lead-sources tests passed');
