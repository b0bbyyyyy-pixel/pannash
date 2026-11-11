import { NextRequest, NextResponse } from 'next/server';
import { preserveFileActivity } from '@/lib/leads/fileActivity';
import { logMerchantEvent, requestIp } from '@/lib/merchantPortal/events';
import {
  allowedUpload,
  classifyUploadName,
  DEFAULT_PORTAL_NEEDS,
  parsePortalNeeds,
  safeFileName,
} from '@/lib/merchantPortal/mask';
import { requireMerchantSession } from '@/lib/merchantPortal/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireMerchantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const filePath = String(body.path || body.filePath || '').trim();
  const fileName = String(body.fileName || '').trim() || 'file';
  const fileType = String(body.fileType || 'application/octet-stream');
  const fileSize = Number(body.fileSize || 0);
  const needId = String(body.needId || '').trim();
  const prefix = `${session.portal.user_id}/${session.portal.lead_id}/`;
  if (!filePath.startsWith(prefix) || filePath.includes('..')) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }
  if (!allowedUpload(fileName, fileType) && !allowedUpload(filePath, fileType)) {
    return NextResponse.json({ error: 'PDF, JPG, PNG, or HEIC only' }, { status: 400 });
  }

  const { data: listed } = await session.supabase.storage.from('lead-attachments').list(
    filePath.split('/').slice(0, -1).join('/'),
    { search: filePath.split('/').pop() || safeFileName(fileName) },
  );
  const exists = (listed || []).some(f => filePath.endsWith(f.name));
  if (!exists) {
    const { data: blob } = await session.supabase.storage.from('lead-attachments').download(filePath);
    if (!blob) return NextResponse.json({ error: 'Upload not found' }, { status: 400 });
  }

  const columnField = classifyUploadName(fileName);
  const { data: attachment, error } = await session.supabase.from('lead_attachments').insert({
    user_id: session.portal.user_id,
    lead_id: session.portal.lead_id,
    column_field: columnField,
    file_name: fileName,
    file_path: filePath,
    file_size: fileSize,
    file_type: fileType,
  }).select('id, file_name, created_at').single();
  if (error || !attachment) {
    return NextResponse.json({ error: 'Could not save file' }, { status: 500 });
  }

  const udRaw = session.lead.underwriting_data && typeof session.lead.underwriting_data === 'object'
    ? session.lead.underwriting_data as Record<string, unknown>
    : {};
  const needs = parsePortalNeeds(udRaw.portalNeeds);
  const list = needs.length ? needs : DEFAULT_PORTAL_NEEDS.map(n => ({ ...n }));
  const now = new Date().toISOString();
  const nextNeeds = list.map(item => {
    if (needId && item.id === needId) return { ...item, done: true, doneAt: now };
    return item;
  });
  const ud = preserveFileActivity({ ...udRaw, portalNeeds: nextNeeds }, udRaw);
  await session.supabase
    .from('leads')
    .update({ underwriting_data: ud })
    .eq('id', session.portal.lead_id)
    .eq('user_id', session.portal.user_id);

  try {
    const { notifyLeadUpload } = await import('@/lib/inbox/uploadUnread');
    await notifyLeadUpload(session.supabase, {
      userId: session.portal.user_id,
      leadId: session.portal.lead_id,
      kinds: [columnField === 'bank_statements' ? 'documents' : 'documents'],
    });
  } catch (err) {
    console.warn('[merchant-portal] notify upload', err instanceof Error ? err.message : 'error');
  }
  try {
    const { maybeMarkDocsIn } = await import('@/lib/leads/markDocsIn');
    await maybeMarkDocsIn(session.supabase, {
      leadId: session.portal.lead_id,
      userId: session.portal.user_id,
      fromOutside: true,
    });
  } catch (err) {
    console.warn('[merchant-portal] docs in', err instanceof Error ? err.message : 'error');
  }
  try {
    const { onCasperDocsReceived } = await import('@/lib/casper/docs');
    await onCasperDocsReceived(session.supabase, {
      userId: session.portal.user_id,
      leadId: session.portal.lead_id,
      fileName,
      columnField,
      filePath,
      attachmentId: attachment.id,
    });
  } catch (err) {
    console.warn('[merchant-portal] casper docs', err instanceof Error ? err.message : 'error');
  }

  await logMerchantEvent(session.supabase, {
    userId: session.portal.user_id,
    leadId: session.portal.lead_id,
    portalId: session.portal.id,
    eventType: 'upload',
    eventData: { fileName, columnField, needId: needId || null },
    ip: requestIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({
    ok: true,
    file: { name: attachment.file_name, at: attachment.created_at },
    needs: nextNeeds,
  });
}
