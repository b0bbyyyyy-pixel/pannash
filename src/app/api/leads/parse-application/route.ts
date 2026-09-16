import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAIClient, GROK_MODEL, GROK_VISION_MODEL } from '@/lib/ai';

// Lazy-load pdf-parse to avoid self-test at module init (crashes Next.js)
type PdfParseResult = { text: string };
let _pdfParse: ((buf: Buffer) => Promise<PdfParseResult>) | null = null;
function getPdfParse() {
  if (!_pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _pdfParse = require('pdf-parse');
  }
  return _pdfParse!;
}

export const runtime     = 'nodejs';
export const maxDuration = 120;

// ── Prompts ────────────────────────────────────────────────────────────────────
const APP_PROMPT = `You are a data extraction specialist for business funding applications.
Extract ALL available fields from the provided document and return ONLY a raw JSON object — no markdown fences.

JSON schema (all fields optional, only include fields clearly present):
{
  "name": "Owner full name",
  "email": "Owner email",
  "phone": "Owner mobile/cell phone (prefer cell over business)",
  "dob": "Date of birth MM/DD/YYYY",
  "ssn": "SSN (9 digits, may be masked)",
  "homeAddress": "Owner home street address",
  "city": "Owner home city",
  "state": "Owner home state (2-letter)",
  "zip": "Owner home ZIP",
  "creditScore": "Numerical credit score",
  "company": "Legal business name",
  "dba": "DBA name",
  "businessAddress": "Business street address",
  "businessCity": "Business city",
  "businessState": "Business state (2-letter)",
  "businessZip": "Business ZIP",
  "industry": "Industry / business type",
  "businessStartDate": "Business start date or TIB",
  "ein": "EIN / Federal Tax ID",
  "entityType": "LLC / Corp / Sole Prop etc.",
  "ownershipPercent": "Ownership percentage",
  "businessPhone": "Business phone number",
  "fax": "Fax number",
  "requestedAmount": "Requested funding amount (number string, digits only)",
  "monthlyRevenue": "Average monthly gross revenue (number string, digits only)",
  "avgDailyBalance": "Average daily bank balance (number string, digits only)",
  "purposeOfFunds": "Use of funds",
  "owner2FirstName": "Second owner first name",
  "owner2LastName": "Second owner last name",
  "owner2Ownership": "Second owner ownership %",
  "owner2DOB": "Second owner DOB",
  "owner2SSN": "Second owner SSN"
}`;

const BANK_PROMPT = `You are a financial analyst extracting data from a bank statement.
Extract ALL financial metrics and return ONLY a raw JSON object — no markdown fences.

JSON schema (all optional, only include what is clearly present):
{
  "company": "Business / account holder name",
  "bankName": "Name of bank (e.g. Chase, Bank of America, Wells Fargo)",
  "accountNumber": "Account number (last 4 digits only if masked)",
  "statementMonth": "Statement month/year (e.g. June 2026)",
  "openingBalance": "Opening balance (number string, digits only)",
  "endingBalance": "Ending balance (number string, digits only)",
  "totalDeposits": "Total deposits amount (number string, digits only)",
  "totalWithdrawals": "Total withdrawals (number string, digits only)",
  "monthlyRevenue": "Total deposits / monthly revenue (number string, digits only)",
  "avgDailyBalance": "Average daily balance (number string, digits only)",
  "nsfCount": "Number of NSF / overdraft charges (integer string)",
  "depositCount": "Number of deposits (integer string)",
  "largestDeposit": "Largest single deposit (number string, digits only)",
  "month1Revenue": "First month revenue if multi-month (number string)",
  "month2Revenue": "Second month revenue (number string)",
  "month3Revenue": "Third month revenue (number string)",
  "month4Revenue": "Fourth month revenue (number string)"
}`;

// ── Helper: detect bank statement ─────────────────────────────────────────────
function isBankStatement(filename: string, text: string): boolean {
  const lower = filename.toLowerCase() + ' ' + text.slice(0, 500).toLowerCase();
  return [
    'bank statement','statement of account','account statement',
    'chase','bank of america','wells fargo','citibank','td bank',
    'us bank','pnc bank','capital one','regions','suntrust','truist',
    'fifth third','huntington','citizens bank',
    'ending balance','beginning balance','opening balance',
    'total deposits','total withdrawals','nsf','overdraft',
  ].some(k => lower.includes(k));
}

// ── Helper: parse JSON safely ──────────────────────────────────────────────────
function safeJson(raw: string): Record<string, string> {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const obj = JSON.parse(clean);
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const s = String(v ?? '').trim();
      if (s && s !== 'null' && s !== 'undefined') result[k] = s;
    }
    return result;
  } catch { return {}; }
}

// ── Helper: extract every readable string from a PDF binary ──────────────────
// Scanned PDFs still contain metadata, form field labels, and often OCR layers.
// This pulls all ASCII strings ≥ 4 chars from the raw bytes.
function extractRawStringsFromPdf(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  // Pull runs of printable ASCII (space through ~) that are ≥ 4 chars
  const matches = latin.match(/[\x20-\x7E]{4,}/g) ?? [];
  // Filter out pure PDF syntax noise (obj, endobj, stream keywords etc.)
  const filtered = matches.filter(s => {
    const t = s.trim();
    if (!t) return false;
    // Skip common PDF binary noise tokens
    if (/^(obj|endobj|stream|endstream|xref|trailer|startxref|%%EOF)$/.test(t)) return false;
    // Skip very long hex strings (binary data encoded as hex)
    if (/^[0-9A-Fa-f]{20,}$/.test(t)) return false;
    return true;
  });
  // Deduplicate and join, capped at 18k chars for the AI
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of filtered) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
    if (out.join(' ').length > 18000) break;
  }
  return out.join('\n');
}

