export type OfferEpoOption = {
  days: number;
  amount: number;
  factorRate?: number;
};

export type ParsedOfferFields = {
  verdict: 'approved' | 'declined' | 'other';
  offerType: 'mca' | 'loc' | null;
  lenderName: string | null;
  amount: number | null;
  buyRate: number | null;
  addedPoints: number | null;
  factorRate: number | null;
  termLength: number | null;
  paymentFrequency: string | null;
  monthlyAPR: number | null;
  locTermMonths: number | null;
  locPaymentFrequency: string | null;
  url: string | null;
  notes: string | null;
  epoOptions: OfferEpoOption[];
};

export const EMPTY_OFFER_FIELDS: ParsedOfferFields = {
  verdict: 'other',
  offerType: null,
  lenderName: null,
  amount: null,
  buyRate: null,
  addedPoints: null,
  factorRate: null,
  termLength: null,
  paymentFrequency: null,
  monthlyAPR: null,
  locTermMonths: null,
  locPaymentFrequency: null,
  url: null,
  notes: null,
  epoOptions: [],
};

/** Lender max commission/points on the offer (12.00% max → 12). Not broker split. */
export function extractMaxCommissionPoints(text: string): number | null {
  if (!text) return null;
  const patterns = [
    /commission[^.\d%]{0,40}(\d+(?:\.\d+)?)\s*%\s*max/i,
    /(\d+(?:\.\d+)?)\s*%\s*max(?:imum)?(?:\s+commission)?/i,
    /max(?:imum)?\s+(?:commission|points|comm)[^\d%]{0,24}(\d+(?:\.\d+)?)\s*%?/i,
    /"?(?:maxCommission|commissionMax|max_commission|maxPoints)"?\s*[:=]\s*"?(\d+(?:\.\d+)?)/i,
    /commission[^\d%]{0,24}(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 50) return n;
  }
  return null;
}

function asNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Buyout $ at the full offer amount. Factor 1.15 → amount when offer $ is known. */
export function normalizeEpoOptions(raw: unknown, offerAmount?: number | null): OfferEpoOption[] {
  if (!Array.isArray(raw)) return [];
  const byDays = new Map<number, OfferEpoOption>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    let days = asNum(rec.days);
    const weeks = asNum(rec.weeks);
    if (days == null || days <= 0) {
      if (weeks != null && weeks > 0) days = Math.round(weeks * 7);
      else continue;
    }
    let factor = asNum(rec.factorRate ?? rec.factor ?? rec.buyRate);
    if (factor != null && factor > 5) factor = factor / 100;
    if (factor != null && factor < 1) factor = null;
    let amount = asNum(rec.amount ?? rec.buyout ?? rec.buyoutAmount);
    if ((amount == null || amount <= 0) && factor != null && offerAmount && offerAmount > 0) {
      amount = Math.round(offerAmount * factor);
    }
    const row: OfferEpoOption = {
      days: Math.round(days),
      amount: amount != null && amount >= 0 ? Math.round(amount) : 0,
    };
    if (factor != null) row.factorRate = factor;
    byDays.set(row.days, row);
  }
  return [...byDays.values()].sort((a, b) => a.days - b.days).slice(0, 8);
}

export function settleEpoOptions(opts: OfferEpoOption[] | undefined, offerAmount: number): OfferEpoOption[] {
  return normalizeEpoOptions(opts ?? [], offerAmount).filter(o => o.days > 0);
}

export function formatEpoSummary(opts: OfferEpoOption[] | undefined): string {
  if (!opts?.length) return '';
  return opts.map(o => {
    const buy = o.amount > 0
      ? `$${Math.round(o.amount).toLocaleString()}`
      : o.factorRate
        ? `${o.factorRate.toFixed(2)}x`
        : '';
    return `${o.days}d${buy ? ` ${buy}` : ''}`;
  }).join(' · ');
}
