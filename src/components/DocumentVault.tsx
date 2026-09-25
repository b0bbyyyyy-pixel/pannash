'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VaultFile = {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  created_at: string;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function vaultToFile(doc: VaultFile): Promise<File> {
  const res = await fetch(`/api/vault/file?id=${doc.id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Could not pull file from vault');
  const blob = await res.blob();
  return new File([blob], doc.file_name, { type: doc.file_type || blob.type });
}

function matchesAccept(name: string, accept?: string) {
  if (!accept) return true;
  const exts = accept.split(',').map(s => s.trim().replace('.', '').toLowerCase()).filter(Boolean);
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return exts.includes(ext);
}

export default function DocumentVault({
  onClose,
  pick,
  onPick,
  accept,
  inline,
}: {
  onClose?: () => void;
  pick?: boolean;
  onPick?: (files: File[]) => void;
  accept?: string;
  inline?: boolean;
}) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vault', { credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not load vault');
      setFiles(d.files || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = files.filter(f => matchesAccept(f.file_name, accept));

  async function upload(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of arr) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/vault', { method: 'POST', body: fd, credentials: 'include' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed to store ${file.name}`);
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this file from the vault?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/vault?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) setFiles(prev => prev.filter(f => f.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function view(id: string) {
    const res = await fetch(`/api/vault/file?id=${id}&url=1`, { credentials: 'include' });
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function useSelected() {
    const chosen = visible.filter(f => selected.has(f.id));
    if (!chosen.length || !onPick) return;
    setPulling(true);
    setError('');
    try {
      const out: File[] = [];
      for (const doc of chosen) out.push(await vaultToFile(doc));
      onPick(out);
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pull files');
    } finally {
      setPulling(false);
    }
  }

  function toggle(id: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const panel = (
    <>
        {!inline && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0] shrink-0">
          <p className="text-sm font-bold text-[#1a1a1a]">{pick ? 'Pull from vault' : 'Document vault'}</p>
          {onClose && (
            <button type="button" onClick={onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] text-lg leading-none">×</button>
          )}
        </div>
        )}

        <div className="px-5 py-3 border-b border-[#f0f0f0] shrink-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-xs font-medium uppercase tracking-wide text-[#1a1a1a] border border-[#e5e5e5] px-3 py-1.5 rounded-md hover:border-[#1a1a1a] disabled:opacity-40"
          >
            {uploading ? 'Storing…' : 'Add files'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = ''; }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[180px]">
          {loading ? (
            <p className="text-xs text-[#9b9b9b] py-8 text-center">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-[#9b9b9b] py-8 text-center">Vault is empty.</p>
          ) : (
            <div className="space-y-1.5">
              {visible.map(f => (
                <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-[#f5f5f5] last:border-0">
                  {pick && (
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="accent-[#1a1a1a]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => view(f.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-xs font-medium text-[#1a1a1a] truncate">{f.file_name}</p>
                    <p className="text-[10px] text-[#9b9b9b]">{fmtSize(f.file_size)}</p>
                  </button>
                  {!pick && (
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      disabled={deleting === f.id}
                      className="text-[10px] uppercase tracking-wide text-[#9b9b9b] hover:text-[#1a1a1a]"
                    >
                      {deleting === f.id ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
        </div>

        {pick && (
          <div className="p-4 border-t border-[#e5e5e5] shrink-0">
            <button
              type="button"
              onClick={useSelected}
              disabled={pulling || selected.size === 0}
              className="w-full py-2 text-xs font-medium uppercase tracking-wide border border-[#e5e5e5] hover:border-[#1a1a1a] disabled:opacity-40"
            >
              {pulling ? 'Pulling…' : `Use selected (${selected.size})`}
            </button>
          </div>
        )}
    </>
  );

  if (inline) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col min-h-[420px]">
        {panel}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[84vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  );
}
