import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAIClient, GROK_MODEL, GROK_VISION_MODEL } from '@/lib/ai';
import { explodeFormLabels, fieldsFromLabeledText, mergeParsedFieldMaps, normalizeParsedFields } from '@/lib/normalizeParsedFields';

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
Extract ALL filled values from the document, including PDF form fields listed as "Label: value".
Return ONLY a raw JSON object — no markdown fences.

Use EXACTLY these keys (map common labels onto them):
- Federal Tax ID / FEIN / Tax ID / EIN → "ein"
- Entity type / LLC / Corp / Sole Prop / S-Corp / C-Corp / Partnership / Business structure → "entityType"
- Use of funds / Use of proceeds / Purpose of loan → "purposeOfFunds"
- Amount requested / Funding amount / Loan amount → "requestedAmount" (digits only)
- Avg monthly revenue / monthly sales / gross monthly → "monthlyRevenue" (digits only)
- Ownership % / percent owned → "ownershipPercent" (number, e.g. 100)
- Home / residential address (NOT business) → "homeAddress"
- SSN / Social Security → "ssn" (include even if masked)
- DOB / Date of birth / Birth date → "dob"
- Legal business name → "company"

Do not skip ein, entityType, purposeOfFunds, requestedAmount, monthlyRevenue, ownershipPercent, homeAddress, ssn, or dob when they appear anywhere.

Do not glue neighboring fields together. If the text has "Auto salesUse of funds: Working capital", industry is "Auto sales" and purposeOfFunds is "Working capital". If the text has "2024-12-04EIN: 12-3456789", businessStartDate is "2024-12-04" and ein is "12-3456789".

JSON schema (all fields optional, only include fields that have a value):
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
  "owner2OwnershipPercent": "Second owner ownership %",
  "owner2Dob": "Second owner DOB",
  "owner2Ssn": "Second owner SSN"
}`;

const BANK_PROMPT = `You are a financial analyst extracting data from a business bank statement for MCA underwriting.
Extract EVERY metric you can. Return ONLY a raw JSON object — no markdown fences.

Look at: summary boxes, daily balances, deposit totals, NSF/overdraft fees, AND the transaction list.

MCA positions: scan ACH withdrawals / debits for merchant-cash-advance or factoring funders
(Rapid, OnDeck, Kapitus, Credibly, National Funding, Forward Financing, Libertas, Pearl, Everest,
IOU, Yellowstone, ClearFund, Fox Business, BFS, Strategic, etc.) and any recurring daily or weekly
debit of similar amount that is clearly a loan/advance remittance. List EACH distinct funder as its own position.

Funding credit: for each funder, look for a large incoming ACH credit / wire / deposit from that same
funder (loan proceeds, advance, funding, MCA deposit). If that credit is printed on this statement:
- set fundedDate to the transaction date as YYYY-MM-DD
- set fundedAmount to the credit amount (digits only) — this is the original wire / advance, NOT the daily remittance
If you only see remittance debits and no funding credit, omit fundedDate and fundedAmount — do not guess.

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
      "outstanding": 0,
      "fundedDate": "2026-03-12",
      "fundedAmount": 25000
    }
  ]
}

