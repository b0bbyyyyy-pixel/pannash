import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAIClient, GROK_MODEL, GROK_VISION_MODEL } from '@/lib/ai';

export const runtime     = 'nodejs';
export const maxDuration = 120;

// ── Lazy-load pdf-parse v1 (avoids its self-test at module init) ───────────────
let _pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null = null;
function getPdfParse() {
  if (!_pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('pdf-parse');
    _pdfParse = typeof mod === 'function' ? mod : mod.default;
  }
  return _pdfParse!;
}

// ── Prompts ────────────────────────────────────────────────────────────────────
const APP_PROMPT = `You are a data extraction specialist for business funding applications.
Extract ALL available fields from the provided document and return ONLY a raw JSON object — no markdown fences.

JSON schema (all fields optional, only include fields clearly present):
{
  "name": "Owner full name",
  "email": "Owner email",
  "phone": "Owner mobile/cell phone",
  "dob": "Date of birth",
  "ssn": "SSN (may be masked)",
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
  "businessStartDate": "Business start date",
  "ein": "EIN / Federal Tax ID",
  "entityType": "LLC / Corp / Sole Prop etc.",
  "ownershipPercent": "Ownership percentage",
  "businessPhone": "Business phone number",
  "fax": "Fax number",
  "requestedAmount": "Requested funding amount (digits only)",
  "monthlyRevenue": "Average monthly gross revenue (digits only)",
  "avgDailyBalance": "Average daily bank balance (digits only)",
  "purposeOfFunds": "Use of funds",
  "owner2FirstName": "Second owner first name",
  "owner2LastName": "Second owner last name",
  "owner2Ownership": "Second owner ownership %",
  "owner2DOB": "Second owner DOB",
  "owner2SSN": "Second owner SSN"
}`;

const BANK_PROMPT = `You are a financial analyst extracting data from a business bank statement for MCA underwriting.
Extract EVERY metric you can. Return ONLY a raw JSON object — no markdown fences.

Look at: summary boxes, daily balances, deposit totals, NSF/overdraft fees, AND the transaction list.

MCA positions: scan ACH withdrawals / debits for merchant-cash-advance or factoring funders
(Rapid, OnDeck, Kapitus, Credibly, National Funding, Forward Financing, Libertas, Pearl, Everest,
IOU, Yellowstone, ClearFund, Fox Business, BFS, Strategic, etc.) and any recurring daily or weekly
debit of similar amount that is clearly a loan/advance remittance. List EACH distinct funder as its own position.

JSON schema (all optional, only include what is present or can be reasonably inferred):
{
  "company": "Business / account holder name",
  "bankName": "Name of bank",
  "accountNumber": "Account number (last 4 digits only if masked)",
  "statementMonth": "Statement month/year",
  "openingBalance": "Opening balance (digits only, allow negatives)",
  "endingBalance": "Ending balance (digits only, allow negatives)",
  "totalDeposits": "Total deposits / credits for the statement period (digits only)",
  "totalWithdrawals": "Total withdrawals (digits only)",
  "monthlyRevenue": "Same as total deposits for this statement (digits only)",
  "avgDailyBalance": "Average daily balance if printed. If not printed, estimate from daily ending balances or (opening+ending)/2 (digits only)",
  "nsfCount": "Count of NSF, overdraft, returned-item, and insufficient-funds fees (integer)",
  "negativeDays": "Number of calendar days the ledger balance was below $0 (integer)",
  "depositCount": "Number of deposit / credit transactions, excluding transfers and loan proceeds (integer)",
  "largestDeposit": "Largest single deposit (digits only)",
  "month1Revenue": "Month 1 deposits if a multi-month statement (digits only)",
  "month2Revenue": "Month 2 deposits (digits only)",
  "month3Revenue": "Month 3 deposits (digits only)",
  "month4Revenue": "Month 4 deposits (digits only)",
  "hasOtherMCALoans": true,
  "mcaPositions": [
    {
      "lender": "Funder or ACH name as printed",
      "payment": 185.50,
      "frequency": "daily",
      "monthlyPayment": 3885,
      "outstanding": 0
    }
  ]
}

frequency must be "daily", "weekly", or "monthly".
monthlyPayment = payment * 21 if daily, * 4.33 if weekly, * 1 if monthly.
If no MCA / advance remittances are found, omit mcaPositions and set hasOtherMCALoans to false.`;

// ── Detect bank statement ──────────────────────────────────────────────────────
function isBankStatement(filename: string, text: string): boolean {
  const lower = filename.toLowerCase() + ' ' + text.slice(0, 500).toLowerCase();
  return [
    'bank statement','statement of account','account statement',
    'chase','bank of america','wells fargo','citibank','td bank',
    'us bank','pnc bank','capital one','regions','suntrust','truist',
    'fifth third','huntington','citizens bank','cross river','mercury',
    'ending balance','beginning balance','opening balance',
    'total deposits','total withdrawals','nsf','overdraft',
  ].some(k => lower.includes(k));
}

// ── Parse JSON safely ──────────────────────────────────────────────────────────
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

