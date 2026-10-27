export const MMS_MAX_BYTES = 5 * 1024 * 1024;
export const MMS_MAX_FILES = 5;
export const MMS_COLUMN = 'mms';

export const MMS_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type MmsMime = (typeof MMS_TYPES)[number];

export type OutboundMmsIn = {
  path: string;
  type: MmsMime;
  name: string;
};

export type MediaItemRow = {
  path?: string;
  sid?: string;
  type: string;
  savedAt?: string | null;
};

export function isAttachmentPlaceholder(body: string | null | undefined) {
  return /^Attachment:\s*\d+\s+(Photo|Photos|PDF|PDFs|file|files)$/i.test(String(body ?? '').trim());
}

export function attachmentSmsBody(types: string[]) {
  const photos = types.filter(t => t.startsWith('image/')).length;
  const pdfs = types.filter(t => t.includes('pdf')).length;
  const n = types.length;
  if (photos && !pdfs) return `Attachment: ${photos} Photo${photos === 1 ? '' : 's'}`;
  if (pdfs && !photos) return `Attachment: ${pdfs} PDF${pdfs === 1 ? '' : 's'}`;
  return `Attachment: ${n} file${n === 1 ? '' : 's'}`;
}

export function normalizeMmsType(type?: string | null, name?: string | null): MmsMime | null {
  const t = String(type || '').toLowerCase().split(';')[0].trim();
  const n = String(name || '').toLowerCase();
  if (t === 'image/jpeg' || t === 'image/jpg' || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (t === 'image/png' || n.endsWith('.png')) return 'image/png';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'application/pdf';
  return null;
}

export function classifyMmsFile(file: { name: string; type: string; size: number }):
  { ok: true; type: MmsMime } | { ok: false; error: string } {
  const type = normalizeMmsType(file.type, file.name);
  if (!type) return { ok: false, error: `${file.name} must be a JPEG, PNG, or PDF.` };
  if (file.size > MMS_MAX_BYTES) {
    return { ok: false, error: `${file.name} is too large (max ${Math.round(MMS_MAX_BYTES / (1024 * 1024))} MB).` };
  }
  if (file.size < 1) return { ok: false, error: `${file.name} is empty.` };
  return { ok: true, type };
}

export function isOwnedMmsPath(path: string, userId: string, leadId: string) {
  const clean = String(path || '').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || clean.includes('\\')) return false;
  return clean.startsWith(`${userId}/${leadId}/${MMS_COLUMN}/`);
}

export function parseOutboundMedia(raw: unknown): OutboundMmsIn[] {
  if (!Array.isArray(raw)) return [];
  const out: OutboundMmsIn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { path?: unknown; type?: unknown; name?: unknown };
    const path = String(rec.path || '').trim();
    const name = String(rec.name || path.split('/').pop() || 'file');
    const type = normalizeMmsType(String(rec.type || ''), name);
    if (!path || !type) continue;
    out.push({ path, type, name });
    if (out.length >= MMS_MAX_FILES) break;
  }
  return out;
}

export function mediaItemsFromOutbound(media: OutboundMmsIn[]): MediaItemRow[] {
  return media.map(m => ({ path: m.path, type: m.type, savedAt: null }));
}

export async function signedMmsFetchUrls(
  store: {
    storage: {
      from: (bucket: string) => {
        createSignedUrl: (
          path: string,
          expiresIn: number,
        ) => Promise<{ data: { signedUrl?: string } | null; error: { message?: string } | null }>;
      };
    };
  },
  paths: string[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await store.storage.from('lead-attachments').createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Could not prepare the attachment for sending.');
    }
    urls.push(data.signedUrl);
  }
  return urls;
}
