import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getGoogleAccessToken } from '@/lib/google/token';
import {
  downloadDriveFile,
  isPullableDriveFile,
  listDriveChildren,
  listDriveFolders,
  type DriveItem,
} from '@/lib/google/drive';
import {
  bestFolderForLead,
  bestLeadForFolder,
  stripPackDate,
  type CompanyLead,
} from '@/lib/google/matchCompany';
import { maybeMarkDocsIn } from '@/lib/leads/markDocsIn';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 40;

async function googleUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const accessToken = await getGoogleAccessToken(supabase, user.id);
  if (!accessToken) {
    return { error: NextResponse.json({ error: 'not_connected' }, { status: 401 }) };
  }
  return { supabase, user, accessToken };
}

function columnForFile(name: string) {
  return /stmt|statement|checking|savings|\bbank\b|frost/i.test(name) ? 'bank_statements' : 'documents';
}

async function filesInFolder(token: string, folderId: string): Promise<DriveItem[]> {
  const children = await listDriveChildren(token, folderId);
  return children.filter(isPullableDriveFile).slice(0, MAX_FILES);
}

async function resolvePullFolder(
  token: string,
  folderId: string,
  leadLabel: string,
): Promise<{ folderId: string; folderName: string; files: DriveItem[] }> {
  const children = await listDriveChildren(token, folderId);
  const folders = children.filter(c => c.isFolder);
  const files = children.filter(isPullableDriveFile);
  if (folders.length > 0) {
    const match = bestFolderForLead(leadLabel, folders);
    if (match) {
      const nested = await filesInFolder(token, match.folder.id);
      return { folderId: match.folder.id, folderName: match.folder.name, files: nested };
    }
    if (files.length === 0) {
      throw new Error('No folder in this pack matches this lead’s company name.');
    }
  }
  const self = await driveFileName(token, folderId);
  return { folderId, folderName: self, files: files.slice(0, MAX_FILES) };
}

