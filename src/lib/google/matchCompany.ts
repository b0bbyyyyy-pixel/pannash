const LEGAL = /\b(llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|co\.?|company|llp|pllc|p\.c\.?|dba)\b/gi;

/** Strip entity suffixes, punctuation, and trailing pack dates so folder names match lead.company. */
export function normalizeCompanyKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+\d{1,2}[_./-]\d{1,2}[_./-]\d{2,4}\s*$/, '')
    .replace(LEGAL, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function companyMatchScore(folderName: string, leadLabel: string): number {
  const a = normalizeCompanyKey(folderName);
  const b = normalizeCompanyKey(leadLabel);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 6 && longer.includes(shorter)) return 80 + Math.min(shorter.length, 19);
  const at = a.split(' ').filter(t => t.length > 1);
  const bt = new Set(b.split(' ').filter(t => t.length > 1));
  if (!at.length || !bt.size) return 0;
  const overlap = at.filter(t => bt.has(t)).length;
  const ratio = overlap / Math.max(at.length, bt.size);
  if (overlap >= 2 && ratio >= 0.6) return 50 + overlap * 5;
  return 0;
}

export type CompanyLead = { id: string; name: string | null; company: string | null };

export function bestLeadForFolder(folderName: string, leads: CompanyLead[]): { lead: CompanyLead; score: number } | null {
  let best: { lead: CompanyLead; score: number } | null = null;
  for (const lead of leads) {
    const score = Math.max(
      companyMatchScore(folderName, lead.company || ''),
      companyMatchScore(folderName, lead.name || ''),
    );
    if (score <= 0) continue;
    if (!best || score > best.score) best = { lead, score };
  }
  return best && best.score >= 50 ? best : null;
}

export function bestFolderForLead<T extends { name: string }>(
  leadLabel: string,
  folders: T[],
): { folder: T; score: number } | null {
  let best: { folder: T; score: number } | null = null;
  for (const folder of folders) {
    const score = companyMatchScore(folder.name, leadLabel);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { folder, score };
  }
  return best && best.score >= 50 ? best : null;
}

export function stripPackDate(name: string): string {
  return String(name || '').replace(/\s+\d{1,2}[_./-]\d{1,2}[_./-]\d{2,4}\s*$/, '').trim();
}
