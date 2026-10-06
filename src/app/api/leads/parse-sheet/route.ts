import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { normalizeParsedFields } from '@/lib/normalizeParsedFields';
import { parseLeadPasteText } from '@/lib/parse-lead-paste';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SHEET_PROMPT = `You extract merchant-funding lead data from a Google Sheets copy-paste.

The paste is usually one row (sometimes a header plus a row). Cells are tab-separated or comma-separated. Column order varies and headers may be missing.

A common unlabeled layout:
timestamp, company, owner full name, street address, phone, city, state, zip, first name, last name, SSN, DOB, monthly revenue, industry, business start date, EIN, unused/null cells, ISO or office, pipeline status, extra phone.

Rules:
- Parse the FIRST data row only (skip a header if present).
- SSN is ###-##-#### (or 9 digits). EIN / Federal Tax ID is ##-#######. Never swap them.
- Ignore timestamps, the words null/None/N/A, pipeline statuses (In Underwriting, New Lead, etc.), and ISO/office names unless they are clearly the legal company.
- Combine first + last into name when full name is missing.
- 10-digit numbers are phones. Prefer the owner cell.
- A dollar-like amount (e.g. 120920.82) is monthlyRevenue unless clearly labeled as something else.
- DOB years are typically 1940–2010. Business start date is the company founding date (often later).
- If only one street address exists, copy it to both homeAddress and businessAddress, and copy city/state/zip to both home and business city/state/zip.
- Omit empty fields. Do not invent email. Do not put revenue into name/company/address.

Return ONLY a raw JSON object (no markdown) using these keys when present:
{
  "name": "Owner full name",
  "email": "Owner email",
  "phone": "Owner mobile/cell",
  "dob": "Date of birth",
  "ssn": "SSN",
  "homeAddress": "Street address",
  "city": "City",
  "state": "2-letter state",
  "zip": "ZIP",
  "company": "Legal business name",
  "dba": "DBA",
  "businessAddress": "Business street",
  "businessCity": "Business city",
  "businessState": "Business state",
  "businessZip": "Business ZIP",
  "industry": "Industry / business type",
  "businessStartDate": "Business start date",
  "ein": "EIN / Federal Tax ID",
  "entityType": "LLC / Corp / Sole Prop etc.",
  "businessPhone": "Business phone",
  "monthlyRevenue": "Monthly revenue (digits only)",
  "requestedAmount": "Requested amount (digits only)",
  "creditScore": "Credit score"
}`;

function safeJson(raw: string): Record<string, string> {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const objMatch = clean.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(objMatch ? objMatch[0] : clean) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || v === '') continue;
      const s = String(v).trim();
      if (s && s !== 'null' && s !== 'undefined' && s.toLowerCase() !== 'none' && s.toLowerCase() !== 'n/a') {
        result[k] = s;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function heuristicFields(text: string): Record<string, string> {
  const p = parseLeadPasteText(text);
  const out: Record<string, string> = {};
  const keys = [
    'name', 'email', 'phone', 'company', 'ssn', 'ein', 'dob', 'homeAddress',
    'city', 'state', 'zip', 'industry', 'businessStartDate', 'businessPhone',
    'monthlyRevenue', 'creditScore', 'requestedAmount',
  ] as const;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  if (out.homeAddress && !out.businessAddress) out.businessAddress = out.homeAddress;
  if (out.city && !out.businessCity) out.businessCity = out.city;
  if (out.state && !out.businessState) out.businessState = out.state;
  if (out.zip && !out.businessZip) out.businessZip = out.zip;
  return out;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let text = '';
  try {
    const body = await request.json();
    text = typeof body?.text === 'string' ? body.text : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  text = text.trim();
  if (!text) return NextResponse.json({ error: 'Paste a Google Sheets row first.' }, { status: 400 });
  if (text.length > 20000) text = text.slice(0, 20000);

  const fallback = heuristicFields(text);
  let fields: Record<string, string> = {};

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: GROK_MINI_MODEL,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: SHEET_PROMPT },
        { role: 'user', content: `SHEET PASTE:\n\n${text}` },
      ],
    });
    fields = safeJson(completion.choices[0]?.message?.content?.trim() ?? '{}');
  } catch (e) {
    console.error('[parse-sheet] AI failed:', e instanceof Error ? e.message : e);
  }

  fields = normalizeParsedFields({ ...fallback, ...fields });

  if (Object.keys(fields).length === 0) {
    return NextResponse.json(
      { error: 'Could not read that paste. Copy one row from Google Sheets and try again.', fields: {} },
      { status: 422 }
    );
  }

  return NextResponse.json({ fields });
}
