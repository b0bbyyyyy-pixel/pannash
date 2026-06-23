import { NextRequest, NextResponse } from 'next/server';
// Use pdfjs-dist legacy build directly — works in Next.js server routes without a worker
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export const dynamic = 'force-dynamic';

// Disable worker — not available in server context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';

interface CreditReportResult {
  score: number;
  availableCredit: number;
  utilization: number;
  inquiries: number;
  lates: number;
}

function parseCreditReport(text: string): CreditReportResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Credit Score
  const scoreMatch = text.match(/SCORE\s+(\d{3,4})/i);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

  // 2. Inquiries — count bureau-prefixed lines in INQUIRIES section
  const inquiriesIdx = lines.findIndex((l) => /^INQUIRIES$/i.test(l));
  const disclaimerIdx = lines.findIndex((l) =>
    /DISCLAIMER|SOURCE OF INFORMATION/i.test(l)
  );
  let inquiries = 0;
  if (inquiriesIdx > -1) {
    const endIdx = disclaimerIdx > -1 ? disclaimerIdx : lines.length;
    for (let i = inquiriesIdx + 1; i < endIdx; i++) {
      if (/^(XP|EQ|TU|EX)\s+\d{2}\/\d{2}\/\d{2,4}/i.test(lines[i])) {
        inquiries++;
      }
    }
  }

  // 3 & 4. Parse account lines for lates + revolving credit data
  // Account line format:
  //   I B CREDITOR NAME  MM/YY MM/YY  $LIMIT  $BALANCE  $PASTDUE  MO_REV  30  60  90+  STATUS
  // Account type (REV / INST / CHARGE / LEASE) appears on the NEXT line.
  const accountLineRe =
    /^[ICB]\s+[A-Z]\s+.+?\s+\d{2}\/\d{2}\s+[\d\/]+\s+\$(\d[\d,]*)\s+([-$\d]*)\s+([-$\d]*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\w\s]+)$/;

  let lates = 0;
  let totalRevLimit = 0;
  let totalRevBalance = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(accountLineRe);
    if (!m) continue;

    const limit = parseInt(m[1].replace(/,/g, '')) || 0;
    const balanceRaw = m[2].replace(/\$/g, '').replace(/,/g, '').trim();
    const balance = balanceRaw === '-' || balanceRaw === '' ? 0 : parseInt(balanceRaw) || 0;
    const thirties = parseInt(m[5]) || 0;
    const sixties  = parseInt(m[6]) || 0;
    const nineties = parseInt(m[7]) || 0;
    const status   = (m[8] || '').trim().toUpperCase();

    lates += thirties + sixties + nineties;

    // Peek at the next couple of lines for account type
    const nextLines = (lines[i + 1] || '') + ' ' + (lines[i + 2] || '');
    const isRevolvingOrCharge = /\b(REV|CHARGE)\b/i.test(nextLines);
    const isClosed = /\b(CLOSED|PAID\b|CHARGED OFF|COLLECTION|INACTIVE)\b/i.test(status);

    if (isRevolvingOrCharge && !isClosed && limit > 0) {
      totalRevLimit   += limit;
      totalRevBalance += balance;
    }
  }

  const availableCredit = Math.max(0, totalRevLimit - totalRevBalance);
  const utilization =
    totalRevLimit > 0 ? Math.round((totalRevBalance / totalRevLimit) * 100) : 0;

  return { score, availableCredit, utilization, inquiries, lates };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // Join items — preserve newlines by checking y-position jumps
    let prevY: number | null = null;
    for (const item of content.items) {
      if ('str' in item) {
        const y = (item as { transform: number[] }).transform[5];
        if (prevY !== null && Math.abs(y - prevY) > 2) {
          fullText += '\n';
        }
        fullText += (item as { str: string }).str + ' ';
        prevY = y;
      }
    }
    fullText += '\n\n';
  }

  await pdf.destroy();
  return fullText;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text: string;
    try {
      text = await extractPdfText(buffer);
    } catch (pdfErr) {
      console.error('[parse-credit-report] pdfjs error:', pdfErr);
      return NextResponse.json(
        { error: 'Could not read PDF — ensure it is a text-based credit report.' },
        { status: 422 }
      );
    }

    const parsed = parseCreditReport(text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[parse-credit-report]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
