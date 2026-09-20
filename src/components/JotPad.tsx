'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type JotPadHandle = {
  toDataURL: () => string;
  isBlank: () => boolean;
};

type Tool = 'pen' | 'eraser';

type Point = { x: number; y: number; p: number };

type Stroke = {
  tool: Tool;
  points: Point[];
};

const PAPER = '#faf8f4';
const INK = '#1a1a1a';

function acceptsPointer(type: string, finger: boolean) {
  if (type === 'pen' || type === 'mouse' || type === '') return true;
  if (type === 'touch') return finger;
  return false;
}

export const JotPad = forwardRef<JotPadHandle, {
  initialImage?: string | null;
}>(function JotPad({ initialImage }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [finger, setFinger] = useState(false);
  const fingerRef = useRef(false);
  const toolRef = useRef<Tool>('pen');

  useEffect(() => { fingerRef.current = finger; }, [finger]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (baseRef.current) {
      ctx.drawImage(baseRef.current, 0, 0, canvas.width, canvas.height);
    }
    for (const s of strokesRef.current) drawStroke(ctx, s);
  }, []);

  const resize = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    if (canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr)) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    paint();
  }, [paint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    resize();
    return () => ro.disconnect();
  }, [resize]);

  useEffect(() => {
    if (!initialImage) {
      baseRef.current = null;
      strokesRef.current = [];
      paint();
      return;
    }
    const img = new Image();
    img.onload = () => {
      baseRef.current = img;
      strokesRef.current = [];
      paint();
    };
    img.src = initialImage;
  }, [initialImage, paint]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    isBlank: () => !baseRef.current && strokesRef.current.length === 0,
  }), []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const p = e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
      p,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!acceptsPointer(e.pointerType, fingerRef.current)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = { tool: toolRef.current, points: [pos(e)] };
    drawingRef.current = stroke;
    strokesRef.current = [...strokesRef.current, stroke];
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawingRef.current;
    if (!stroke) return;
    e.preventDefault();
    stroke.points.push(pos(e));
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    drawStroke(ctx, { tool: stroke.tool, points: stroke.points.slice(-2) });
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    paint();
  }

  function clear() {
    strokesRef.current = [];
    baseRef.current = null;
    paint();
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="shrink-0 px-5 py-2 flex items-center gap-3 border-b border-[#e5e5e5]">
        <button
          type="button"
          onClick={() => setTool('pen')}
          className={`text-[10px] uppercase tracking-wide ${tool === 'pen' ? 'font-semibold text-[#1a1a1a]' : 'text-[#9b9b9b]'}`}
        >
          Pen
        </button>
        <button
          type="button"
          onClick={() => setTool('eraser')}
          className={`text-[10px] uppercase tracking-wide ${tool === 'eraser' ? 'font-semibold text-[#1a1a1a]' : 'text-[#9b9b9b]'}`}
        >
          Eraser
        </button>
        <button type="button" onClick={undo} className="text-[10px] uppercase tracking-wide text-[#9b9b9b] hover:text-[#1a1a1a]">
          Undo
        </button>
        <button type="button" onClick={clear} className="text-[10px] uppercase tracking-wide text-[#9b9b9b] hover:text-[#1a1a1a]">
          Clear
        </button>
        <button
          type="button"
          onClick={() => setFinger(f => !f)}
          className={`ml-auto text-[10px] uppercase tracking-wide ${finger ? 'font-semibold text-[#1a1a1a]' : 'text-[#9b9b9b]'}`}
        >
          Finger
        </button>
      </div>
      <div ref={wrapRef} className="flex-1 min-h-0 relative" style={{ background: PAPER }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block touch-none"
          style={{ touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={e => e.preventDefault()}
        />
      </div>
    </div>
  );
});

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.tool === 'eraser') {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 18;
  } else {
    ctx.strokeStyle = INK;
  }
  if (pts.length === 1) {
    const a = pts[0];
    ctx.beginPath();
    ctx.lineWidth = stroke.tool === 'eraser' ? 18 : 2.2 * (0.45 + a.p);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + 0.01, a.y);
    ctx.stroke();
  } else {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      ctx.beginPath();
      ctx.lineWidth = stroke.tool === 'eraser' ? 18 : 2.2 * (0.45 + b.p);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
