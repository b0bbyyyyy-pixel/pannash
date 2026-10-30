'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type DriveFolder = { id: string; name: string; modifiedTime?: string };
type PackRow = {
  folderId: string;
  folderName: string;
  company: string;
  fileCount: number;
  match: { leadId: string; name: string | null; company: string | null } | null;
};

function driveConnectHref(listId?: string) {
  const redirect = listId
    ? `/leads?list=${encodeURIComponent(listId)}&upload=drive`
    : '/leads?upload=drive';
  return `/api/auth/google/connect?redirect=${encodeURIComponent(redirect)}`;
}

export default function DrivePackImport({
  selectedListId,
  onSuccess,
}: {
  selectedListId?: string;
  onSuccess?: () => void;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [statusLoading, setStatusLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [email, setEmail] = useState('');
  const [q, setQ] = useState('');
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [parent, setParent] = useState<DriveFolder | null>(null);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createMissing, setCreateMissing] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadFolders = useCallback(async (search: string) => {
    setFoldersLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/import/google-drive?q=${encodeURIComponent(search)}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setConnected(false);
        setNeedsReconnect(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Could not list Drive folders');
      setFolders(json.folders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not list Drive folders');
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const res = await fetch('/api/auth/google/status', { credentials: 'include' });
        const json = await res.json().catch(() => ({ connected: false }));
        if (cancelled) return;
        setConnected(!!json.connected && !json.needsReconnect);
        setNeedsReconnect(!!json.needsReconnect);
        setEmail(json.email || '');
        if (json.connected && !json.needsReconnect) await loadFolders('');
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadFolders]);

  async function pickParent(folder: DriveFolder) {
    setParent(folder);
    setPreviewLoading(true);
    setError('');
    setMessage('');
    setPacks([]);
    try {
      const params = new URLSearchParams({ preview: '1', parentId: folder.id });
      if (selectedListId && selectedListId !== 'unlisted') params.set('listId', selectedListId);
      const res = await fetch(`/api/import/google-drive?${params}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not read pack folders');
      setPacks(json.packs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read pack folders');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runImport() {
    if (!packs.length) return;
    setImporting(true);
    setError('');
    setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setImporting(false);
      return;
    }

    let pulled = 0;
    let created = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (let i = 0; i < packs.length; i++) {
      const pack = packs[i];
      setProgress(`Pulling ${i + 1} of ${packs.length}: ${pack.folderName}`);
      if (pack.fileCount === 0) {
        skipped += 1;
        continue;
      }
      let leadId = pack.match?.leadId;
      if (!leadId) {
        if (!createMissing) {
          skipped += 1;
          continue;
        }
        const company = pack.company || pack.folderName;
        const { data, error: insertErr } = await supabase.from('leads').insert({
          user_id: user.id,
          name: company,
          email: '',
          phone: null,
          phone_e164: null,
          company,
          notes: null,
          list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
          month_key: null,
          in_pipeline: false,
          lead_status: 'New Lead',
        }).select('id').single();
        if (insertErr || !data?.id) {
          failures.push(`${pack.folderName}: ${insertErr?.message || 'could not create lead'}`);
          continue;
        }
        leadId = String(data.id);
        created += 1;
      }
      try {
        const res = await fetch('/api/import/google-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'pull', folderId: pack.folderId, leadId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          failures.push(`${pack.folderName}: ${json.error || 'pull failed'}`);
          continue;
        }
        pulled += 1;
      } catch (e) {
        failures.push(`${pack.folderName}: ${e instanceof Error ? e.message : 'pull failed'}`);
      }
    }

    setProgress('');
    setImporting(false);
    const bits = [`Pulled docs for ${pulled} lead${pulled === 1 ? '' : 's'}`];
    if (created) bits.push(`created ${created}`);
    if (skipped) bits.push(`skipped ${skipped}`);
    setMessage(`✓ ${bits.join(' · ')}`);
    if (failures.length) setError(failures.slice(0, 4).join(' · '));
    if (pulled > 0) setTimeout(() => onSuccess?.(), 800);
  }

  const matched = packs.filter(p => p.match).length;
  const unmatched = packs.length - matched;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <p className="text-sm font-semibold text-gray-900">Pull deal packs from Google Drive</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Pick the parent folder (like “bob packs”). Each company subfolder’s files attach to the matching lead.
        </p>
      </div>

      {statusLoading ? (
        <p className="text-xs text-gray-400 text-center py-2 animate-pulse">Checking Google connection…</p>
      ) : connected ? (
        <div className="flex items-center justify-between rounded-lg px-3 py-2 border bg-green-50 border-green-200">
          <span className="text-xs text-green-800 font-medium">Connected as <strong>{email}</strong></span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700">
            {needsReconnect ? 'Google session expired — reconnect to read Drive' : 'Sign in with Google to read pack folders from Drive'}
          </p>
          <a
            href={driveConnectHref(selectedListId)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign in with Google
          </a>
        </div>
      )}

      {connected && !parent && (
        <>
          <form
            onSubmit={e => {
              e.preventDefault();
              loadFolders(q);
            }}
            className="flex gap-2"
          >
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search folders — Shared with me works"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button type="submit" className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-400">
              Search
            </button>
          </form>
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
            {foldersLoading ? (
              <p className="text-xs text-gray-400 p-4 text-center animate-pulse">Loading folders…</p>
            ) : folders.length === 0 ? (
              <p className="text-xs text-gray-400 p-4 text-center">No folders found.</p>
            ) : folders.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => pickParent(f)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
              >
                <svg className="w-5 h-5 text-gray-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                <span className="text-sm text-gray-900 truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {connected && parent && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700">
              Pack folder: <strong>{parent.name}</strong>
            </p>
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-800 underline"
              onClick={() => { setParent(null); setPacks([]); }}
            >
              Choose another
            </button>
          </div>

          {previewLoading ? (
            <p className="text-xs text-gray-400 py-4 text-center animate-pulse">Matching company folders to leads…</p>
          ) : packs.length > 0 ? (
            <>
              <p className="text-xs text-gray-500">
                {matched} matched · {unmatched} unmatched · {packs.reduce((n, p) => n + p.fileCount, 0)} files
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={createMissing}
                  onChange={e => setCreateMissing(e.target.checked)}
                />
                Create leads for unmatched folders
              </label>
              <div className="max-h-56 overflow-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Folder</th>
                      <th className="text-left px-3 py-1.5 font-medium">Lead</th>
                      <th className="text-right px-3 py-1.5 font-medium">Files</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {packs.map(p => (
                      <tr key={p.folderId}>
                        <td className="px-3 py-1.5 text-gray-900 truncate max-w-[160px]">{p.folderName}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[160px]">
                          {p.match ? (p.match.company || p.match.name) : <span className="text-amber-700">No match</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{p.fileCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">That folder has no company subfolders.</p>
          )}

          {progress ? <p className="text-xs text-gray-500">{progress}</p> : null}

          <button
            type="button"
            onClick={runImport}
            disabled={importing || packs.length === 0}
            className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? 'Pulling…' : `Pull docs for ${packs.filter(p => p.match || createMissing).length} pack${packs.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
