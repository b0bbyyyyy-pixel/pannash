/**
 * SMS language helpers (no AI calls).
 * Run: npx tsx scripts/sms-language.test.ts
 */
import {
  guessSmsLanguage,
  isLanguageAgnosticSms,
  isSubstantialSms,
} from '../src/lib/inbox/language';
import {
  inboxEnglishGloss,
  languageLabel,
  normalizeLang,
  sameSmsText,
  sentInLabel,
} from '../src/lib/inbox/languageDisplay';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

assert(normalizeLang('ES') === 'es', 'normalize ES');
assert(normalizeLang('es-MX') === 'es', 'normalize es-MX');
assert(normalizeLang('Spanish') === 'es', 'normalize Spanish');
assert(normalizeLang('und') === null, 'normalize und');
assert(languageLabel('es') === 'Spanish', 'label es');
assert(sameSmsText('Hola  mundo', 'hola mundo'), 'sameSmsText ignores space/case');
assert(isLanguageAgnosticSms('STOP'), 'STOP is agnostic');
assert(isLanguageAgnosticSms('HELP'), 'HELP is agnostic');
assert(isLanguageAgnosticSms('Si'), 'short Si is agnostic');
assert(isLanguageAgnosticSms('ok'), 'ok is agnostic');
assert(isLanguageAgnosticSms('Attachment: 1 Photo'), 'photo placeholder is agnostic');
assert(!isLanguageAgnosticSms('Hola, cómo estás?'), 'full Spanish is not agnostic');
assert(!isSubstantialSms('Si'), 'Si is not substantial');
assert(!isSubstantialSms('STOP'), 'STOP is not substantial');
assert(isSubstantialSms('Puedo enviar los bancos mañana'), 'Spanish sentence is substantial');
assert(guessSmsLanguage(['Si', 'Puede conseguir 55000']) === 'es', 'guess Spanish from existing thread');
assert(guessSmsLanguage(['STOP', 'ok']) === null, 'no guess from agnostic texts');
assert(guessSmsLanguage(['Can you send the application today?']) === null, 'no guess from English');
assert(inboxEnglishGloss({ body: 'Hola', body_en: 'Hi' }) === 'Hi', 'inbound gloss');
assert(inboxEnglishGloss({ body: 'Hi', body_en: 'Hi' }) === null, 'no gloss when same');
assert(sentInLabel({ detected_lang: 'es' }) === 'sent in ES', 'sent in ES');
assert(sentInLabel({ detected_lang: 'en' }) === null, 'no label for English');
assert(sentInLabel({ detected_lang: null }) === null, 'no label without lang');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
