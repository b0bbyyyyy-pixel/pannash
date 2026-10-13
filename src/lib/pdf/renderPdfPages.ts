'use client';

import { extractBankMetricsFromText, hasBankMetrics } from '@/lib/pdf/extractBankMetrics';

async function loadPdfJs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__pdfjsLib) return w.__pdfjsLib;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = pdfjs as any;
  lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  w.__pdfjsLib = lib;
  return lib;
}

async function loadTesseract(): Promise<{ recognize: (img: HTMLCanvasElement, lang: string) => Promise<{ data: { text: string } }> }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.Tesseract) return w.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load page OCR'));
    document.head.appendChild(script);
  });
  return w.Tesseract;
}

function pagesToRender(numPages: number, maxPages: number): number[] {
  if (numPages <= maxPages) return Array.from({ length: numPages }, (_, i) => i + 1);
  const first = Math.min(1, maxPages);
  const last = Math.max(0, maxPages - first);
  const set = new Set<number>();
  for (let i = 1; i <= first; i++) set.add(i);
  for (let i = numPages - last + 1; i <= numPages; i++) set.add(i);
  return [...set].sort((a, b) => a - b);
}

function textFromContent(content: { items: unknown[] }): string {
  let full = '';
  let prevY: number | null = null;
  let prevEndX: number | null = null;
  for (const item of content.items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue;
    const rec = item as unknown as { str?: string; transform?: number[]; width?: number };
    const str = String(rec.str ?? '');
    const x = Number(rec.transform?.[4] ?? 0);
    const y = Number(rec.transform?.[5] ?? 0);
    const width = Number(rec.width) || 0;
    if (prevY !== null && Math.abs(y - prevY) > 2) {
      full += '\n';
      prevEndX = null;
    } else if (prevEndX != null && x - prevEndX > 1.5) {
      full += ' ';
    }
    full += str;
    prevY = y;
    prevEndX = x + width;
  }
  return full;
}

async function renderPageCanvas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
): Promise<HTMLCanvasElement | null> {
  const base = page.getViewport({ scale: 1.4 });
  const scale = base.width > 1400 ? 1400 / base.width : 1;
  const viewport = page.getViewport({ scale: 1.4 * scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      resolve(blob && blob.size > 2000 ? new File([blob], name, { type: 'image/jpeg' }) : null);
    }, 'image/jpeg', 0.72);
  });
}

export type BankPdfRead = {
  text: string;
  fields: Record<string, string>;
  pages: File[];
};

/** One PDF load: text layer, then last-page render + OCR if the summary is only in the image. */
export async function readBankStatementPdf(
  data: ArrayBuffer,
  opts?: { fileName?: string },
): Promise<BankPdfRead> {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({
    data: new Uint8Array(data.slice(0)),
    useWorkerFetch: false,
    disableFontFace: true,
  }).promise;

  const parts: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    parts.push(textFromContent(content));
  }
  const text = parts.join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const fromText = extractBankMetricsFromText(text);
  if (hasBankMetrics(fromText)) {
    return { text, fields: fromText, pages: [] };
  }

  const stem = (opts?.fileName || 'statement').replace(/\.[^.]+$/, '') || 'statement';
  const indices = pagesToRender(pdf.numPages, 2);
  const pages: File[] = [];
  const canvases: HTMLCanvasElement[] = [];
  for (const i of indices) {
    const page = await pdf.getPage(i);
    const canvas = await renderPageCanvas(page);
    if (!canvas) continue;
    canvases.push(canvas);
    const file = await canvasToFile(canvas, `${stem}-p${i}.jpg`);
    if (file) pages.push(file);
  }

  let ocrText = '';
  try {
    const tesseract = await loadTesseract();
    for (const canvas of [...canvases].reverse()) {
      const result = await tesseract.recognize(canvas, 'eng');
      if (result?.data?.text) ocrText += `\n${result.data.text}`;
      if (hasBankMetrics(extractBankMetricsFromText(ocrText))) break;
    }
  } catch (err) {
    console.warn('Statement page OCR failed', err);
  }

  const combined = [text, ocrText].filter(Boolean).join('\n\n');
  const fields = extractBankMetricsFromText(combined);
  return { text: combined, fields, pages };
}

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const read = await readBankStatementPdf(data);
  return read.text;
}

export async function renderPdfPagesToFiles(
  data: ArrayBuffer,
  opts?: { maxPages?: number; fileName?: string },
): Promise<File[]> {
  const read = await readBankStatementPdf(data, { fileName: opts?.fileName });
  return read.pages;
}

export async function downloadAttachmentBytes(attachmentId: string): Promise<ArrayBuffer | null> {
  const raw = await fetch(`/api/attachments/download?id=${attachmentId}&raw=1`, { credentials: 'include' });
  if (raw.ok) return raw.arrayBuffer();
  const res = await fetch(`/api/attachments/download?id=${attachmentId}`, { credentials: 'include' });
  if (!res.ok) return null;
  const { url } = await res.json();
  if (!url) return null;
  const file = await fetch(url);
  if (!file.ok) return null;
  return file.arrayBuffer();
}
