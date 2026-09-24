import { readFileSync } from 'fs';
import { join } from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  APPLICATION_BROKER,
  formatStampDate,
  formatStampDateTime,
  type FundingApplicationData,
} from '@/lib/fundingApplication';

function loadSignatureFont(): Uint8Array {
  const candidates = [
    join(process.cwd(), 'src/lib/fonts/GreatVibes-Regular.ttf'),
    join(process.cwd(), 'public/fonts/GreatVibes-Regular.ttf'),
  ];
  for (const p of candidates) {
    try {
      return new Uint8Array(readFileSync(p));
    } catch {
      // try next
    }
  }
  throw new Error('Missing GreatVibes-Regular.ttf');
}

const NAVY = rgb(0.09, 0.13, 0.24);
const INK = rgb(0.10, 0.10, 0.12);
const MUTED = rgb(0.45, 0.47, 0.50);
const RULE = rgb(0.88, 0.89, 0.91);
const WHITE = rgb(1, 1, 1);

const LEGAL = [
  'By signing below, each of the above listed business and business owner/officer (individually and collectively, "Applicant") certify that the Applicant is an owner of the above named business and that all information provided in the application is true and accurate.',
  'Applicant shall immediately notify American Business Funding LLC of any change in such information or financial condition. Applicant authorizes American Business Funding LLC to share this application with each of its representatives, successors, assigns and designees ("Assignees") or any other parties that may be involved with the extension of credit pursuant to this application including those who offer commercial loans having daily repayment features or purchases of future receivables including Merchant Cash Advance transactions, including without limitation the application therefor (collectively, "Transactions"). Applicant further authorizes American Business Funding LLC and all Assignees to request and receive any third party consumer or personal, business and investigative reports and other information about Applicant, including credit card processor statements and bank statements, from one or more consumer reporting agencies, such as TransUnion, Experian, and Equifax, and from other credit bureaus, banks, creditors and other third parties.',
  'You also authorize American Business Funding LLC to transmit this Application, with any of the foregoing information submitted/obtained in connection with this application, to any or all of the Assignees for the foregoing purposes. You also consent to the release, by any creditor or financial institution, of any information relating to any of you, to American Business Funding LLC and to each of the Assignees, on its own behalf.',
  'You intend to sign this Application electronically and consent to transacting business with American Business Funding LLC and its affiliates electronically. You are providing your business cell phone and business e-mail address and hereby consent to the receipt of correspondence/messages regarding transactions with American Business Funding LLC and/or its affiliates on either medium. You also hereby consent to the receipt of text messages knowing that msg and data rates may apply (approximately 10 msgs/month).',
  'You understand that consent to conduct business via electronic signatures and to receive text messages are not a condition of approval and you may opt-out of either/both by contacting American Business Funding LLC at info@Americanbusinessfunding.com. Your signature above certifies that you are authorized to sign this application on behalf of the Business and all the information contained herein is complete, true and accurate.',
];

function drawTracked(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  tracking = 0.9,
  align: 'left' | 'center' = 'left',
) {
  const chars = text.split('');
  const widths = chars.map((c) => font.widthOfTextAtSize(c, size));
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : x;
  for (let i = 0; i < chars.length; i++) {
    page.drawText(chars[i], { x: cx, y, size, font, color });
    cx += widths[i] + tracking;
  }
}

