import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { mergeParsedFieldMaps, normalizeParsedFields } from '@/lib/normalizeParsedFields';
import { analyzeStoredBankPdf } from '@/lib/pdf/analyzeStoredBankPdf';
import { hasBankMetrics } from '@/lib/pdf/extractBankMetrics';
import {
  averagesFromMonths,
  mergeStatementMonths,
  statementMonthFromFields,
  type StatementMonth,
} from '@/lib/bankAnalyzer';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { attachmentIds?: unknown };
  const ids = (Array.isArray(body.attachmentIds) ? body.attachmentIds : [])
    .map(v => String(v || '').trim())
    .filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: 'No statements selected' }, { status: 400 });

  let merged: Record<string, string> = {};
  const months: StatementMonth[] = [];
  const perFile: Array<{ id: string; name: string; fields: string[] }> = [];

  for (const id of ids.slice(0, 8)) {
    const { data: att } = await supabase
      .from('lead_attachments')
      .select('file_path, file_name, file_type')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!att?.file_path) {
      console.warn('[analyze-bank-docs] missing attachment', id);
      continue;
    }
    const { data: blob, error: dlErr } = await supabase.storage.from('lead-attachments').download(att.file_path);
    if (dlErr || !blob) {
      console.warn('[analyze-bank-docs] download failed', att.file_name, dlErr?.message);
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    const fields = await analyzeStoredBankPdf(buffer, att.file_name);
    perFile.push({ id, name: att.file_name, fields: Object.keys(fields) });
    const row = statementMonthFromFields(fields);
    if (row) months.push(row);
    merged = mergeParsedFieldMaps(merged, fields);
  }

  const uniqueMonths = mergeStatementMonths([], months);
  if (uniqueMonths.length) {
    merged.statementMonths = JSON.stringify(uniqueMonths);
    const avgs = averagesFromMonths(uniqueMonths);
    for (const [k, v] of Object.entries(avgs)) merged[k] = String(v);
    if (avgs.depositsCount != null) merged.depositCount = String(avgs.depositsCount);
  }

  merged = normalizeParsedFields(merged);
  console.log('[analyze-bank-docs] merged', Object.keys(merged), perFile);

  return NextResponse.json({
    fields: merged,
    perFile,
    ok: hasBankMetrics(merged),
  });
}
