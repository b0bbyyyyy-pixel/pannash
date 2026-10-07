const DOCS_COMPLETE_MIN = 4;

export function isDocsComplete(count: number): boolean {
  return count >= DOCS_COMPLETE_MIN;
}

export function isOffersComplete(opts: {
  underwriting_data?: Record<string, unknown> | null;
  lead_status?: string | null;
  submissions?: { status?: string | null }[];
}): boolean {
  const ud = opts.underwriting_data || {};
  const offers = Array.isArray(ud.actualOffers) ? ud.actualOffers : [];
  if (offers.length > 0) return true;
  if (opts.submissions?.some(s => /approv/i.test(s.status || ''))) return true;
  if (/approv/i.test(opts.lead_status || '')) return true;
  return false;
}