function fit(text: string, font: PDFFont, size: number, max: number): string {
  const t = text || '';
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  let shown = t;
  while (shown.length > 1 && font.widthOfTextAtSize(`${shown}…`, size) > max) {
    shown = shown.slice(0, -1);
  }
  return `${shown}…`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildFundingApplicationPdf(
  data: FundingApplicationData,
  opts: { signedAt?: Date; ip?: string } = {},
): Promise<Uint8Array> {
  const signedAt = opts.signedAt ?? new Date();
  const stamp = formatStampDate(signedAt);
  const stampTime = formatStampDateTime(signedAt);
  const ip = (opts.ip || '').trim();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const script = await doc.embedFont(loadSignatureFont());

  const W = 612;
  const ml = 36;
  const mr = 36;
  const right = W - mr;
  const contentW = right - ml;
  let y = 768;

  drawTracked(page, 'AMERICAN BUSINESS FUND', W / 2, y, 11, bold, NAVY, 1.15, 'center');
  y -= 14;
  drawTracked(page, 'ONLINE APPLICATION', W / 2, y, 8, bold, NAVY, 1.05, 'center');
  y -= 18;

  page.drawText(`Broker: ${APPLICATION_BROKER.name}  |  Email: ${APPLICATION_BROKER.email}`, {
    x: ml,
    y,
    size: 8,
    font,
    color: INK,
  });
  y -= 10;
  page.drawLine({ start: { x: ml, y }, end: { x: right, y }, thickness: 1.4, color: NAVY });
  y -= 14;

  const section = (title: string) => {
    page.drawRectangle({ x: ml, y: y - 3, width: contentW, height: 15, color: NAVY });
    drawTracked(page, title, ml + 8, y + 1, 7, bold, WHITE, 1.05, 'left');
    y -= 20;
  };

  const cell = (label: string, value: string, x: number, width: number) => {
    page.drawText(label.toUpperCase(), { x, y, size: 6, font: bold, color: MUTED });
    page.drawText(fit(value, font, 8.5, width - 4), { x, y: y - 11, size: 8.5, font, color: INK });
  };

  const row = (cells: { label: string; value: string; width: number }[]) => {
    let x = ml;
    for (const c of cells) {
      cell(c.label, c.value, x, c.width);
      x += c.width;
    }
    y -= 24;
    page.drawLine({ start: { x: ml, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.4, color: RULE });
  };

  section('BUSINESS INFORMATION');
  row([
    { label: 'Legal/Corporate Name', value: data.legalName, width: contentW * 0.62 },
    { label: 'DBA', value: data.dba, width: contentW * 0.38 },
  ]);
  row([{ label: 'Physical Address', value: data.businessAddress, width: contentW }]);
  row([
    { label: 'City', value: data.businessCity, width: contentW * 0.46 },
    { label: 'State', value: data.businessState, width: contentW * 0.22 },
    { label: 'ZIP Code', value: data.businessZip, width: contentW * 0.32 },
  ]);
  row([
    { label: 'Business Phone', value: data.businessPhone, width: contentW * 0.38 },
    { label: 'Business Email', value: data.businessEmail, width: contentW * 0.62 },
  ]);
  row([
    { label: 'Federal Tax ID (EIN)', value: data.ein, width: contentW * 0.38 },
    { label: 'Date Started', value: data.dateStarted, width: contentW * 0.30 },
    { label: 'Entity Type', value: data.entityType, width: contentW * 0.32 },
  ]);
  row([
    { label: 'Industry', value: data.industry, width: contentW * 0.50 },
    { label: 'Use of Proceeds', value: data.useOfProceeds, width: contentW * 0.50 },
  ]);

  y -= 4;
  section('FINANCIAL INFORMATION');
  row([
    { label: 'Annual Revenue', value: data.annualRevenue, width: contentW * 0.50 },
    { label: 'Requested Amount', value: data.requestedAmount, width: contentW * 0.50 },
  ]);

  y -= 4;
  section('OWNER / OFFICER 1 INFORMATION');
  row([
    { label: 'Name', value: data.owner1Name, width: contentW * 0.62 },
    { label: 'Title', value: data.owner1Title, width: contentW * 0.38 },
  ]);
  row([{ label: 'Home Address', value: data.owner1HomeAddress, width: contentW }]);
  row([
    { label: 'Email', value: data.owner1Email, width: contentW * 0.62 },
    { label: 'SSN', value: data.owner1Ssn, width: contentW * 0.38 },
  ]);
  row([
    { label: 'Date of Birth', value: data.owner1Dob, width: contentW * 0.34 },
    { label: 'Ownership %', value: data.owner1Ownership, width: contentW * 0.33 },
    { label: 'Credit Score', value: data.owner1Credit, width: contentW * 0.33 },
  ]);

  const o2 = data.owner2;
  y -= 4;
  section('OWNER / OFFICER 2 INFORMATION');
  row([
    { label: 'Name', value: o2?.name ?? '', width: contentW * 0.62 },
    { label: 'Title', value: o2?.title ?? '', width: contentW * 0.38 },
  ]);
  row([{ label: 'Home Address', value: o2?.homeAddress ?? '', width: contentW }]);
  row([
    { label: 'Email', value: o2?.email ?? '', width: contentW * 0.62 },
    { label: 'SSN', value: o2?.ssn ?? '', width: contentW * 0.38 },
  ]);
  row([
    { label: 'Date of Birth', value: o2?.dob ?? '', width: contentW * 0.34 },
    { label: 'Ownership %', value: o2 ? o2.ownershipPercent : '%', width: contentW * 0.33 },
    { label: 'Credit Score', value: o2?.creditScore ?? '', width: contentW * 0.33 },
  ]);

  const sigTop = 118;
  y -= 6;
  const legalSize = 5.7;
  const legalLead = 7.1;
  for (const para of LEGAL) {
    const lines = wrap(para, font, legalSize, contentW);
    for (const line of lines) {
      if (y < sigTop + 22) break;
      page.drawText(line, { x: ml, y, size: legalSize, font, color: rgb(0.28, 0.29, 0.32) });
      y -= legalLead;
    }
    y -= 2.2;
  }

  drawTracked(
    page,
    `Generated via American Business Funding LLC - ${stamp}`,
    ml,
    sigTop + 10,
    6.5,
    bold,
    MUTED,
    0.55,
  );

  const drawSig = (title: string, signer: string, ipLine: string, date: string, x: number, width: number) => {
    page.drawText(title, { x, y: sigTop - 6, size: 6.5, font: bold, color: MUTED });
    page.drawText('DATE', { x: x + width - 78, y: sigTop - 6, size: 6.5, font: bold, color: MUTED });
    if (signer) {
      let sigSize = 22;
      const maxSig = width - 92;
      while (sigSize > 14 && script.widthOfTextAtSize(signer, sigSize) > maxSig) sigSize -= 1;
      page.drawText(signer, { x, y: sigTop - 26, size: sigSize, font: script, color: rgb(0.08, 0.12, 0.28) });
    }
    page.drawLine({
      start: { x, y: sigTop - 28 },
      end: { x: x + width - 88, y: sigTop - 28 },
      thickness: 0.6,
      color: RULE,
    });
    page.drawText(date, { x: x + width - 78, y: sigTop - 22, size: 8.5, font, color: INK });
    page.drawText(ipLine, { x, y: sigTop - 40, size: 6, font, color: MUTED });
  };

  const half = contentW / 2;
  const ip1 = ip ? `IP: ${ip}  |  ${stampTime}` : `IP:  |  ${stampTime}`;
  drawSig('OWNER 1 SIGNATURE', data.owner1Name, ip1, stamp, ml, half);
  drawSig(
    'OWNER 2 SIGNATURE',
    o2?.name ?? '',
    o2 ? (ip ? `IP: ${ip}  |  ${stampTime}` : `IP:  |  ${stampTime}`) : 'IP: |',
    stamp,
    ml + half + 8,
    half - 8,
  );

  page.drawText('1 of 1', {
    x: W / 2 - 12,
    y: 22,
    size: 7,
    font,
    color: MUTED,
  });

  return doc.save();
}
