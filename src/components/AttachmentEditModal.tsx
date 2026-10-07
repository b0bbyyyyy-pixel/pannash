'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const MIN = 0.04;
const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

function clampRect(r: Rect): Rect {
  const x = Math.min(1 - MIN, Math.max(0, r.x));
  const y = Math.min(1 - MIN, Math.max(0, r.y));
  const w = Math.min(1 - x, Math.max(MIN, r.w));
  const h = Math.min(1 - y, Math.max(MIN, r.h));
  return { x, y, w, h };
}

function rotateCanvas(src: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  const dst = document.createElement('canvas');
  dst.width = src.height;
  dst.height = src.width;
  const ctx = dst.getContext('2d');
  if (!ctx) return src;
  if (dir === 1) {
    ctx.translate(dst.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, dst.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return dst;
}

function canvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')?.drawImage(img, 0, 0);
  return c;
}

async function loadPdfJs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__pdfjsLib) return w.__pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = w.pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      w.__pdfjsLib = lib;
      resolve(lib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function pdfPageToCanvas(buf: ArrayBuffer, pageNum: number): Promise<{ canvas: HTMLCanvasElement; pages: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib: any = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { canvas, pages: pdf.numPages };
}

function withJpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'document';
  return `${base}.jpg`;
}

export default function AttachmentEditModal({
  attachment,
  onSaved,
  onClose,
}: {
  attachment: { id: string; file_name: string; file_type: string };
  onSaved: (next: { id: string; file_name: string; file_size: number; file_type: string; file_path: string }) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [crop, setCrop] = useState<Rect>(FULL);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const srcRef = useRef<HTMLCanvasElement | null>(null);
  const pdfBufRef = useRef<ArrayBuffer | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ handle: Handle; start: Rect; px: number; py: number } | null>(null);

  const setFromCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const max = 2400;
    const scale = Math.min(1, max / Math.max(canvas.width, canvas.height, 1));
    let src = canvas;
    if (scale < 1) {
      const fitted = document.createElement('canvas');
      fitted.width = Math.max(1, Math.round(canvas.width * scale));
      fitted.height = Math.max(1, Math.round(canvas.height * scale));
      fitted.getContext('2d')?.drawImage(canvas, 0, 0, fitted.width, fitted.height);
      src = fitted;
    }
    srcRef.current = src;
    src.toBlob(blob => {
      if (!blob) return;
      setPreviewUrl(prev => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }, 'image/jpeg', 0.92);
    setCrop(FULL);
  }, []);

  const loadPage = useCallback(async (pageNum: number) => {
    const buf = pdfBufRef.current;
    if (!buf) return;
    setLoading(true);
    setError('');
    try {
      const { canvas, pages: n } = await pdfPageToCanvas(buf, pageNum);
      setPages(n);
      setPage(pageNum);
      setFromCanvas(canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read PDF');
    } finally {
      setLoading(false);
    }
  }, [setFromCanvas]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/attachments/download?id=${attachment.id}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Could not load file');
        const { url } = await res.json();
        const blob = await fetch(url).then(r => r.blob());
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const isPdf = (attachment.file_type || '').includes('pdf') || /\.pdf$/i.test(attachment.file_name);
        if (isPdf) {
          pdfBufRef.current = buf;
          const { canvas, pages: n } = await pdfPageToCanvas(buf, 1);
          if (cancelled) return;
          setPages(n);
          setPage(1);
          setFromCanvas(canvas);
        } else {
          await new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              if (!cancelled) setFromCanvas(canvasFromImage(img));
              resolve();
            };
            img.onerror = () => reject(new Error('Could not read image'));
            img.src = URL.createObjectURL(new Blob([buf]));
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.file_name, attachment.file_type, setFromCanvas]);

  function rotate(dir: 1 | -1) {
    const src = srcRef.current;
    if (!src) return;
    setFromCanvas(rotateCanvas(src, dir));
  }

  function clientToNorm(cx: number, cy: number) {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (cx - r.left) / Math.max(1, r.width))),
      y: Math.min(1, Math.max(0, (cy - r.top) / Math.max(1, r.height))),
    };
  }

  function onPointerDown(e: React.PointerEvent, handle: Handle) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = clientToNorm(e.clientX, e.clientY);
    dragRef.current = { handle, start: crop, px: p.x, py: p.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = clientToNorm(e.clientX, e.clientY);
    const dx = p.x - drag.px;
    const dy = p.y - drag.py;
    const s = drag.start;
    let next = { ...s };
    if (drag.handle === 'move') {
      next.x = s.x + dx;
      next.y = s.y + dy;
    } else {
      if (drag.handle.includes('w')) {
        next.x = s.x + dx;
        next.w = s.w - dx;
      }
      if (drag.handle.includes('e')) next.w = s.w + dx;
      if (drag.handle.includes('n')) {
        next.y = s.y + dy;
        next.h = s.h - dy;
      }
      if (drag.handle.includes('s')) next.h = s.h + dy;
    }
    setCrop(clampRect(next));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function save() {
    const src = srcRef.current;
    if (!src || saving) return;
    setSaving(true);
    setError('');
    try {
      const sx = Math.round(crop.x * src.width);
      const sy = Math.round(crop.y * src.height);
      const sw = Math.max(1, Math.round(crop.w * src.width));
      const sh = Math.max(1, Math.round(crop.h * src.height));
      const out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d')?.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob: Blob = await new Promise((resolve, reject) => {
        out.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.92);
      });
      const file = new File([blob], withJpegName(attachment.file_name), { type: 'image/jpeg' });
      const fd = new FormData();
      fd.append('id', attachment.id);
      fd.append('file', file);
      const res = await fetch('/api/attachments', { method: 'PATCH', body: fd, credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved(json.attachment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div className="fixed inset-0 z-[230] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[#f0f0f0] flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">Edit document</p>
            <p className="text-[11px] text-[#9b9b9b] mt-0.5 truncate max-w-[420px]">{attachment.file_name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#9b9b9b] hover:text-[#1a1a1a]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-[360px] bg-[#111] flex items-center justify-center p-4 overflow-hidden">
          {loading ? (
            <p className="text-sm text-white/70">Loading…</p>
          ) : previewUrl ? (
            <div className="relative max-w-full max-h-[62vh] select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt=""
                className="max-w-full max-h-[62vh] object-contain pointer-events-none"
                draggable={false}
              />
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute border-2 border-white cursor-move box-border"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                  }}
                  onPointerDown={e => onPointerDown(e, 'move')}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {handles.map(h => (
                    <span
                      key={h}
                      onPointerDown={e => onPointerDown(e, h)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      className={`absolute w-3 h-3 bg-white rounded-sm ${
                        h === 'n' || h === 's' ? 'cursor-ns-resize left-1/2 -translate-x-1/2' :
                        h === 'e' || h === 'w' ? 'cursor-ew-resize top-1/2 -translate-y-1/2' :
                        (h === 'nw' || h === 'se') ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                      } ${
                        h.includes('n') ? '-top-1.5' : h.includes('s') ? '-bottom-1.5' : ''
                      } ${
                        h.includes('w') ? '-left-1.5' : h.includes('e') ? '-right-1.5' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/70">{error || 'Nothing to edit'}</p>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#f0f0f0] flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => rotate(-1)}
            disabled={loading || !previewUrl}
            className="px-3 py-1.5 text-xs font-medium border border-[#e5e5e5] rounded-md hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            Rotate left
          </button>
          <button
            type="button"
            onClick={() => rotate(1)}
            disabled={loading || !previewUrl}
            className="px-3 py-1.5 text-xs font-medium border border-[#e5e5e5] rounded-md hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            Rotate right
          </button>
          <button
            type="button"
            onClick={() => setCrop(FULL)}
            disabled={loading || !previewUrl}
            className="px-3 py-1.5 text-xs font-medium border border-[#e5e5e5] rounded-md hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            Reset crop
          </button>
          {pages > 1 && (
            <span className="flex items-center gap-1 text-xs text-[#6b6b6b] ml-1">
              Page
              <button type="button" disabled={page <= 1} onClick={() => loadPage(page - 1)} className="px-1.5 disabled:opacity-30">‹</button>
              {page}/{pages}
              <button type="button" disabled={page >= pages} onClick={() => loadPage(page + 1)} className="px-1.5 disabled:opacity-30">›</button>
            </span>
          )}
          <span className="flex-1" />
          {error ? <p className="text-xs text-red-600">{error}</p> : (
            <p className="text-[11px] text-[#9b9b9b]">Saves over this file as a JPEG</p>
          )}
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-[#6b6b6b]">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || !previewUrl}
            className="px-3 py-1.5 text-xs font-semibold bg-[#1a1a1a] text-white rounded-md disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
