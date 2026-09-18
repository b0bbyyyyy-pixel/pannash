import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';

export const dynamic = 'force-dynamic';
// Allow up to 60s for large sheets
export const maxDuration = 60;

/**
 * POST /api/import/ai-parse-leads
 * Body: { csv: string }  — raw CSV text from Google Sheets
 *
 * Uses Grok to intelligently map any column layout to
 * { name, email, phone, company } regardless of header names.
 * Processes in batches of 150 data rows so large sheets never time out.
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
  try {
    ({ csv } = await req.json());
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

  // Split into header + data lines, stripping blanks
  const lines = csv.split('\n').map(l => l.trimEnd()).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: 'Sheet appears empty or has only one row.' }, { status: 422 });
  }

  const headerLine = lines[0];
  const dataLines  = lines.slice(1);

  const BATCH_SIZE = 150;
  const allLeads: Array<{ name: string | null; email: string | null; phone: string | null; company: string | null }> = [];

  const SYSTEM_PROMPT = `You are a data extraction assistant for a business CRM.
You will receive CSV data with column headers. Your job is to extract lead information from EVERY data row.

Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
Each element must be an object with exactly these keys:
  "name"    — Full name of the contact person (first + last). Combine separate first/last columns.
  "email"   — Email address (or null)
  "phone"   — Primary phone number string, preferring mobile/cell. Keep original format. (or null)
  "company" — Business / company name (or null)

Rules:
- name should be a person name, NOT an email address or company name
- If first name and last name are in separate columns, concatenate them with a space
- If the only name-like column contains a company (LLC, Inc, Corp etc.), put it in company and leave name null
- Return null for any field you cannot find — do not guess or invent data
- Include a result for EVERY data row, even if most fields are null
- Skip the header row — only return data rows`;

  for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
    const batch = dataLines.slice(i, i + BATCH_SIZE);
    const batchCsv = [headerLine, ...batch].join('\n');

    try {
      const completion = await ai.chat.completions.create({
        model: GROK_MINI_MODEL,
        temperature: 0.0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Parse these ${batch.length} rows:\n\n${batchCsv}` },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '[]';

      // Extract JSON array even if the model wraps in code fences
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        for (const row of parsed) {
          if (row && typeof row === 'object') {
            const r = row as Record<string, unknown>;
            allLeads.push({
              name:    typeof r.name    === 'string' && r.name    ? r.name    : null,
              email:   typeof r.email   === 'string' && r.email   ? r.email   : null,
              phone:   typeof r.phone   === 'string' && r.phone   ? r.phone   : null,
              company: typeof r.company === 'string' && r.company ? r.company : null,
            });
          }
        }
      }
    } catch (batchErr) {
      console.error(`[ai-parse-leads] batch ${i}–${i + BATCH_SIZE} failed:`, batchErr);
      // Continue with remaining batches instead of aborting
    }
  }

  return NextResponse.json({ leads: allLeads });
}
