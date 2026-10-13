import { deflateSync } from 'zlib';

export type PdfImage = { mime: string; buffer: Buffer };

const MAX_IMAGES = 6;
const MIN_JPEG = 12_000;

/** Pull embedded JPEGs from a scanned PDF (common for bank statements). */
export function extractEmbeddedJpegs(pdf: Buffer): PdfImage[] {
  const out: PdfImage[] = [];
  let i = 0;
  while (i < pdf.length - 1 && out.length < MAX_IMAGES) {
    if (pdf[i] === 0xff && pdf[i + 1] === 0xd8) {
      let j = i + 2;
      while (j < pdf.length - 1) {
        if (pdf[j] === 0xff && pdf[j + 1] === 0xd9) {
          const slice = pdf.subarray(i, j + 2);
          if (slice.length >= MIN_JPEG) out.push({ mime: 'image/jpeg', buffer: Buffer.from(slice) });
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= pdf.length - 1) break;
    } else {
      i++;
    }
  }
  return out;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function rgbaToPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

type PdfjsMod = {
  getDocument: (src: object) => { promise: Promise<{
    numPages: number;
    getPage: (n: number) => Promise<{
      getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
      objs: { get: (name: string, cb?: (v: unknown) => void) => unknown };
    }>;
  }> };
  OPS?: { paintImageXObject?: number; paintJpegXObject?: number };
};

/** Decode image XObjects from pdfjs when the PDF has no raw JPEG streams. */
export async function extractPdfjsImages(
  pdf: Buffer,
  loadPdfjs: () => Promise<PdfjsMod>,
): Promise<PdfImage[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useWorkerFetch: false,
    disableFontFace: true,
  }).promise;
  const paint = new Set(
    [pdfjs.OPS?.paintImageXObject, pdfjs.OPS?.paintJpegXObject].filter((n): n is number => typeof n === 'number'),
  );
  if (!paint.size) return [];
  const out: PdfImage[] = [];
  const max = Math.min(doc.numPages, MAX_IMAGES);
  for (let n = 1; n <= max && out.length < MAX_IMAGES; n++) {
    const page = await doc.getPage(n);
    const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length && out.length < MAX_IMAGES; i++) {
      if (paint.size && !paint.has(ops.fnArray[i])) continue;
      const name = String(ops.argsArray[i]?.[0] ?? '');
      if (!name) continue;
      const img = await new Promise<unknown>(resolve => {
        const existing = page.objs.get(name, resolve);
        if (existing) resolve(existing);
      });
      if (!img || typeof img !== 'object') continue;
      const rec = img as { width?: number; height?: number; data?: Uint8Array; dataLen?: number };
      if (!rec.width || !rec.height || !rec.data) continue;
      if (rec.width < 200 || rec.height < 200) continue;
      try {
        out.push({ mime: 'image/png', buffer: rgbaToPng(rec.width, rec.height, rec.data) });
      } catch {
        /* skip undecodable */
      }
    }
  }
  return out;
}

export async function extractPdfImages(
  pdf: Buffer,
  loadPdfjs?: () => Promise<PdfjsMod>,
): Promise<PdfImage[]> {
  const jpegs = extractEmbeddedJpegs(pdf);
  if (jpegs.length) return jpegs;
  if (!loadPdfjs) return [];
  try {
    return await extractPdfjsImages(pdf, loadPdfjs);
  } catch {
    return [];
  }
}