frequency must be "daily", "weekly", or "monthly".
monthlyPayment = payment * 21 if daily, * 4.33 if weekly, * 1 if monthly.
fundedDate is only the date of an incoming funding credit printed on the statement.
fundedAmount is only the dollar amount of that same incoming credit (the original wire), never the payment/debit amount.
If no MCA / advance remittances are found, omit mcaPositions and set hasOtherMCALoans to false.`;

// ── Detect bank statement ──────────────────────────────────────────────────────
function isBankStatement(filename: string, text: string): boolean {
  const lower = `${filename} ${text.slice(0, 2500)}`.toLowerCase();
  return [
    'bank statement', 'statement of account', 'account statement',
    'stmt', 'stmt_', 'checking', 'savings', 'business checking',
    'frost', 'chase', 'bank of america', 'wells fargo', 'citibank', 'td bank',
    'us bank', 'pnc bank', 'capital one', 'regions', 'suntrust', 'truist',
    'fifth third', 'huntington', 'citizens bank', 'cross river', 'mercury',
    'ending balance', 'beginning balance', 'opening balance',
    'total deposits', 'total withdrawals', 'nsf', 'overdraft',
    'account ending', 'deposits and other credits',
  ].some(k => lower.includes(k));
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = '';
  return pdfjs;
}

function formValueText(raw: unknown): string {
  if (raw == null) return '';
  const s = Array.isArray(raw) ? raw.filter(Boolean).join(', ') : String(raw);
  const t = s.trim();
  if (!t || /^(off|false|null|undefined)$/i.test(t)) return '';
  return t;
}

async function extractPdfjsContent(buffer: Buffer): Promise<{ text: string; formLines: string[] }> {
  try {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      disableFontFace: true,
    }).promise;
    let full = '';
    const formLines: string[] = [];
    const seen = new Set<string>();

    const pushForm = (label: string, value: unknown) => {
      const text = formValueText(value);
      if (!text) return;
      const name = String(label || '').replace(/[_\-]+/g, ' ').trim() || 'Field';
      const key = `${name.toLowerCase()}:${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      formLines.push(`${name}: ${text}`);
    };

    try {
      const objects = await pdf.getFieldObjects();
      if (objects) {
        const entries = objects instanceof Map
          ? [...objects.entries()]
          : Object.entries(objects as Record<string, unknown>);
        for (const [name, arr] of entries) {
          const list = Array.isArray(arr) ? arr : [];
          for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            pushForm(String(name), (item as { value?: unknown }).value);
          }
        }
      }
    } catch { /* no AcroForm catalog */ }

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let prevY: number | null = null;
      let prevEndX: number | null = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const str = (item as { str: string }).str;
        const x = (item as { transform: number[] }).transform[4];
        const y = (item as { transform: number[] }).transform[5];
        const width = 'width' in item ? Number((item as { width: number }).width) || 0 : 0;
        if (prevY !== null && Math.abs(y - prevY) > 2) {
          full += '\n';
          prevEndX = null;
        } else if (prevEndX != null && x - prevEndX > 1.5) {
          full += ' ';
        }
        full += str;
        prevY = y;
        prevEndX = x + width;
      }
      full += '\n\n';
      try {
        const annotations = await page.getAnnotations();
        for (const ann of annotations) {
          if (!ann || typeof ann !== 'object') continue;
          const a = ann as { fieldType?: string; fieldName?: string; fieldValue?: unknown; alternativeText?: string };
          if (!a.fieldType) continue;
          pushForm(a.fieldName || a.alternativeText || '', a.fieldValue);
        }
      } catch { /* page has no widgets */ }
    }
    return {
      text: full.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
      formLines,
    };
  } catch (e) {
    console.warn('[parse-application] pdfjs extract failed:', e instanceof Error ? e.message : e);
    return { text: '', formLines: [] };
  }
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
        { role: 'user', content: `DOCUMENT TEXT:\n\n${text.slice(0, 28000)}` },
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

