/** Detect LLC / Inc / Corp (and similar) at the end of a legal name. Longer forms first. */
const ENTITY_SUFFIXES: { type: string; pattern: RegExp }[] = [
  { type: 'PLLC', pattern: /(?:,|\s)+(?:p\.?\s*l\.?\s*l\.?\s*c\.?|professional\s+limited\s+liability\s+company)\s*$/i },
  { type: 'LLC', pattern: /(?:,|\s)+(?:l\.?\s*l\.?\s*c\.?|limited\s+liability\s+company|limited\s+liability\s+co\.?)\s*$/i },
  { type: 'LLP', pattern: /(?:,|\s)+(?:l\.?\s*l\.?\s*p\.?|limited\s+liability\s+partnership)\s*$/i },
  { type: 'LP', pattern: /(?:,|\s)+(?:limited\s+partnership|l\.?\s*p\.?)\s*$/i },
  { type: 'PC', pattern: /(?:,|\s)+(?:professional\s+corporation|p\.?\s*c\.?)\s*$/i },
  { type: 'Inc', pattern: /(?:,|\s)+(?:incorporated|inc\.?)\s*$/i },
  { type: 'Corp', pattern: /(?:,|\s)+(?:corporation|corp\.?)\s*$/i },
  { type: 'Ltd', pattern: /(?:,|\s)+(?:limited|ltd\.?)\s*$/i },
];

export function inferFromLegalName(legalName: string): { dba: string; entityType: string | null } {
  const name = legalName.replace(/\s+/g, ' ').trim().replace(/[.,;]+$/g, '').trim();
  if (!name) return { dba: '', entityType: null };
  for (const { type, pattern } of ENTITY_SUFFIXES) {
    if (pattern.test(name)) {
      const dba = name.replace(pattern, '').replace(/[.,;]+$/g, '').trim();
      return { dba: dba || name, entityType: type };
    }
  }
  return { dba: name, entityType: null };
}

/** Fill empty DBA / entity type from the legal business name after AI parse. */
export function enrichParsedBusinessFields(fields: Record<string, string>): Record<string, string> {
  const next = { ...fields };
  const legal = (next.company || '').trim();
  if (!legal) return next;
  const inferred = inferFromLegalName(legal);
  if (!String(next.dba || '').trim() && inferred.dba) next.dba = inferred.dba;
  if (!String(next.entityType || '').trim() && inferred.entityType) next.entityType = inferred.entityType;
  return next;
}
