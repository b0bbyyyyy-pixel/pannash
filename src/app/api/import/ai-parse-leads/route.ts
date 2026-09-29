import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Papa from 'papaparse';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';

export const dynamic = 'force-dynamic';
// Allow up to 60s for large sheets
export const maxDuration = 60;

type ParsedRow = {
  name: string | null; email: string | null; phone: string | null; company: string | null;
  industry: string | null; address: string | null; city: string | null;
  state: string | null; zip: string | null; start_date: string | null;
};

const emptyRow = (): ParsedRow => ({
  name: null, email: null, phone: null, company: null,
  industry: null, address: null, city: null, state: null, zip: null, start_date: null,
});

/**
 * POST /api/import/ai-parse-leads
 * Body: { csv: string, expectedCount?: number }
 *
 * Uses Grok to map any column layout to lead fields.
 * Returns exactly one object per data row (same order) so the client can
 * write results back onto matching Google Sheets row numbers.
 */
export async function POST(req: NextRequest) {
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

  let csv: string;
  let expectedCount: number | undefined;
  try {
    const body = await req.json();
    csv = body.csv;
    expectedCount = typeof body.expectedCount === 'number' ? body.expectedCount : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'csv field is required' }, { status: 400 });
  }

  let ai: ReturnType<typeof getAIClient>;
  try {
    ai = getAIClient();
  } catch {
    return NextResponse.json(
      { error: 'XAI_API_KEY is not configured. Add it to your environment variables.' },
      { status: 500 }
    );
  }

  const parsedCsv = Papa.parse<string[]>(csv, { skipEmptyLines: false, header: false });
  const rows = (parsedCsv.data ?? []).filter((r): r is string[] => Array.isArray(r));
  let last = rows.length;
  while (last > 0 && !rows[last - 1].some(c => String(c ?? '').trim())) last--;
  const trimmed = rows.slice(0, last);

  if (trimmed.length < 2) {
    return NextResponse.json({ error: 'Sheet appears empty or has only one row.' }, { status: 422 });
  }

  const header = trimmed[0];
  const dataRows = trimmed.slice(1);

  const BATCH_SIZE = 80;

  const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

  const parseRow = (row: unknown): ParsedRow => {
    if (!row || typeof row !== 'object') return emptyRow();
    const r = row as Record<string, unknown>;
    return {
      name:       strOrNull(r.name),
      email:      strOrNull(r.email),
      phone:      strOrNull(r.phone),
      company:    strOrNull(r.company),
      industry:   strOrNull(r.industry),
      address:    strOrNull(r.address),
      city:       strOrNull(r.city),
      state:      strOrNull(r.state),
      zip:        strOrNull(r.zip),
      start_date: strOrNull(r.start_date),
    };
  };

  const padTo = (list: ParsedRow[], n: number): ParsedRow[] => {
    const next = list.slice(0, n);
    while (next.length < n) next.push(emptyRow());
    return next;
  };

  const batches: string[][][] = [];
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    batches.push(dataRows.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map(async (batch, idx) => {
      const batchCsv = Papa.unparse([header, ...batch]);
      try {
        const completion = await ai.chat.completions.create({
          model: GROK_MINI_MODEL,
          temperature: 0.0,
          messages: [
            {
              role: 'system',
              content: `You are a data extraction assistant for a business CRM.
You will receive CSV data with column headers. Extract lead information from EVERY data row, in the same order.

Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
The array MUST contain exactly as many objects as there are data rows (not counting the header).
Each element must be an object with exactly these keys:
  "name"       — Full name of the contact person (first + last). Combine separate first/last columns.
  "email"      — Email address (or null)
  "phone"      — Primary phone number string, preferring mobile/cell. Keep original format. (or null)
  "company"    — Business / company name (or null)
  "industry"   — Industry / business type / category, e.g. "Transportation", "Food & Beverage" (or null)
  "address"    — Business street address, e.g. "724 Baptist Church Rd" (or null)
  "city"       — Business city (or null)
  "state"      — Business state, 2-letter if possible (or null)
  "zip"        — Business ZIP code (or null)
  "start_date" — Business start / established date, e.g. "2022-07-22" (or null)

Rules:
- name should be a person name, NOT an email address or company name
- If first name and last name are in separate columns, concatenate them with a space
- If the only name-like column contains a company (LLC, Inc, Corp etc.), put it in company and leave name null
- NEVER put dollar amounts, revenue figures, or monetary values (e.g. "50,000.00", "$1.2M") into ANY field — leave those fields null instead
- Return null for any field you cannot find — do not guess or invent data
- Include a result for EVERY data row, even if most fields are null. Do not skip blank or messy rows — return an object of nulls for those.
- Skip the header row — only return data rows
- Do not reorder rows`,
            },
            { role: 'user', content: `Parse these ${batch.length} rows. Return exactly ${batch.length} JSON objects in the same order.\n\n${batchCsv}` },
          ],
        });
        const raw = completion.choices[0]?.message?.content ?? '[]';
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return padTo([], batch.length);
        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        return padTo(parsed.map(parseRow), batch.length);
      } catch (err) {
        console.error(`[ai-parse-leads] batch ${idx} failed:`, err);
        return padTo([], batch.length);
      }
    })
  );

  let allLeads = batchResults.flat();
  const target = expectedCount ?? dataRows.length;
  allLeads = padTo(allLeads, target);

  return NextResponse.json({ leads: allLeads });
}
