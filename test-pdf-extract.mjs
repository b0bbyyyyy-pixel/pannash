/**
 * Quick diagnostic — run: node test-pdf-extract.mjs /path/to/application.pdf
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node test-pdf-extract.mjs <path-to-pdf>');
  process.exit(1);
}

const buffer = readFileSync(filePath);
console.log(`\n📄 File: ${filePath} (${buffer.length} bytes)\n`);

// ── Test 1: pdf-parse ──────────────────────────────────────────────────────
console.log('=== 1. pdf-parse ===');
try {
  const pdfParse = require('pdf-parse');
  const result = await pdfParse(buffer);
  const text = (result.text ?? '').replace(/\s+/g, ' ').trim();
  console.log(`  Extracted: ${text.length} chars`);
  console.log(`  First 500: ${text.slice(0, 500)}`);
} catch (e) {
  console.log('  FAILED:', e.message);
}

// ── Test 2: pdfjs-dist ────────────────────────────────────────────────────
console.log('\n=== 2. pdfjs-dist ===');
try {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  console.log(`  Pages: ${pdf.numPages}`);

  const parts = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 5); p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(i => i.str ?? '').filter(s => s.trim()).join(' ');
    if (text) parts.push(`[Page ${p}]: ${text}`);

    const anns = await page.getAnnotations();
    for (const ann of anns) {
      if (ann.fieldType && ann.fieldValue != null) {
        const val = Array.isArray(ann.fieldValue) ? ann.fieldValue.join(', ') : String(ann.fieldValue);
        if (val.trim()) parts.push(`  FIELD ${ann.fieldName || '?'}: ${val}`);
      }
    }
  }
  const result = parts.join('\n');
  console.log(`  Extracted: ${result.length} chars`);
  console.log(`  Content:\n${result.slice(0, 1000)}`);
} catch (e) {
  console.log('  FAILED:', e.message);
}

// ── Test 3: raw binary strings ────────────────────────────────────────────
console.log('\n=== 3. Raw binary strings ===');
try {
  const latin = buffer.toString('latin1');
  const matches = latin.match(/[\x20-\x7E]{4,}/g) ?? [];
  const filtered = matches.filter(s => {
    const t = s.trim();
    if (!t) return false;
    if (/^(obj|endobj|stream|endstream|xref|trailer|startxref|%%EOF)$/.test(t)) return false;
    if (/^[0-9A-Fa-f]{20,}$/.test(t)) return false;
    return true;
  });
  const seen = new Set();
  const out = [];
  for (const s of filtered) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
    if (out.join(' ').length > 5000) break;
  }
  const result = out.join('\n');
  console.log(`  Extracted: ${result.length} chars`);
  console.log(`  First 500:\n${result.slice(0, 500)}`);
} catch (e) {
  console.log('  FAILED:', e.message);
}

console.log('\n✅ Done');
