const warned = new Set<string>();

export function isMissingSchema(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string } | null;
  const code = String(e?.code || '');
  const msg = `${e?.message || ''} ${e?.details || ''}`;
  return (
    code === '42703' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    /column .* does not exist/i.test(msg) ||
    /could not find the (function|table)/i.test(msg) ||
    /schema cache/i.test(msg) ||
    /does not exist/i.test(msg)
  );
}

/** One warn per key for the process lifetime. Never include secrets. */
export function warnMissingSchema(key: string, err?: unknown) {
  if (warned.has(key)) return;
  warned.add(key);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code || '') : '';
  console.warn(`[casper] missing schema (${key})${code ? ` ${code}` : ''} — using current behavior`);
}

export function railResultString(result: { ok: boolean; result?: string } | null | undefined): string {
  if (!result) return '';
  if (result.result) return result.result;
  return result.ok ? 'ok' : 'blocked: unknown';
}
