const KEY = 'gostwrk:ai-parse-leads';

export type CachedAiLead = {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  industry?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  startDate?: string | null;
};

export type CachedAiParse = {
  listId: string;
  fingerprint: string;
  from: number;
  to: number;
  leads: CachedAiLead[];
  at: number;
};

export function aiParseFingerprint(csv: string, from: number, to: number) {
  return `${csv.length}:${from}:${to}:${csv.slice(0, 48)}:${csv.slice(-48)}`;
}

export function saveAiParseResult(data: CachedAiParse) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function takeAiParseForList(listId: string, fingerprint?: string): CachedAiParse | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAiParse;
    if (!parsed || parsed.listId !== listId) return null;
    if (fingerprint && parsed.fingerprint !== fingerprint) return null;
    if (Date.now() - (parsed.at || 0) > 6 * 60 * 60 * 1000) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    sessionStorage.removeItem(KEY);
    return parsed;
  } catch {
    return null;
  }
}
