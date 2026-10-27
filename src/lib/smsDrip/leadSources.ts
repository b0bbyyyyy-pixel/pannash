export const BUILTIN_LEAD_SOURCES = [
  { key: 'ai-full-packs', label: 'AI Full Packs' },
  { key: 'old-ai-full-packs', label: 'Old AI Full Packs' },
  { key: 'new-data', label: 'New Data' },
  { key: 'old-data', label: 'Old Data' },
] as const;

export type LeadSource = { key: string; label: string };

export function slugLeadSource(raw: string) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function guessLeadSource(name: string | null | undefined): LeadSource | null {
  const n = String(name || '').toLowerCase();
  if (!n.trim()) return null;
  if (/old\s*ai\s*full\s*packs?/.test(n)) return { key: 'old-ai-full-packs', label: 'Old AI Full Packs' };
  if (/ai\s*full\s*packs?/.test(n)) return { key: 'ai-full-packs', label: 'AI Full Packs' };
  if (/new\s*data/.test(n)) return { key: 'new-data', label: 'New Data' };
  if (/old\s*data/.test(n)) return { key: 'old-data', label: 'Old Data' };
  return null;
}

export function sourceFromStored(raw: string | null | undefined): LeadSource | null {
  const stored = String(raw || '').trim();
  if (!stored) return null;
  const byKey = BUILTIN_LEAD_SOURCES.find(s => s.key === stored);
  if (byKey) return byKey;
  const byLabel = BUILTIN_LEAD_SOURCES.find(s => s.label.toLowerCase() === stored.toLowerCase());
  if (byLabel) return byLabel;
  return { key: slugLeadSource(stored), label: stored };
}

export function resolveListSource(list: { name?: string | null; source_category?: string | null }): LeadSource {
  return sourceFromStored(list.source_category) || guessLeadSource(list.name) || { key: 'uncategorized', label: 'Uncategorized' };
}

export function isFullPacksSource(source: LeadSource | string | null | undefined) {
  const key = typeof source === 'string' ? source : source?.key || '';
  const label = typeof source === 'string' ? source : source?.label || '';
  return /full-?packs?/.test(key) || /full\s*packs?/i.test(label);
}

export function optimizedPackId(sourceKey: string | null | undefined) {
  const key = slugLeadSource(sourceKey || '');
  return key ? `optimized:${key}` : 'optimized';
}

export function optimizedPackName(sourceLabel: string | null | undefined) {
  const label = String(sourceLabel || '').trim();
  if (!label || /^uncategorized$/i.test(label)) return 'Optimized';
  return `Optimized · ${label}`;
}

export function isOptimizedPack(p: { id?: string; name?: string } | null | undefined) {
  if (!p) return false;
  const id = String(p.id || '');
  const name = String(p.name || '').trim();
  return id === 'optimized' || id.startsWith('optimized:') || /^optimized(\s*·|$)/i.test(name);
}

export function sourceKeyFromOptimizedId(id: string) {
  const raw = String(id || '');
  if (raw.startsWith('optimized:')) return raw.slice('optimized:'.length);
  return '';
}

export async function loadLeadListSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{
  lists: { id: string; name: string; key: string; label: string; stored: boolean }[];
  columnReady: boolean;
}> {
  let columnReady = true;
  let res = await supabase
    .from('lead_lists')
    .select('id, name, source_category')
    .eq('user_id', userId);
  if (res.error && /source_category/i.test(res.error.message || '')) {
    columnReady = false;
    res = await supabase.from('lead_lists').select('id, name').eq('user_id', userId);
  }
  const lists = (res.data ?? []).map((row: { id: string; name?: string | null; source_category?: string | null }) => {
    const source = resolveListSource(row);
    return {
      id: row.id,
      name: String(row.name || ''),
      key: source.key,
      label: source.label,
      stored: Boolean(String(row.source_category || '').trim()),
    };
  });

  if (columnReady) {
    const missing = lists.filter(l => !l.stored && l.key);
    for (const list of missing.slice(0, 40)) {
      await supabase
        .from('lead_lists')
        .update({ source_category: list.key })
        .eq('id', list.id)
        .eq('user_id', userId);
    }
  }

  return { lists, columnReady };
}
