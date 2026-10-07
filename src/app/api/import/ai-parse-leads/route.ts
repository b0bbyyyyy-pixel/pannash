import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Papa from 'papaparse';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import { looksLikeHeaderRow, mergeSheetLead } from '@/lib/import/extractSheetLead';

export const dynamic = 'force-dynamic';
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

function parseJsonArray(raw: string): unknown[] {
  const start = raw.indexOf('[');
  if (start < 0) return [];
  let s = raw.slice(start);
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch { /* truncated — keep complete objects */ }
  const last = s.lastIndexOf('}');
  if (last < 0) return [];
  s = `${s.slice(0, last + 1)}]`;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * POST /api/import/ai-parse-leads
 * Body: { csv: string, expectedCount?: number }
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

  if (trimmed.length < 1) {
    return NextResponse.json({ error: 'Sheet appears empty.' }, { status: 422 });
  }

  const hasHeader = looksLikeHeaderRow(trimmed[0]);
  const header = hasHeader
    ? trimmed[0]
    : Array.from({ length: Math.max(...trimmed.map(r => r.length), 1) }, (_, i) => `col_${i}`);
  const dataRows = hasHeader ? trimmed.slice(1) : trimmed;

  if (!dataRows.length) {
    return NextResponse.json({ error: 'Sheet appears empty or has only a header.' }, { status: 422 });
  }

  const BATCH_SIZE = 40;

  const strOrNull = (v: unknown): string | null => {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (!s || s === 'null' || s === 'undefined') return null;
    return s;
  };

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
          max_tokens: 8000,
          messages: [
            {
              role: 'system',
              content: `You extract merchant leads from a spreadsheet. Return ONLY a JSON array — no markdown, no fences.

The array MUST have exactly one object per data row, same order. Never skip a row. Blank rows → all-null object.

Each object keys:
  "name"       — person first + last. Combine separate first/last columns (often two short columns just before email).
  "email"      — email or null
  "phone"      — 10+ digit phone, prefer mobile/cell. Keep digits. or null
  "company"    — legal business name (LLC, Inc, Corp, Services, etc.). NEVER put industry here.
  "industry"   — category only, e.g. "Construction & Home", "Food & Beverage". Not the company.
  "address"    — street address or null
  "city"       — city or null
  "state"      — 2-letter state or null
  "zip"        — ZIP or null
  "start_date" — business start date or null

Rules:
- Common layout (headers may be missing): company, industry, date, address, first, last, email, extra, phone, phone.
- Company is usually the first long text cell and often contains LLC/Inc/Corp. Copy it even if it has digits (e.g. "J-4 Removal LLC").
- Do not use "Construction & Home" or similar categories as company.
- name is a person, never a company or email.
- Never put dollar amounts into any field.
- Include EVERY data row. Do not reorder.`,
            },
            { role: 'user', content: `Parse these ${batch.length} data rows. Return exactly ${batch.length} JSON objects in the same order.\n\n${batchCsv}` },
          ],
        });
        const raw = completion.choices[0]?.message?.content ?? '[]';
        const parsed = parseJsonArray(raw);
        return padTo(parsed.map(parseRow), batch.length);
      } catch (err) {
        console.error(`[ai-parse-leads] batch ${idx} failed:`, err);
        return padTo([], batch.length);
      }
    })
  );

  let allLeads = batchResults.flat();
  const target = expectedCount ?? dataRows.length;
  allLeads = padTo(allLeads, target).map((lead, i) => mergeSheetLead(lead, dataRows[i] ?? []) as ParsedRow);

  return NextResponse.json({ leads: allLeads });
}