// ── Vision OCR (real images only — never send PDF bytes as JPEG) ──────────────
async function extractWithVisionImages(
  images: { mime: string; buffer: Buffer }[],
  prompt: string,
): Promise<Record<string, string>> {
  if (!images.length) return {};
  console.log(`[parse-application] Vision OCR → ${images.length} image(s)`);
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
          content: [
            { type: 'text', text: 'These are pages from one document. Extract fields from all pages.' },
            ...images.map(img => ({
              type: 'image_url',
              image_url: {
                url: `data:${img.mime};base64,${img.buffer.toString('base64')}`,
                detail: 'high',
              },
            })),
          ] as any,
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

async function extractWithVisionAI(buffer: Buffer, filename: string, prompt: string): Promise<Record<string, string>> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime =
    ext === 'png'  ? 'image/png'  :
    ext === 'webp' ? 'image/webp' :
    ext === 'gif'  ? 'image/gif'  : 'image/jpeg';
  return extractWithVisionImages([{ mime, buffer }], prompt);
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
  const attachmentId = String(formData.get('attachmentId') ?? '').trim();
  const file = formData.get('file') as File | null;

  let buffer: Buffer;
  let filename: string;
  let mime: string;

  if (attachmentId) {
    const { data: att } = await supabase
      .from('lead_attachments')
      .select('file_path, file_name, file_type')
      .eq('id', attachmentId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!att?.file_path) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    const { data: blob, error: dlErr } = await supabase.storage.from('lead-attachments').download(att.file_path);
    if (dlErr || !blob) return NextResponse.json({ error: 'Could not download file' }, { status: 502 });
    buffer = Buffer.from(await blob.arrayBuffer());
    filename = att.file_name;
    mime = att.file_type || 'application/octet-stream';
  } else if (file) {
    buffer = Buffer.from(await file.arrayBuffer());
    filename = file.name;
    mime = file.type || 'application/octet-stream';
  } else {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ext      = filename.split('.').pop()?.toLowerCase() ?? '';
  const isPdf    = ext === 'pdf' || mime.includes('pdf');
  const isImage  = ['jpg','jpeg','png','webp','gif'].includes(ext);

  // ── Step 1: Extract text ───────────────────────────────────────────────────
  let textContent = '';

  if (ext === 'txt') {
    textContent = buffer.toString('utf-8');

  } else if (isPdf) {
    try {
      const parsed = await getPdfParse()(buffer);
      textContent = (parsed.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      console.log(`[parse-application] pdf-parse: ${textContent.length} chars`);
    } catch (e) {
      console.warn('[parse-application] pdf-parse failed:', e instanceof Error ? e.message : e);
    }

    const pdfjs = await extractPdfjsContent(buffer);
    console.log(`[parse-application] pdfjs text: ${pdfjs.text.length} chars, form fields: ${pdfjs.formLines.length}`);
    if (pdfjs.text.length > textContent.length) textContent = pdfjs.text;
    if (pdfjs.formLines.length) {
      textContent = `FILLED FORM FIELDS:\n${pdfjs.formLines.join('\n')}\n\nDOCUMENT TEXT:\n${textContent}`;
    }

    if (textContent.replace(/\s/g, '').length < 200) {
      const raw = extractRawStringsFromPdf(buffer);
      console.log(`[parse-application] raw binary strings: ${raw.length} chars`);
      if (raw.length > textContent.length) textContent += '\n' + raw;
    }

  } else if (!isImage) {
    textContent = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  }

  textContent = explodeFormLabels(textContent).replace(
    /([a-z0-9])(?=(?:Use of funds|Use of proceeds|Purpose of funds|EIN\s*:|FEIN\s*:|SSN\s*:|Entity type))/gi,
    '$1 ',
  );

  // ── Step 2: Detect document type (caller can force app vs statement) ──────
  const forcedType = String(formData.get('documentType') ?? '').toLowerCase().trim();
  const isBank =
    forcedType === 'bank_statement' || forcedType === 'bank' || forcedType === 'statement'
      ? true
      : forcedType === 'application' || forcedType === 'app'
        ? false
        : isBankStatement(filename, textContent);
  const prompt = isBank ? BANK_PROMPT : APP_PROMPT;

  // ── Step 3: Extract fields ─────────────────────────────────────────────────
  let fields: Record<string, string> = {};

  const usableText = textContent.replace(/\s/g, '').length >= 100;

  if (isImage) {
    fields = await extractWithVisionAI(buffer, filename, prompt);
  } else if (usableText) {
    fields = await extractWithTextAI(textContent, prompt);
  } else if (isPdf && textContent.replace(/\s/g, '').length > 20) {
    fields = await extractWithTextAI(textContent, prompt);
  }

  const fromLabels = fieldsFromLabeledText(textContent);
  fields = mergeParsedFieldMaps(fromLabels, fields);
  fields = normalizeParsedFields(fields);

  console.log(`[parse-application] Extracted ${Object.keys(fields).length} field(s):`, Object.keys(fields));

  return NextResponse.json({
    fields,
    documentType: isBank ? 'bank_statement' : 'application',
    ...(Object.keys(fields).length === 0
      ? { warning: 'This appears to be a scanned PDF with no readable text layer. Please fill in the fields manually or use a digital/typed PDF for best results.' }
      : {}),
  });
}
