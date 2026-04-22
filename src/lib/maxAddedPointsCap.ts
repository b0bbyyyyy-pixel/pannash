/**
 * Coerce string/number from DB or JSON; clamp to 1–50.
 */
export function parseMaxAddedPointsCap(
  value: number | string | null | undefined,
  fallback = 50
): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.round(n)));
}

const LS_PREFIX = 'pannash:leadMaxAddedPoints:';

/**
 * Remembers the "Max added points" from Add Lead when the DB column is not available in the client yet.
 */
export function setStoredLeadMaxAddedPoints(leadId: string, value: number) {
  if (typeof window === 'undefined' || !leadId) return;
  try {
    const n = parseMaxAddedPointsCap(value, 50);
    localStorage.setItem(LS_PREFIX + leadId, String(n));
  } catch {
    /* quota / private mode */
  }
}

function getStoredLeadMaxAddedPoints(leadId: string | undefined): number | null {
  if (typeof window === 'undefined' || !leadId) return null;
  try {
    const s = localStorage.getItem(LS_PREFIX + leadId);
    if (s == null || s === '') return null;
    return parseMaxAddedPointsCap(s, 50);
  } catch {
    return null;
  }
}

/**
 * Commission slider max. Uses DB when it is a non-50 value (set at create or by UPDATE).
 * If the column is the migration default 50, we prefer Add Lead localStorage so existing rows
 * are not stuck at 50 after `ALTER ... DEFAULT 50`.
 * Do not use `underwriting_data.leadMaxAddedPoints` (suite save overwrites with current cap).
 */
export function maxAddedPointsForLead(lead: {
  id?: string;
  max_added_points?: number | string | null;
} | null | undefined): number {
  if (!lead) return 50;
  const col =
    lead.max_added_points != null && lead.max_added_points !== ''
      ? parseMaxAddedPointsCap(lead.max_added_points, 50)
      : null;
  const stored = getStoredLeadMaxAddedPoints(lead.id);

  if (col != null && col !== 50) {
    return col;
  }
  if (stored != null) {
    return stored;
  }
  if (col != null) {
    return col;
  }
  return 50;
}