// ── Extract readable strings from PDF binary ───────────────────────────────────
// Catches embedded OCR text in scanned PDFs that have a text layer
function extractRawStringsFromPdf(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  const matches = latin.match(/[\x20-\x7E]{5,}/g) ?? [];
  const filtered = matches.filter(s => {
    const t = s.trim();
    if (!t) return false;
    if (/^(obj|endobj|stream|endstream|xref|trailer|startxref)$/.test(t)) return false;
    if (/^[0-9A-Fa-f]{20,}$/.test(t)) return false;
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(t)) return false;
    return true;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of filtered) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
    if (out.join(' ').length > 15000) break;
  }
  return out.join('\n');
}

// ── AI text extraction ─────────────────────────────────────────────────────────
async function extractWithTextAI(text: string, prompt: string): Promise<Record<string, string>> {
  if (!text.trim() || text.replace(/\s/g, '').length < 20) return {};
  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: GROK_MODEL,
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: prompt + '\n\nReturn ONLY raw JSON, no markdown.' },
        { role: 'user', content: `DOCUMENT TEXT:\n\n${text.slice(0, 18000)}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    console.log('[parse-application] Text AI result (first 300):', raw.slice(0, 300));
    return safeJson(raw);
  } catch (e) {
    console.error('[parse-application] Text AI failed:', e);
    return {};
  }
}

// ── Vision OCR (for actual image files: JPEG, PNG, WebP) ──────────────────────
async function extractWithVisionAI(buffer: Buffer, filename: string, prompt: string): Promise<Record<string, string>> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime =
    ext === 'png'  ? 'image/png'  :
    ext === 'webp' ? 'image/webp' :
    ext === 'gif'  ? 'image/gif'  : 'image/jpeg';

  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  console.log(`[parse-application] Vision OCR → ${ext} (${buffer.length} bytes)`);

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: GROK_VISION_MODEL,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: prompt + '\n\nReturn ONLY raw JSON, no markdown.' },
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }] as any,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    console.log('[parse-application] Vision result (first 300):', raw.slice(0, 300));
    return safeJson(raw);
  } catch (e) {
    console.error('[parse-application] Vision OCR failed:', e);
    return {};
  }
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
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buffer   = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const mime     = file.type || 'application/octet-stream';
  const ext      = filename.split('.').pop()?.toLowerCase() ?? '';
  const isPdf    = ext === 'pdf' || mime.includes('pdf');
  const isImage  = ['jpg','jpeg','png','webp','gif'].includes(ext);

  // ── Step 1: Extract text ───────────────────────────────────────────────────
  let textContent = '';

  if (ext === 'txt') {
    textContent = buffer.toString('utf-8');

  } else if (isPdf) {
    // Try pdf-parse v1 (handles text-layer PDFs including filled forms)
    try {
      const parsed = await getPdfParse()(buffer);
      textContent = (parsed.text ?? '').replace(/\s+/g, ' ').trim();
      console.log(`[parse-application] pdf-parse: ${textContent.length} chars`);
    } catch (e) {
      console.warn('[parse-application] pdf-parse failed:', e instanceof Error ? e.message : e);
    }

    // If sparse, also pull raw strings (catches OCR-layer scanned PDFs)
    if (textContent.length < 200) {
      const raw = extractRawStringsFromPdf(buffer);
      console.log(`[parse-application] raw binary strings: ${raw.length} chars`);
      if (raw.length > textContent.length) textContent += '\n' + raw;
    }

  } else if (!isImage) {
    textContent = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  }

  // ── Step 2: Detect document type ──────────────────────────────────────────
  const isBank = isBankStatement(filename, textContent);
  const prompt = isBank ? BANK_PROMPT : APP_PROMPT;

  // ── Step 3: Extract fields ─────────────────────────────────────────────────
  let fields: Record<string, string> = {};

  if (isImage) {
    // Real image file → vision OCR directly
    fields = await extractWithVisionAI(buffer, filename, prompt);

  } else if (isPdf && textContent.replace(/\s/g, '').length < 100) {
    // Truly scanned PDF with no usable text → send raw PDF bytes to vision model
    // Grok Vision will attempt to read it as a document image
    console.log('[parse-application] Sparse PDF → sending to Grok Vision as PDF');
    fields = await extractWithVisionAI(buffer, 'document.pdf', prompt);

    // If vision returned nothing, make one more attempt with the raw binary strings
    if (Object.keys(fields).length === 0) {
      const rawOnly = extractRawStringsFromPdf(buffer);
      if (rawOnly.length > 50) {
        fields = await extractWithTextAI(rawOnly, prompt);
      }
    }

  } else {
    // Text-based PDF or plain text → AI text extraction
    fields = await extractWithTextAI(textContent, prompt);
  }

  console.log(`[parse-application] Extracted ${Object.keys(fields).length} field(s):`, Object.keys(fields));

  return NextResponse.json({
    fields,
    documentType: isBank ? 'bank_statement' : 'application',
    ...(Object.keys(fields).length === 0
      ? { warning: 'This appears to be a scanned PDF with no readable text layer. Please fill in the fields manually or use a digital/typed PDF for best results.' }
      : {}),
  });
}
