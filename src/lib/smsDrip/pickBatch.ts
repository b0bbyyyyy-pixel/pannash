export const PICK_MODES = ['all', 'first', 'last', 'random'] as const;
export type PickMode = (typeof PICK_MODES)[number];

export function parsePickMode(raw: unknown): PickMode {
  const s = String(raw || 'all');
  return PICK_MODES.includes(s as PickMode) ? s as PickMode : 'all';
}

export function parsePickCount(raw: unknown, listSize: number) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return listSize;
  return Math.min(listSize, Math.max(1, n));
}

/** Keep original order. first/last follow the array as shown (newest first in campaigns). */
export function pickBatch<T>(rows: T[], mode: PickMode, count: number): T[] {
  if (!rows.length || mode === 'all' || count >= rows.length) return rows;
  const n = Math.max(1, Math.min(count, rows.length));
  if (mode === 'first') return rows.slice(0, n);
  if (mode === 'last') return rows.slice(-n);
  const idx = rows.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  const chosen = new Set(idx.slice(0, n));
  return rows.filter((_, i) => chosen.has(i));
}