async function driveFileName(token: string, fileId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json().catch(() => ({})) as { name?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message || 'Could not read that Drive folder');
  return json.name || 'Folder';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadLeads(supabase: any, userId: string, listId?: string | null): Promise<CompanyLead[]> {
  const select = 'id, name, company';
  const rows: CompanyLead[] = [];
  if (listId && listId !== 'unlisted') {
    const { data } = await supabase.from('leads').select(select).eq('user_id', userId).eq('list_id', listId).limit(2000);
    for (const r of data ?? []) rows.push({ id: String(r.id), name: r.name ?? null, company: r.company ?? null });
  }
  if (rows.length === 0) {
    const { data } = await supabase.from('leads').select(select).eq('user_id', userId).limit(2000);
    for (const r of data ?? []) rows.push({ id: String(r.id), name: r.name ?? null, company: r.company ?? null });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const auth = await googleUser();
  if ('error' in auth) return auth.error;
  const { accessToken, supabase, user } = auth;

  const folderId = request.nextUrl.searchParams.get('folderId');
  const q = request.nextUrl.searchParams.get('q') || '';
  const preview = request.nextUrl.searchParams.get('preview');
  const parentId = request.nextUrl.searchParams.get('parentId');
  const listId = request.nextUrl.searchParams.get('listId');
  const leadCompany = request.nextUrl.searchParams.get('company') || '';

  try {
    if (preview && parentId) {
      const children = await listDriveChildren(accessToken, parentId);
      const folders = children.filter(c => c.isFolder);
      const leads = await loadLeads(supabase, user.id, listId);
      if (folders.length === 0) {
        const files = children.filter(isPullableDriveFile);
        const parentName = await driveFileName(accessToken, parentId);
        const match = bestLeadForFolder(parentName, leads);
        return NextResponse.json({
          packs: files.length ? [{
            folderId: parentId,
            folderName: parentName,
            company: stripPackDate(parentName),
            fileCount: files.length,
            files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })),
            match: match
              ? { leadId: match.lead.id, name: match.lead.name, company: match.lead.company, score: match.score }
              : null,
          }] : [],
        });
      }
      const packs: Array<{
        folderId: string;
        folderName: string;
        company: string;
        fileCount: number;
        files: Array<{ id: string; name: string; mimeType: string; size?: number }>;
        match: { leadId: string; name: string | null; company: string | null; score: number } | null;
      }> = [];
      for (let i = 0; i < folders.length; i += 5) {
        const chunk = folders.slice(i, i + 5);
        const part = await Promise.all(chunk.map(async folder => {
          const files = await filesInFolder(accessToken, folder.id);
          const match = bestLeadForFolder(folder.name, leads);
          return {
            folderId: folder.id,
            folderName: folder.name,
            company: stripPackDate(folder.name),
            fileCount: files.length,
            files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })),
            match: match
              ? { leadId: match.lead.id, name: match.lead.name, company: match.lead.company, score: match.score }
              : null,
          };
        }));
        packs.push(...part);
      }
      return NextResponse.json({ packs });
    }

    if (folderId) {
      const children = await listDriveChildren(accessToken, folderId);
      const folders = children.filter(c => c.isFolder);
      const files = children.filter(isPullableDriveFile);
      const suggested = leadCompany ? bestFolderForLead(leadCompany, folders) : null;
      return NextResponse.json({
        folders: folders.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime })),
        files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })),
        suggested: suggested ? { id: suggested.folder.id, name: suggested.folder.name, score: suggested.score } : null,
      });
    }

    const folders = await listDriveFolders(accessToken, q);
    return NextResponse.json({
      folders: folders.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Drive error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await googleUser();
  if ('error' in auth) return auth.error;
  const { accessToken, supabase, user } = auth;

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    folderId?: string;
    leadId?: string;
  };

  if (body.action !== 'pull' || !body.folderId || !body.leadId) {
    return NextResponse.json({ error: 'folderId and leadId are required' }, { status: 400 });
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, company')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const leadLabel = lead.company || lead.name || '';

  try {
    const resolved = await resolvePullFolder(accessToken, body.folderId, leadLabel);
    if (!resolved.files.length) {
      return NextResponse.json({ error: `No docs found in “${resolved.folderName}”` }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from('lead_attachments')
      .select('file_name')
      .eq('lead_id', lead.id);
    const have = new Set((existing ?? []).map(r => String(r.file_name || '').toLowerCase()));

    const attachments: Record<string, unknown>[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const file of resolved.files) {
      if ((file.size || 0) > MAX_FILE_BYTES) {
        skipped.push(`${file.name} (over 20 MB)`);
        continue;
      }
      try {
        const downloaded = await downloadDriveFile(accessToken, file);
        if (downloaded.bytes.byteLength > MAX_FILE_BYTES) {
          skipped.push(`${file.name} (over 20 MB)`);
          continue;
        }
        if (have.has(downloaded.name.toLowerCase())) {
          skipped.push(`${downloaded.name} (already on lead)`);
          continue;
        }
        const columnField = columnForFile(downloaded.name);
        const timestamp = Date.now();
        const sanitized = downloaded.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${user.id}/${lead.id}/${columnField}/${timestamp}_${sanitized}`;
        const { error: uploadError } = await supabase.storage
          .from('lead-attachments')
          .upload(filePath, downloaded.bytes, {
            contentType: downloaded.mime,
            upsert: false,
          });
        if (uploadError) {
          errors.push(`${downloaded.name}: ${uploadError.message}`);
          continue;
        }
        const { data: attachment, error: dbError } = await supabase
          .from('lead_attachments')
          .insert({
            user_id: user.id,
            lead_id: lead.id,
            column_field: columnField,
            file_name: downloaded.name,
            file_path: filePath,
            file_size: downloaded.bytes.byteLength,
            file_type: downloaded.mime,
          })
          .select()
          .single();
        if (dbError || !attachment) {
          await supabase.storage.from('lead-attachments').remove([filePath]);
          errors.push(`${downloaded.name}: ${dbError?.message || 'could not save'}`);
          continue;
        }
        have.add(downloaded.name.toLowerCase());
        attachments.push(attachment as Record<string, unknown>);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'download failed'}`);
      }
    }

    const docsIn = attachments.length
      ? await maybeMarkDocsIn(supabase, { leadId: lead.id, userId: user.id })
      : false;

    if (attachments.length) {
      try {
        const { onCasperDocsReceived } = await import('@/lib/casper/docs');
        const first = attachments[0];
        await onCasperDocsReceived(supabase, {
          userId: user.id,
          leadId: lead.id,
          fileName: String(first.file_name || ''),
          columnField: String(first.column_field || ''),
          filePath: String(first.file_path || ''),
          attachmentId: String(first.id || ''),
        });
      } catch (casperErr) {
        console.error('[google-drive] casper docs hook', casperErr);
      }
    }

    return NextResponse.json({
      folderName: resolved.folderName,
      attachments,
      skipped,
      errors,
      docsIn,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Drive pull failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
