'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_EMAIL_FONT_PT,
  LETTER_HEIGHT_PX,
  LETTER_WIDTH_PX,
  prepareEmailBodyHtml,
} from '@/lib/email/letterHtml';

type Props = {
  html: string;
  fontSizePt?: number;
};

export default function LetterEmailPreview({ html, fontSizePt = DEFAULT_EMAIL_FONT_PT }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / LETTER_WIDTH_PX));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const body = prepareEmailBodyHtml(html);
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      box-sizing: border-box;
      width: 8.5in;
      min-height: 11in;
      padding: 0.75in;
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${fontSizePt}pt;
      line-height: 1.5;
      color: #222;
    }
    p { margin: 0 0 0.75em; }
    img { max-width: 100%; height: auto; }
    a { color: #1155cc; }
  </style>
</head>
<body>${body}</body>
</html>`;

  return (
    <div ref={wrapRef} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: LETTER_WIDTH_PX * scale, height: LETTER_HEIGHT_PX * scale }}
      >
        <iframe
          key={`${fontSizePt}-${body.length}-${body.slice(0, 48)}`}
          title="Letter email preview"
          srcDoc={srcDoc}
          sandbox=""
          tabIndex={-1}
          className="absolute top-0 left-0 bg-white origin-top-left pointer-events-none"
          style={{
            width: LETTER_WIDTH_PX,
            height: LETTER_HEIGHT_PX,
            transform: `scale(${scale})`,
            border: '1px solid #e2e2e2',
            borderRadius: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.04)',
          }}
        />
      </div>
      <p className="mt-1.5 text-center text-[10px] text-[#9b9b9b]">8.5 × 11 in</p>
    </div>
  );
}
