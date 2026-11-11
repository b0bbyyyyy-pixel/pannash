import { NextRequest, NextResponse } from 'next/server';
import {
  allowedUpload,
  classifyUploadName,
  MERCHANT_UPLOAD_MAX_BYTES,
  safeFileName,
} from '@/lib/merchantPortal/mask';
import { requireMerchantSession } from '@/lib/merchantPortal/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireMerchantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fileName = String(body.fileName || '').trim();
  const fileType = String(body.fileType || '');
  const fileSize = Number(body.fileSize || 0);
  const needId = String(body.needId || '').trim();
  if (!fileName || !allowedUpload(fileName, fileType)) {
    return NextResponse.json({ error: 'PDF, JPG, PNG, or HEIC only' }, { status: 400 });
  }
  if (fileSize > MERCHANT_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large. Max is 25 MB.' }, { status: 413 });
  }

  const columnField = classifyUploadName(fileName);
  const path = `${session.portal.user_id}/${session.portal.lead_id}/${columnField}/${Date.now()}_${safeFileName(fileName)}`;
  const { data, error } = await session.supabase.storage
    .from('lead-attachments')
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl || !data?.token) {
    return NextResponse.json({ error: 'Could not start upload' }, { status: 500 });
  }
  return NextResponse.json({
    path: data.path || path,
    token: data.token,
    signedUrl: data.signedUrl,
    columnField,
    needId: needId || null,
  });
}
