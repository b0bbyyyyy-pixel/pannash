/** Casper historically wrote sent_by = 'calvin'. Treat both as Casper. */
export function isCasperSender(v: string | null | undefined): boolean {
  const t = String(v ?? '').trim().toLowerCase();
  return t === 'casper' || t === 'calvin';
}

export const CASPER_SENT_BY = 'casper' as const;
