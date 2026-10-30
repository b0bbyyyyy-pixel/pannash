'use client';

import { useCallback, useEffect, useState } from 'react';

type DriveFolder = { id: string; name: string; modifiedTime?: string };
type DriveFile = { id: string; name: string; mimeType: string; size?: number };
type PulledAttachment = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  column_field: string;
  created_at: string;
};

function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GoogleDrivePick({
  leadId,
  leadName,
  leadCompany,
  onClose,
  onPulled,
  zClass = 'z-[220]',
}: {
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  onClose: () => void;
  onPulled: (attachments: PulledAttachment[], docsIn?: boolean) => void;
  zClass?: string;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [email, setEmail] = useState('');
  const [q, setQ] = useState(leadCompany || '');
  const [path, setPath] = useState<DriveFolder[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [suggested, setSuggested] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState('');

  const company = leadCompany || leadName;

  const loadRoot = useCallback(async (search: string) => {
    setLoading(true);
    setError('');
    setPath([]);
    setFiles([]);
    setSuggested(null);
    try {
      const res = await fetch(`/api/import/google-drive?q=${encodeURIComponent(search)}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && json.error === 'not_connected') {
        setConnected(false);
        setNeedsReconnect(true);
        setFolders([]);
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Could not list Drive folders');
      setConnected(true);
      setFolders(json.folders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not list Drive folders');
    } finally {
      setLoading(false);
    }
  }, []);

  const openFolder = useCallback(async (folder: DriveFolder, nextPath: DriveFolder[]) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ folderId: folder.id });
      if (company) params.set('company', company);
      const res = await fetch(`/api/import/google-drive?${params}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not open folder');
      setPath(nextPath);
      setFolders(json.folders || []);
      setFiles(json.files || []);
      setSuggested(json.suggested || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder');
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/google/status', { credentials: 'include' });
        const json = await res.json().catch(() => ({ connected: false }));
        if (cancelled) return;
        setConnected(!!json.connected && !json.needsReconnect);
        setNeedsReconnect(!!json.needsReconnect);
        setEmail(json.email || '');
        if (json.connected && !json.needsReconnect) {
          await loadRoot(leadCompany || '');
        } else {
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setConnected(false);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [leadCompany, loadRoot]);

  async function pull(folderId: string) {
    setPulling(true);
    setError('');
    try {
      const res = await fetch('/api/import/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'pull', folderId, leadId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not pull Drive docs');
      const atts = (json.attachments || []) as PulledAttachment[];
      if (!atts.length && (json.errors?.length || json.skipped?.length)) {
        throw new Error((json.errors?.[0] || json.skipped?.[0] || 'Nothing new to pull'));
      }
      onPulled(atts, !!json.docsIn);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pull Drive docs');
    } finally {
      setPulling(false);
    }
  }

  const currentId = path[path.length - 1]?.id;
  const canPullHere = !!currentId && (files.length > 0 || !!suggested);
  const connectHref = `/api/auth/google/connect?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/leads')}`;

  return (
    <div className={`fixed inset-0 bg-black/40 flex items-center justify-center ${zClass} p-4`} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[84vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0] shrink-0">
          <div>
            <p className="text-sm font-bold text-[#1a1a1a]">Pull from Google Drive</p>
            <p className="text-[11px] text-[#9b9b9b] mt-0.5">Match a company folder to {company}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] text-lg leading-none">×</button>
        </div>

        {connected === false ? (
          <div className="px-5 py-8 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-[#4a4a4a]">
              {needsReconnect ? 'Google session expired. Reconnect to read Drive folders.' : 'Sign in with Google to pull pack folders from Drive.'}
            </p>
            <a
              href={connectHref}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign in with Google
            </a>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-[#f0f0f0] space-y-2 shrink-0">
              {email ? <p className="text-[11px] text-[#9b9b9b]">Connected as {email}</p> : null}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  loadRoot(q);
                }}
                className="flex gap-2"
              >
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search folders (e.g. bob packs)"
                  className="flex-1 px-3 py-2 border border-[#e5e5e5] rounded-md text-sm focus:outline-none focus:border-[#1a1a1a]"
                />
                <button type="submit" className="px-3 py-2 text-xs font-medium uppercase tracking-wide border border-[#e5e5e5] rounded-md hover:border-[#1a1a1a]">
                  Search
                </button>
              </form>
              {path.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#6b6b6b]">
                  <button type="button" className="hover:text-[#1a1a1a]" onClick={() => loadRoot(q)}>Drive</button>
                  {path.map((p, i) => (
                    <span key={p.id} className="flex items-center gap-1">
                      <span>/</span>
                      <button
                        type="button"
                        className="hover:text-[#1a1a1a]"
                        onClick={() => openFolder(p, path.slice(0, i + 1))}
                      >
                        {p.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[200px]">
              {loading ? (
                <p className="text-xs text-[#9b9b9b] animate-pulse py-6 text-center">Loading Drive…</p>
              ) : (
                <div className="space-y-1">
                  {suggested && (
                    <button
                      type="button"
                      onClick={() => pull(suggested.id)}
                      disabled={pulling}
                      className="w-full text-left px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 mb-2"
                    >
                      <p className="text-xs font-semibold text-emerald-800">Matched folder for this lead</p>
                      <p className="text-sm text-emerald-900 mt-0.5">{suggested.name}</p>
                      <p className="text-[11px] text-emerald-700 mt-1">{pulling ? 'Pulling…' : 'Click to pull these docs'}</p>
                    </button>
                  )}
                  {folders.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => openFolder(f, [...path, f])}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#f5f5f5] text-left"
                    >
                      <span className="text-[#6b6b6b]">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                      </span>
                      <span className="text-sm text-[#1a1a1a] truncate">{f.name}</span>
                    </button>
                  ))}
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm text-[#4a4a4a]">
                      <span className="w-5 h-5 rounded bg-red-100 text-red-600 text-[10px] font-bold flex items-center justify-center shrink-0">PDF</span>
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="text-[11px] text-[#9b9b9b]">{fmtSize(f.size)}</span>
                    </div>
                  ))}
                  {!folders.length && !files.length && (
                    <p className="text-xs text-[#9b9b9b] py-6 text-center">No folders found. Search for the parent pack folder (Shared with me works).</p>
                  )}
                </div>
              )}
              {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
            </div>

            <div className="p-4 border-t border-[#e5e5e5] shrink-0">
              <button
                type="button"
                onClick={() => currentId && pull(currentId)}
                disabled={pulling || !canPullHere}
                className="w-full py-2 text-xs font-medium uppercase tracking-wide border border-[#e5e5e5] hover:border-[#1a1a1a] disabled:opacity-40"
              >
                {pulling ? 'Pulling…' : files.length ? `Pull ${files.length} file${files.length === 1 ? '' : 's'} onto this lead` : 'Open a company folder to pull'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
