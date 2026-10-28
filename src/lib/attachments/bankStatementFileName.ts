/** BANK JUL 7269.pdf — month from the statement, last 4 only when found. */

const MONTHS3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export function monthAbbrev3(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  const named = s.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
  );
  if (named) {
    const idx = MONTH_INDEX[named[1].toLowerCase()];
    if (idx != null) return MONTHS3[idx];
  }

  const iso = s.match(/(20\d{2}|19\d{2})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (iso) {
    const mi = Number(iso[2]) - 1;
    if (mi >= 0 && mi < 12) return MONTHS3[mi];
  }

  const compact = s.match(/(?:^|[^\d])(20\d{2}|19\d{2})(0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])?(?:[^\d]|$)/);
  if (compact) return MONTHS3[Number(compact[2]) - 1];

  const mmyyyy = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (mmyyyy) {
    const mi = Number(mmyyyy[1]) - 1;
    if (mi >= 0 && mi < 12) return MONTHS3[mi];
  }

  return '';
}

export function last4Account(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  const last4 = digits.slice(-4);
  return /^0+$/.test(last4) ? '' : last4;
}

function last4FromFilename(name: string): string {
  const m = name.match(/statements[-_ ](\d{4})\b/i);
  if (m && !/^0+$/.test(m[1])) return m[1];
  return '';
}

function fileExtension(name: string): string {
  const m = String(name || '').match(/(\.[a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : '.pdf';
}

export function bankStatementFileName(opts: {
  statementMonth?: unknown;
  accountNumber?: unknown;
  originalName?: string;
}): string | null {
  const original = opts.originalName || '';
  const month = monthAbbrev3(opts.statementMonth) || monthAbbrev3(original);
  if (!month) return null;
  const last4 = last4Account(opts.accountNumber) || last4FromFilename(original);
  const ext = fileExtension(original);
  return last4 ? `BANK ${month} ${last4}${ext}` : `BANK ${month}${ext}`;
}

export function statementMonthFromAnalyzerMetrics(metrics: Record<string, unknown>): unknown {
  if (metrics.period_end) return metrics.period_end;
  if (metrics.period_label) return metrics.period_label;
  if (metrics.period_start) return metrics.period_start;
  const summary = Array.isArray(metrics.monthly_summary) ? metrics.monthly_summary : [];
  const last = summary[summary.length - 1];
  if (last && typeof last === 'object' && last && 'month' in last) return (last as { month?: unknown }).month;
  const revenue = Array.isArray(metrics.monthly_revenue) ? metrics.monthly_revenue : [];
  const lastRev = revenue[revenue.length - 1];
  if (lastRev && typeof lastRev === 'object' && lastRev && 'month' in lastRev) {
    return (lastRev as { month?: unknown }).month;
  }
  return undefined;
}

export async function renameBankStatementAfterParse(
  // Server supabase client — keep loose so route handlers can pass their instance.
  supabase: { from: (table: string) => any },
  args: {
    userId: string;
    id: string;
    currentName: string;
    fields: Record<string, unknown>;
  },
): Promise<string | undefined> {
  const next = bankStatementFileName({
    statementMonth:
      args.fields.statementMonth
      ?? args.fields.period_end
      ?? args.fields.period_label
      ?? args.fields.period_start
      ?? statementMonthFromAnalyzerMetrics(args.fields),
    accountNumber:
      args.fields.accountNumber
      ?? args.fields.account_number
      ?? args.fields.account,
    originalName: args.currentName,
  });
  if (!next || next === args.currentName) return undefined;
  const { error } = await supabase
    .from('lead_attachments')
    .update({ file_name: next })
    .eq('id', args.id)
    .eq('user_id', args.userId);
  if (error) {
    console.warn('[rename-bank] failed', args.id, error.message);
    return undefined;
  }
  return next;
}