// ── Helper: OCR via Grok Vision (actual images only — JPEG/PNG/WebP) ─────────
async function ocrWithGrokVision(
  buffer: Buffer,
  filename: string,
  prompt: string,
): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime =
    ext === 'png'  ? 'image/png'  :
    ext === 'webp' ? 'image/webp' :
    ext === 'gif'  ? 'image/gif'  : 'image/jpeg';

  const base64  = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  console.log(`[parse-application] Vision OCR → ext=${ext} mime=${mime} size=${buffer.length}b`);
  const ai = getAIClient();
  try {
    const completion = await ai.chat.completions.create({
      model: GROK_VISION_MODEL,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: prompt + '\n\nReturn ONLY raw JSON, no markdown fences.' },
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }] as any,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '{}';
    console.log('[parse-application] Vision OCR result:', text.slice(0, 300));
    return text;
  } catch (err) {
    console.error('[parse-application] Vision OCR failed:', err);
    return '{}';
  }
}

// ── Helper: extract fields via text AI ────────────────────────────────────────
async function extractWithTextAI(text: string, prompt: string, label: string): Promise<string> {
  if (!text.trim() || text.replace(/\s/g, '').length < 20) return '{}';
  const ai = getAIClient();
  try {
    const completion = await ai.chat.completions.create({
      model: GROK_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: prompt + '\n\nReturn ONLY raw JSON, no markdown fences.' },
        { role: 'user', content: `DOCUMENT TEXT (${label}):\n\n${text.slice(0, 18000)}` },
      ],
    });
    const result = completion.choices[0]?.message?.content?.trim() ?? '{}';
    console.log(`[parse-application] Text AI (${label}) result:`, result.slice(0, 300));
    return result;
  } catch (err) {
    console.error(`[parse-application] Text AI (${label}) failed:`, err);
    return '{}';
  }
}

// ── Helper: merge two field maps (first map wins on conflicts) ─────────────────
function mergeFields(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...b };
  for (const [k, v] of Object.entries(a)) {
    if (v) out[k] = v; // a overwrites b
  }
  return out;
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file     = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buffer   = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const mime     = file.type || 'application/octet-stream';
  const ext      = filename.split('.').pop()?.toLowerCase() ?? '';
  const isImageFile = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  const isPdfFile   = ext === 'pdf' || mime.includes('pdf');

  // ── Step 1: Gather all available text from every source ───────────────────
  let pdfParseText  = '';  // From pdf-parse (structured text layer)
  let rawBinaryText = '';  // From raw binary string extraction (catches scanned PDFs with OCR layers)

  if (ext === 'txt') {
    pdfParseText = buffer.toString('utf-8');
  } else if (isPdfFile) {
    // Source A: pdf-parse structural text
    try {
      const parsed = await getPdfParse()(buffer);
      pdfParseText = (parsed.text ?? '').replace(/\s+/g, ' ').trim();
      console.log(`[parse-application] pdf-parse extracted ${pdfParseText.length} chars`);
    } catch (err) {
      console.warn('[parse-application] pdf-parse failed:', err);
    }
    // Source B: raw binary string extraction (catches embedded OCR text in scanned PDFs)
    rawBinaryText = extractRawStringsFromPdf(buffer);
    console.log(`[parse-application] raw binary strings: ${rawBinaryText.length} chars`);
  } else if (!isImageFile) {
    pdfParseText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  }

  // Combined text for document type detection
  const combinedText = `${pdfParseText}\n${rawBinaryText}`.slice(0, 2000);

  // ── Step 2: Detect document type ──────────────────────────────────────────
  const isBank = isBankStatement(filename, combinedText);
  const prompt = isBank ? BANK_PROMPT : APP_PROMPT;

  // ── Step 3: Multi-source extraction — merge best results ──────────────────
  let fields: Record<string, string> = {};

  if (isImageFile) {
    // Pure image → vision only
    const raw = await ocrWithGrokVision(buffer, filename, prompt);
    fields = safeJson(raw);

  } else if (isPdfFile) {
    // Strategy A: pdf-parse text (best quality when text layer exists)
    if (pdfParseText.length >= 80) {
      const raw = await extractWithTextAI(pdfParseText, prompt, 'pdf-parse');
      fields = mergeFields(safeJson(raw), fields);
    }

    // Strategy B: raw binary strings (catches scanned PDFs with embedded OCR layers)
    // Always try this — it often surfaces form field labels + values even in scanned PDFs
    if (rawBinaryText.length >= 50) {
      const raw = await extractWithTextAI(rawBinaryText, prompt, 'raw-binary');
      fields = mergeFields(safeJson(raw), fields);
    }

    // Strategy C: combined pass if either A or B gave nothing meaningful
    if (Object.keys(fields).length < 2) {
      const combined = `${pdfParseText}\n\n${rawBinaryText}`.replace(/\s{3,}/g, ' ').trim();
      if (combined.length >= 40) {
        const raw = await extractWithTextAI(combined, prompt, 'combined');
        fields = mergeFields(safeJson(raw), fields);
      }
    }

  } else {
    // Plain text / other file
    const raw = await extractWithTextAI(pdfParseText, prompt, 'text');
    fields = safeJson(raw);
  }

  console.log(`[parse-application] Final extracted fields (${Object.keys(fields).length}):`, Object.keys(fields));

  // Always return 200 — even partial results are useful; let the UI fill gaps
  return NextResponse.json({
    fields,
    documentType: isBank ? 'bank_statement' : 'application',
    ...(Object.keys(fields).length === 0
      ? { warning: 'No data could be extracted automatically. Please fill in the fields manually.' }
      : {}),
  });
}
