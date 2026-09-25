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

function isNoteFile(f: { file_name: string; file_type?: string }) {
  const type = (f.file_type || '').toLowerCase();
  const name = f.file_name.toLowerCase();
  return type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md');
}

function noteTitle(name: string) {
  return name.replace(/\.(txt|md)$/i, '');
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
  const [dragOver, setDragOver] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteTitleVal, setNoteTitleVal] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
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

  function startNewNote() {
    setNoteId(null);
    setNoteTitleVal('');
    setNoteBody('');
    setNoteOpen(true);
    setError('');
  }

  async function openNote(f: VaultFile) {
    setError('');
    try {
      const res = await fetch(`/api/vault/file?id=${f.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not open note');
      const text = await res.text();
      setNoteId(f.id);
      setNoteTitleVal(noteTitle(f.file_name));
      setNoteBody(text);
      setNoteOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open note');
    }
  }

  async function saveNote() {
    const title = noteTitleVal.trim();
    if (!title) {
      setError('Give the note a title.');
      return;
    }
    setSavingNote(true);
    setError('');
    try {
      if (noteId) {
        const res = await fetch('/api/vault', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: noteId, title, body: noteBody }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Could not save note');
      } else {
        const file = new File([noteBody], `${title}.txt`, { type: 'text/plain' });
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/vault', { method: 'POST', body: fd, credentials: 'include' });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Could not save note');
      }
      setNoteOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save note');
    } finally {
      setSavingNote(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this from the vault?')) return;
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

  async function download(f: VaultFile) {
    setDownloading(f.id);
    try {
      const res = await fetch(`/api/vault/file?id=${f.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
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

        <div
          className={`px-5 py-3 border-b shrink-0 transition-colors ${dragOver ? 'border-indigo-300 bg-indigo-50/60' : 'border-[#f0f0f0]'}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
          }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs font-medium uppercase tracking-wide text-[#1a1a1a] border border-[#e5e5e5] px-3 py-1.5 rounded-md hover:border-[#1a1a1a] disabled:opacity-40"
            >
              {uploading ? 'Storing…' : 'Add files'}
            </button>
            {!pick && (
              <button
                type="button"
                onClick={startNewNote}
                className="text-xs font-medium uppercase tracking-wide text-[#1a1a1a] border border-[#e5e5e5] px-3 py-1.5 rounded-md hover:border-[#1a1a1a]"
              >
                New note
              </button>
            )}
            <p className="text-[11px] text-[#9b9b9b]">
              {dragOver ? 'Drop to upload' : 'or drop files here'}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = ''; }}
          />
        </div>

        <div
          className={`flex-1 overflow-y-auto px-5 py-3 min-h-[180px] transition-colors ${dragOver ? 'bg-indigo-50/40' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
          }}
        >
          {noteOpen && (
            <div className="mb-4 border border-[#e5e5e5] rounded-lg p-3 space-y-2.5">
              <input
                type="text"
                value={noteTitleVal}
                onChange={e => setNoteTitleVal(e.target.value)}
                placeholder="Note title"
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none focus:border-[#1a1a1a]"
              />
              <textarea
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                placeholder="Write the note…"
                rows={8}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none focus:border-[#1a1a1a] resize-y min-h-[140px]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  className="text-xs text-[#9b9b9b] hover:text-[#1a1a1a] px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={savingNote}
                  className="text-xs font-medium uppercase tracking-wide text-white bg-[#1a1a1a] px-3 py-1.5 rounded-md hover:bg-[#333] disabled:opacity-40"
                >
                  {savingNote ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-[#9b9b9b] py-8 text-center">Loading…</p>
          ) : visible.length === 0 && !noteOpen ? (
            <p className="text-xs text-[#9b9b9b] py-8 text-center">Vault is empty.</p>
          ) : visible.length > 0 ? (
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
                    onClick={() => isNoteFile(f) ? openNote(f) : view(f.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-xs font-medium text-[#1a1a1a] truncate">
                      {isNoteFile(f) ? noteTitle(f.file_name) : f.file_name}
                      {isNoteFile(f) && (
                        <span className="ml-2 align-middle text-[9px] font-semibold uppercase tracking-wider text-[#6b6b6b] bg-[#f0f0f0] px-1.5 py-0.5 rounded">Note</span>
                      )}
                    </p>
                    <p className="text-[10px] text-[#9b9b9b]">{isNoteFile(f) ? 'Note' : fmtSize(f.file_size)}</p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => download(f)}
                      disabled={downloading === f.id}
                      className="text-[10px] uppercase tracking-wide text-[#9b9b9b] hover:text-[#1a1a1a] disabled:opacity-40"
                    >
                      {downloading === f.id ? '…' : 'Download'}
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
                </div>
              ))}
            </div>
          ) : null}
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
