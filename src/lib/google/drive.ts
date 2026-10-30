export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: number;
  isFolder: boolean;
};

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const GDOC = 'application/vnd.google-apps.document';
const FIELDS = 'nextPageToken,files(id,name,mimeType,modifiedTime,size,shortcutDetails(targetId,targetMimeType))';

export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function mapFile(f: DriveApiFile): DriveItem | null {
  if (!f.id || !f.name) return null;
  const isShortcut = f.mimeType === SHORTCUT;
  const mime = isShortcut ? (f.shortcutDetails?.targetMimeType || f.mimeType || '') : (f.mimeType || '');
  const id = isShortcut ? (f.shortcutDetails?.targetId || f.id) : f.id;
  return {
    id,
    name: f.name,
    mimeType: mime,
    modifiedTime: f.modifiedTime,
    size: f.size ? Number(f.size) : undefined,
    isFolder: mime === FOLDER,
  };
}

async function driveJson(token: string, url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error && typeof json.error === 'object' ? json.error as { message?: string } : null;
    throw new Error(errObj?.message || `Drive API ${res.status}`);
  }
  return json;
}

async function driveListPage(token: string, q: string, orderBy?: string, pageToken?: string) {
  const params = new URLSearchParams({
    q,
    fields: FIELDS,
    pageSize: '100',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  if (orderBy) params.set('orderBy', orderBy);
  if (pageToken) params.set('pageToken', pageToken);
  return driveJson(token, `https://www.googleapis.com/drive/v3/files?${params}`);
}

export async function driveList(token: string, q: string, pages = 2): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let pageToken: string | undefined;
  let useOrder = true;
  for (let i = 0; i < pages; i++) {
    let json: Record<string, unknown>;
    try {
      json = await driveListPage(token, q, useOrder ? 'modifiedTime desc' : undefined, pageToken);
    } catch (err) {
      if (useOrder && i === 0) {
        useOrder = false;
        json = await driveListPage(token, q, undefined, pageToken);
      } else {
        throw err;
      }
    }
    const files = Array.isArray(json.files) ? json.files as DriveApiFile[] : [];
    for (const f of files) {
      const item = mapFile(f);
      if (item) out.push(item);
    }
    pageToken = typeof json.nextPageToken === 'string' ? json.nextPageToken : undefined;
    if (!pageToken) break;
  }
  return out;
}

export async function listDriveFolders(token: string, q?: string): Promise<DriveItem[]> {
  const seen = new Map<string, DriveItem>();
  const needle = q?.trim();
  const queries = needle
    ? [
        `trashed=false and name contains '${escapeDriveQuery(needle)}' and (mimeType='${FOLDER}' or mimeType='${SHORTCUT}')`,
      ]
    : [
        `mimeType='${FOLDER}' and trashed=false and sharedWithMe=true`,
        `mimeType='${FOLDER}' and trashed=false`,
      ];
  for (const query of queries) {
    try {
      const files = await driveList(token, query, needle ? 2 : 1);
      for (const f of files) {
        if (f.isFolder && !seen.has(f.id)) seen.set(f.id, f);
      }
    } catch {
      /* one query failing (sharedWithMe + orderBy) should not kill the picker */
    }
  }
  return [...seen.values()]
    .sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))
    .slice(0, 80);
}

export async function listDriveChildren(token: string, folderId: string): Promise<DriveItem[]> {
  const q = `'${escapeDriveQuery(folderId)}' in parents and trashed=false`;
  const seen = new Map<string, DriveItem>();
  for (const item of await driveList(token, q, 4)) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

const PULL_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'tif', 'tiff', 'txt']);

export function isPullableDriveFile(item: DriveItem): boolean {
  if (item.isFolder) return false;
  const mime = item.mimeType || '';
  if (mime === FOLDER) return false;
  if (mime === 'application/vnd.google-apps.spreadsheet') return false;
  if (mime === 'application/vnd.google-apps.form') return false;
  if (mime === GDOC) return true;
  if (mime === 'application/pdf' || mime.startsWith('image/')) return true;
  if (mime.includes('word') || mime.includes('excel') || mime.includes('officedocument') || mime.includes('spreadsheetml')) return true;
  const ext = item.name.split('.').pop()?.toLowerCase() || '';
  return PULL_EXTS.has(ext);
}

export async function downloadDriveFile(
  token: string,
  file: DriveItem,
): Promise<{ bytes: ArrayBuffer; mime: string; name: string }> {
  const isGoogleDoc = file.mimeType === GDOC;
  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('application/pdf')}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Could not download ${file.name}`);
  }
  const bytes = await res.arrayBuffer();
  const name = isGoogleDoc && !file.name.toLowerCase().endsWith('.pdf') ? `${file.name}.pdf` : file.name;
  const mime = isGoogleDoc ? 'application/pdf' : (res.headers.get('content-type') || file.mimeType || 'application/octet-stream');
  return { bytes, mime, name };
}
