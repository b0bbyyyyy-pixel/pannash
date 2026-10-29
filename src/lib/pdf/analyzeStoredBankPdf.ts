import { getAIClient, GROK_MODEL, GROK_VISION_MODELS } from '@/lib/ai';
import { loadPdfjsNode } from '@/lib/pdf/loadPdfjsNode';
import { mergeParsedFieldMaps, normalizeParsedFields } from '@/lib/normalizeParsedFields';
import { extractPdfImages } from '@/lib/pdf/extractPdfImages';
import { extractCcittStatementPages } from '@/lib/pdf/extractCcittPages';
import { extractBankMetricsFromText, hasBankMetrics, reconcileBankMetrics, statementMonthFromFilename } from '@/lib/pdf/extractBankMetrics';
import { MCA_BANK_PROMPT } from '@/lib/pdf/extractMcaPositions';

const BANK_PROMPT = `You are a financial analyst extracting data from a business bank statement for MCA underwriting.
Extract EVERY metric you can. Return ONLY a raw JSON object — no markdown fences.
Read the account / activity / checking summary box first, whatever the bank calls it.
- Previous / beginning / opening balance → openingBalance
- Total deposits / credits / "Deposits / Misc Credits" → totalDeposits and monthlyRevenue. The count before the dollar amount is depositCount.
- Total withdrawals / debits / "Withdrawals / Misc Debits" → totalWithdrawals only. Never copy this into endingBalance, even when printed as a negative.
- Ending / new / closing balance → endingBalance. This is the statement's ending cash, not withdrawals.
- ImageCentre / Generations Bank summaries print Beginning Balance, Deposits / Misc Credits, Withdrawals / Misc Debits, Ending Balance in one block.
If opening + deposits − |withdrawals| equals a printed ending balance, use that ending balance.
{
  "company": "",
  "bankName": "",
  "accountNumber": "",
  "statementMonth": "",
  "openingBalance": "",
  "endingBalance": "",
  "totalDeposits": "",
  "totalWithdrawals": "",
  "monthlyRevenue": "",
  "avgDailyBalance": "",
  "nsfCount": "",
  "depositCount": "",
  "largestDeposit": "",
  "hasOtherMCALoans": false,
  "mcaPositions": []
}

${MCA_BANK_PROMPT}`;

let _pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null = null;
function getPdfParse() {
  if (!_pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('pdf-parse');
    _pdfParse = typeof mod === 'function' ? mod : mod.default;
  }
  return _pdfParse!;
}

const loadPdfjs = loadPdfjsNode;

function safeJson(raw: string): Record<string, string> {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const obj = JSON.parse(clean);
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || v === '') continue;
      if (typeof v === 'boolean') { result[k] = v ? 'true' : 'false'; continue; }
      if (typeof v === 'object') {
        const encoded = JSON.stringify(v);
        if (encoded && encoded !== '[]' && encoded !== '{}') result[k] = encoded;
        continue;
      }
      const s = String(v).trim();
      if (s && s !== 'null' && s !== 'undefined') result[k] = s;
    }
    return result;
  } catch { return {}; }
}

function extractRawStringsFromPdf(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  const matches = latin.match(/[\x20-\x7E]{5,}/g) ?? [];
  const filtered = matches.filter(s => {
    const t = s.trim();
    if (!t) return false;
    if (/^(obj|endobj|stream|endstream|xref|trailer|startxref)$/.test(t)) return false;
    if (/^[0-9A-Fa-f]{20,}$/.test(t)) return false;
    if (!/[a-zA-Z]/.test(t)) return false;
    return true;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of filtered) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
    if (out.join(' ').length > 80000) break;
  }
  return out.join('\n');
}

async function extractPdfjsText(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      disableFontFace: true,
    }).promise;
    let full = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let prevY: number | null = null;
      for (const item of content.items) {
        if (!item || typeof item !== 'object' || !('str' in item)) continue;
        const rec = item as unknown as { str?: string; transform?: number[] };
        const str = String(rec.str ?? '');
        const y = Number(rec.transform?.[5] ?? 0);
        if (prevY !== null && Math.abs(y - prevY) > 2) full += '\n';
        else if (full && !full.endsWith('\n') && !full.endsWith(' ')) full += ' ';
        full += str;
        prevY = y;
      }
      full += '\n\n';
    }
    return full.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    console.warn('[analyze-bank] pdfjs text failed:', e instanceof Error ? e.message : e);
    return '';
  }
}

