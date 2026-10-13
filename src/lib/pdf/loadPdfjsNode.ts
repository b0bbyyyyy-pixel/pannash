import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** pdf.js on Node needs a real worker file — empty workerSrc throws. */
export async function loadPdfjsNode() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = pathToFileURL(worker).href;
  return pdfjs;
}
