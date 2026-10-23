import { deflateSync } from 'zlib';

export type PdfImage = { mime: string; buffer: Buffer };

function u16(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt16LE(n & 0xffff, 0);
  return b.subarray(0, 2);
}
function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

/** TIFF Group 4 wrapper so sharp/libvips can decode a raw CCITT stream. */
export function wrapCcittAsTiff(data: Buffer, width: number, height: number, k = -1) {
  const compression = k < 0 ? 4 : k === 0 ? 3 : 2; // G4 / G3 / Huffman
  const entries: Array<[number, number, number, number]> = [
    [256, 3, 1, width],
    [257, 3, 1, height],
    [258, 3, 1, 1],
    [259, 3, 1, compression],
    [262, 3, 1, 0],
    [266, 3, 1, 1],
    [273, 4, 1, 0],
    [277, 3, 1, 1],
    [278, 4, 1, height],
    [279, 4, 1, data.length],
  ];
  const ifdStart = 8;
  const stripOffset = ifdStart + 2 + entries.length * 12 + 4;
  const body: Buffer[] = [Buffer.from('II*\x00', 'ascii'), u32(ifdStart), u16(entries.length)];
  for (const [tag, typ, count, val] of entries) {
    const value = tag === 273 ? stripOffset : val;
    const valueBuf = typ === 3 ? Buffer.concat([u16(value), Buffer.from([0, 0])]) : u32(value);
    body.push(u16(tag), u16(typ), u32(count), valueBuf);
  }
  body.push(u32(0), data);
  return Buffer.concat(body);
}

function parseIntAfter(dict: string, key: string): number | null {
  const m = dict.match(new RegExp(`/${key}\\s+(-?\\d+)`, 'i'));
  return m ? Number(m[1]) : null;
}

export function extractCcittFaxImages(pdf: Buffer): { width: number; height: number; k: number; data: Buffer }[] {
  const text = pdf.toString('latin1');
  const out: { width: number; height: number; k: number; data: Buffer }[] = [];
  const re = /\/Subtype\s*\/Image/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const streamAt = text.indexOf('stream', m.index);
    if (streamAt < 0 || streamAt - m.index > 2500) continue;
    const dict = text.slice(m.index, streamAt);
    if (!/CCITTFaxDecode/i.test(dict)) continue;
    const width = parseIntAfter(dict, 'Width') ?? parseIntAfter(dict, 'Columns');
    const height = parseIntAfter(dict, 'Height') ?? parseIntAfter(dict, 'Rows');
    const length = parseIntAfter(dict, 'Length');
    if (!width || !height || !length || length < 100) continue;
    const k = parseIntAfter(dict, 'K') ?? -1;
    let dataStart = streamAt + 6;
    if (text.charCodeAt(dataStart) === 13) dataStart += 1;
    if (text.charCodeAt(dataStart) === 10) dataStart += 1;
    const data = Buffer.from(pdf.subarray(dataStart, dataStart + length));
    if (data.length < 50) continue;
    out.push({ width, height, k, data });
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

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 1-bit packed rows → PNG when sharp is unavailable. */
function grayPngFromPacked1(width: number, height: number, packed: Buffer): Buffer | null {
  const rowBytes = Math.ceil(width / 8);
  if (packed.length < rowBytes * height) return null;
  const gray = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = (packed[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      gray[y * width + x] = bit ? 0 : 255;
    }
  }
  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    gray.copy(raw, y * stride + 1, y * width, y * width + width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function tiffToJpeg(tiff: Buffer, maxWidth = 1400): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(tiff)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Rasterize ImageCentre / CCITT statement pages for vision (page 1 has the summary). */
export async function extractCcittStatementPages(pdf: Buffer, maxPages = 2): Promise<PdfImage[]> {
  const pages = extractCcittFaxImages(pdf).slice(0, maxPages);
  const out: PdfImage[] = [];
  for (const page of pages) {
    const tiff = wrapCcittAsTiff(page.data, page.width, page.height, page.k);
    const jpeg = await tiffToJpeg(tiff);
    if (jpeg && jpeg.length > 8_000) {
      out.push({ mime: 'image/jpeg', buffer: jpeg });
      continue;
    }
    if (tiff[0] === 0x49 && tiff[1] === 0x49) {
      // last resort: if a decoder already expanded, skip
    }
    const packedGuess = grayPngFromPacked1(page.width, page.height, page.data);
    if (packedGuess && packedGuess.length > 8_000) {
      out.push({ mime: 'image/png', buffer: packedGuess });
    }
  }
  return out;
}