async function extractWithTextAI(text: string): Promise<Record<string, string>> {
  if (text.replace(/\s/g, '').length < 20) return {};
  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: GROK_MODEL,
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: BANK_PROMPT + '\n\nReturn ONLY raw JSON, no markdown.' },
        { role: 'user', content: `DOCUMENT TEXT:\n\n${text.slice(0, 28000)}` },
      ],
    });
    return safeJson(completion.choices[0]?.message?.content?.trim() ?? '{}');
  } catch (e) {
    console.error('[analyze-bank] text AI failed:', e instanceof Error ? e.message : e);
    return {};
  }
}

async function extractWithVision(
  images: { mime: string; buffer: Buffer }[],
  filename: string,
): Promise<Record<string, string>> {
  if (!images.length) return {};
  const ai = getAIClient();
  const ask = async (
    pages: { mime: string; buffer: Buffer }[],
    model: string,
    timeout: number,
  ) => {
    const completion = await ai.chat.completions.create({
      model,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: BANK_PROMPT + '\n\nReturn ONLY raw JSON, no markdown.' },
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [
            {
              type: 'text',
              text: `File: ${filename}. Read the account summary box on these pages. endingBalance is the ending/new/closing balance only — never withdrawals/debits. You MUST fill totalDeposits, monthlyRevenue, openingBalance, endingBalance, totalWithdrawals, statementMonth (YYYY-MM). Digits only for money.`,
            },
            ...pages.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mime};base64,${img.buffer.toString('base64')}`, detail: 'high' },
            })),
          ] as any,
        },
      ],
    }, { timeout });
    return safeJson(completion.choices[0]?.message?.content?.trim() ?? '{}');
  };

  let fields: Record<string, string> = {};
  const first = images.slice(0, Math.min(3, images.length));
  try {
    fields = await ask(first, GROK_VISION_MODELS[0], 50_000);
    console.log(`[analyze-bank] vision ${GROK_VISION_MODELS[0]}`, Object.keys(fields), fields.totalDeposits || fields.monthlyRevenue || '');
    if (hasBankMetrics(fields)) return fields;
  } catch (e) {
    console.warn('[analyze-bank] vision first pass failed:', e instanceof Error ? e.message : e);
  }

  const more = images.slice(0, Math.min(4, images.length));
  for (const model of ['grok-4.7', 'grok-4']) {
    try {
      const retry = await ask(more, model, 90_000);
      console.log(`[analyze-bank] vision retry ${model}`, Object.keys(retry), retry.totalDeposits || retry.monthlyRevenue || '');
      if (hasBankMetrics(retry)) return retry;
      fields = mergeParsedFieldMaps(fields, retry);
    } catch (e) {
      console.warn(`[analyze-bank] vision retry ${model} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return fields;
}

export async function analyzeStoredBankPdf(
  buffer: Buffer,
  filename: string,
): Promise<Record<string, string>> {
  let layer = '';
  try {
    const parsed = await getPdfParse()(buffer);
    layer = (parsed.text ?? '').trim();
  } catch (e) {
    console.warn('[analyze-bank] pdf-parse failed:', e instanceof Error ? e.message : e);
  }
  if (layer.replace(/\s/g, '').length < 80) {
    const pdfjsText = await extractPdfjsText(buffer);
    if (pdfjsText.length > layer.length) layer = pdfjsText;
  }
  const raw = extractRawStringsFromPdf(buffer);
  console.log(`[analyze-bank] ${filename}: layer=${layer.length} raw=${raw.length}`);

  const fromText = mergeParsedFieldMaps(
    extractBankMetricsFromText(layer),
    extractBankMetricsFromText(raw),
  );

  const ccitt = await extractCcittStatementPages(buffer, 2);
  const images = ccitt.length ? ccitt : await extractPdfImages(buffer, loadPdfjs);
  console.log(`[analyze-bank] ${filename}: images=${images.length} ccitt=${ccitt.length} textKeys=${Object.keys(fromText).join(',')}`);
  let ai: Record<string, string> = {};
  if (images.length) ai = await extractWithVision(images, filename);
  if (!hasBankMetrics(ai) && layer.replace(/\s/g, '').length >= 40) {
    ai = mergeParsedFieldMaps(ai, await extractWithTextAI(layer));
  }

  // AI first; regex only fills keys the model left blank, then identity-check ending vs withdrawals.
  const merged = reconcileBankMetrics(normalizeParsedFields(mergeParsedFieldMaps(ai, fromText)));
  if (!merged.statementMonth) {
    const fromName = statementMonthFromFilename(filename);
    if (fromName) merged.statementMonth = fromName;
  }
  return merged;
}
