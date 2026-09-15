import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
// Lazy-loaded inside the handler to avoid pdf-parse self-test at module init
type PdfParseResult = { text: string };
let _pdfParse: ((buf: Buffer) => Promise<PdfParseResult>) | null = null;
function getPdfParse(): (buf: Buffer) => Promise<PdfParseResult> {
  if (!_pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _pdfParse = require('pdf-parse');
  }
  return _pdfParse!;
}

// Fields the model should try to extract
const SYSTEM_PROMPT = `You are a data extraction specialist for business funding applications.
Extract ALL available fields from the provided application text and return a JSON object.
Only include fields that are clearly present in the text — do NOT invent values.
Return ONLY raw JSON, no markdown fences.

JSON schema (all fields optional):
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
  "requestedAmount": "Requested funding amount (number string)",
  "monthlyRevenue": "Average monthly gross revenue (number string)",
  "avgDailyBalance": "Average daily bank balance (number string)",
  "purposeOfFunds": "Use of funds",
  "owner2FirstName": "Second owner first name",
  "owner2LastName": "Second owner last name",
  "owner2Ownership": "Second owner ownership %",
  "owner2DOB": "Second owner DOB",
  "owner2SSN": "Second owner SSN"
}`;

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Parse multipart ───────────────────────────────────────────────────────
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|txt)$/i)) {
    return NextResponse.json({ error: 'Unsupported file type. Upload PDF, DOC, DOCX, or TXT.' }, { status: 400 });
  }

  // ── Extract raw text ──────────────────────────────────────────────────────
  let rawText = '';
  try {
      const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const parsed = await getPdfParse()(buffer);
      rawText = parsed.text;
    } else {
      // DOC/DOCX/TXT — decode as UTF-8 (works for TXT; DOC may be partial)
      rawText = buffer.toString('utf-8');
    }
  } catch (err) {
    console.error('Text extraction error:', err);
    return NextResponse.json({ error: 'Failed to extract text from file.' }, { status: 422 });
  }

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'No readable text found in the file.' }, { status: 422 });
  }

  // Limit to first 12 000 chars to stay within token limits
  const truncated = rawText.slice(0, 12000);

  // ── OpenAI extraction ─────────────────────────────────────────────────────
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let parsed: Record<string, string> = {};
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `APPLICATION TEXT:\n\n${truncated}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error('OpenAI parse error:', err);
    return NextResponse.json({ error: 'AI parsing failed — try again.' }, { status: 500 });
  }

  // Remove empty/null values
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v && String(v).trim()) result[k] = String(v).trim();
  }

  return NextResponse.json({ fields: result });
}
