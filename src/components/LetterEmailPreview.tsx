'use client';

import { DEFAULT_EMAIL_FONT_PT, prepareEmailBodyHtml } from '@/lib/email/letterHtml';

type Props = {
  html: string;
  fontSizePt?: number;
};

export default function LetterEmailPreview({ html, fontSizePt = DEFAULT_EMAIL_FONT_PT }: Props) {
  const body = prepareEmailBodyHtml(html);
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
      background: #fff;
    }
    body {
      box-sizing: border-box;
      padding: 28px 32px 40px;
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${fontSizePt}pt;
      line-height: 1.55;
      color: #222;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    p { margin: 0 0 0.85em; }
    img, table { max-width: 100% !important; }
    img { height: auto; }
    a { color: #1155cc; }
  </style>
</head>
<body>${body}</body>
</html>`;

  return (
    <div className="rounded-xl border border-[#e2e2e2] bg-white overflow-hidden shadow-sm">
      <iframe
        key={`${fontSizePt}-${body.length}-${body.slice(0, 48)}`}
        title="Email preview"
        srcDoc={srcDoc}
        sandbox=""
        tabIndex={-1}
        className="block w-full bg-white border-0"
        style={{ height: 420, colorScheme: 'light' }}
      />
    </div>
  );
}
