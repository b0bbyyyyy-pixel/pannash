const MAX_DIRECT_BYTES = 20 * 1024 * 1024;
/** Stay under Vercel/Next's ~4.5 MB request body once multipart headers are added. */
export const NEXT_BODY_SAFE_BYTES = Math.floor(3.5 * 1024 * 1024);

export function needsSignedUpload(file: File | { size: number }) {
  return file.size > NEXT_BODY_SAFE_BYTES;
}

export type SignedUpload = {
  path: string;
  token: string;
  signedUrl: string;
};

export async function signLeadUpload(args: {
  fileName: string;
  fileType?: string;
  fileSize?: number;
  leadId?: string;
  columnField?: string;
  temp?: boolean;
}): Promise<SignedUpload> {
  const res = await fetch('/api/attachments/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Could not start upload (${res.status})`);
  if (!json.path || !json.token) throw new Error('Upload sign response was incomplete');
  return json as SignedUpload;
}

export async function putFileToSignedUpload(signed: SignedUpload, file: File) {
  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.storage
    .from('lead-attachments')
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || 'application/octet-stream',
    });
  if (!error) return;

  const put = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) {
    const t = await put.text().catch(() => '');
    throw new Error(error.message || t || `Storage rejected ${file.name} (${put.status})`);
  }
}

export type UploadedAttachment = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  column_field: string;
  created_at: string;
};

function asUploadResult(json: unknown): { attachment: UploadedAttachment; docsIn?: boolean } {
  const row = json && typeof json === 'object' ? json as { attachment?: UploadedAttachment; docsIn?: boolean; error?: string } : {};
  if (!row.attachment?.id) throw new Error(row.error || 'Failed to save attachment');
  return { attachment: row.attachment, docsIn: row.docsIn };
}

export async function uploadFileToLeadStorage(
  file: File,
  args: { leadId: string; columnField: string },
): Promise<{ attachment: UploadedAttachment; docsIn?: boolean }> {
  if (file.size > MAX_DIRECT_BYTES) {
    throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 20 MB.`);
  }

  if (!needsSignedUpload(file)) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('leadId', args.leadId);
    fd.append('columnField', args.columnField);
    const res = await fetch('/api/attachments', { method: 'POST', body: fd, credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to upload file');
    return asUploadResult(json);
  }

  const signed = await signLeadUpload({
    leadId: args.leadId,
    columnField: args.columnField,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });
  await putFileToSignedUpload(signed, file);

  const reg = await fetch('/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      leadId: args.leadId,
      columnField: args.columnField,
      filePath: signed.path,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    }),
  });
  const json = await reg.json().catch(() => ({}));
  if (!reg.ok) throw new Error(json.error || 'Failed to save attachment');
  return asUploadResult(json);
}

/** Upload to a temp path (no lead yet) so parse/analyze can read it without posting bytes through Next. */
export async function uploadTempLeadFile(file: File): Promise<string> {
  if (file.size > MAX_DIRECT_BYTES) {
    throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 20 MB.`);
  }
  const signed = await signLeadUpload({
    temp: true,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });
  await putFileToSignedUpload(signed, file);
  return signed.path;
}

export function explainUploadFailure(err: unknown, file?: File): string {
  const raw = err instanceof Error ? err.message : String(err || 'Upload failed');
  const size = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';
  if (/413|too large|entity too large|body.*limit|payload/i.test(raw)) {
    return `This file${size ? ` (${size})` : ''} is too large to send through the app server (limit ~4.5 MB). It should upload directly to storage — try again. If it still fails, split the PDF.`;
  }
  return size ? `${raw} (${size})` : raw;
}
