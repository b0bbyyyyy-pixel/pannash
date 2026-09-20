'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';

// ── INK FEEL CONSTANTS — tweak these if ink is too fat / laggy / jagged ──────
const PEN_SIZE = 9;          // base stroke width (8–10 feels like a fine felt-tip)
const PEN_THINNING = 0.6;    // how much pressure thins/fattens the line
const PEN_SMOOTHING = 0.5;   // corner softening
const PEN_STREAMLINE = 0.5;  // input smoothing; higher = smoother but laggier feel
const TAPER_START = 20;      // px taper into the stroke
const TAPER_END = 20;        // px taper out of the stroke
const ERASER_SIZE = 24;      // eraser width
// ─────────────────────────────────────────────────────────────────────────────

const PAPER = '#faf8f4';
const INK = '#1a1a1a';
const MAX_DPR = 3;

export type JotPadHandle = {
  toDataURL: () => string;
  isBlank: () => boolean;
};

type Tool = 'pen' | 'eraser';

/** [x, y, pressure] in CSS pixel space */
type InputPoint = [number, number, number];

type Stroke = {
  tool: Tool;
  points: InputPoint[];
};

function acceptsPointer(type: string, finger: boolean) {
  if (type === 'pen' || type === 'mouse' || type === '') return true;
  if (type === 'touch') return finger;
  return false;
}

/**
 * Mouse and some styluses report a constant 0 or 0.5 pressure. When that
 * happens we let perfect-freehand synthesize pressure from velocity so the
 * line doesn't look like a constant marker.
 */
function pressureIsStuck(points: InputPoint[]): boolean {
  if (points.length === 0) return true;
  const first = points[0][2];
  if (first !== 0 && Math.abs(first - 0.5) > 0.001) return false;
  return points.every(p => Math.abs(p[2] - first) < 0.001);
}

function strokeOptions(tool: Tool, simulatePressure: boolean) {
  return {
    size: tool === 'eraser' ? ERASER_SIZE : PEN_SIZE,
    thinning: tool === 'eraser' ? 0 : PEN_THINNING,
    smoothing: PEN_SMOOTHING,
    streamline: PEN_STREAMLINE,
    simulatePressure,
    start: { taper: tool === 'eraser' ? 0 : TAPER_START, cap: true },
    end: { taper: tool === 'eraser' ? 0 : TAPER_END, cap: true },
  };
}

/** perfect-freehand outline → smooth Path2D (quadratic midpoint averaging). */
function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

function fillStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, live: boolean) {
  if (stroke.points.length === 0) return;
  const outline = getStroke(stroke.points, strokeOptions(stroke.tool, pressureIsStuck(stroke.points)));
  const path = outlineToPath(outline);
  ctx.save();
  if (stroke.tool === 'eraser') {
    if (live) {
      // Live feedback on the wet layer: paint paper over the ink below.
      ctx.fillStyle = PAPER;
    } else {
      // Real erase on the dry layer.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    }
  } else {
    ctx.fillStyle = INK;
  }
  ctx.fill(path);
  ctx.restore();
}

export const JotPad = forwardRef<JotPadHandle, {
  initialImage?: string | null;
}>(function JotPad({ initialImage }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dryRef = useRef<HTMLCanvasElement>(null);   // persistent bitmap: base image + finished strokes
  const wetRef = useRef<HTMLCanvasElement>(null);   // only the in-progress stroke, redrawn per frame

  const strokesRef = useRef<Stroke[]>([]);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const cssSizeRef = useRef({ w: 1, h: 1 });
  const dprRef = useRef(1);

  // Live stroke state
  const currentRef = useRef<{ pointerId: number; stroke: Stroke; predicted: InputPoint[] } | null>(null);
  const rafRef = useRef<number>(0);

  const [tool, setTool] = useState<Tool>('pen');
  const [finger, setFinger] = useState(false);
  const toolRef = useRef<Tool>('pen');
  const fingerRef = useRef(false);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { fingerRef.current = finger; }, [finger]);

  const ctxOf = useCallback((canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return null;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, []);

  /** Full re-rasterize of the dry layer (only on resize / undo / clear / load). */
  const redrawDry = useCallback(() => {
    const ctx = ctxOf(dryRef.current);
    if (!ctx) return;
    const { w, h } = cssSizeRef.current;
    ctx.clearRect(0, 0, w, h);
    if (baseRef.current) ctx.drawImage(baseRef.current, 0, 0, w, h);
    for (const s of strokesRef.current) fillStroke(ctx, s, false);
  }, [ctxOf]);

  const clearWet = useCallback(() => {
    const ctx = ctxOf(wetRef.current);
    if (!ctx) return;
    const { w, h } = cssSizeRef.current;
    ctx.clearRect(0, 0, w, h);
  }, [ctxOf]);

  /** rAF loop: the wet layer is the only thing redrawn while drawing. */
  const scheduleWet = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const ctx = ctxOf(wetRef.current);
      if (!ctx) return;
      const { w, h } = cssSizeRef.current;
      ctx.clearRect(0, 0, w, h);
      const cur = currentRef.current;
      if (!cur) return;
      fillStroke(ctx, {
        tool: cur.stroke.tool,
        points: cur.predicted.length ? [...cur.stroke.points, ...cur.predicted] : cur.stroke.points,
      }, true);
    });
  }, [ctxOf]);

  const resize = useCallback(() => {
    const wrap = wrapRef.current;
    const dry = dryRef.current;
    const wet = wetRef.current;
    if (!wrap || !dry || !wet) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (dry.width === bw && dry.height === bh && dprRef.current === dpr) return;
    dprRef.current = dpr;
    cssSizeRef.current = { w, h };
    for (const c of [dry, wet]) {
      c.width = bw;
      c.height = bh;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    redrawDry();
    clearWet();
  }, [redrawDry, clearWet]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    resize();
    return () => ro.disconnect();
  }, [resize]);

  useEffect(() => {
    strokesRef.current = [];
    currentRef.current = null;
    if (!initialImage) {
      baseRef.current = null;
      redrawDry();
      clearWet();
      return;
    }
    const img = new Image();
    img.onload = () => {
      baseRef.current = img;
      redrawDry();
    };
    img.src = initialImage;
  }, [initialImage, redrawDry, clearWet]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      const dry = dryRef.current;
      if (!dry) return '';
      // Composite paper background + dry ink into an export canvas.
      const out = document.createElement('canvas');
      out.width = dry.width;
      out.height = dry.height;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(dry, 0, 0);
      return out.toDataURL('image/png');
    },
    isBlank: () => !baseRef.current && strokesRef.current.length === 0,
  }), []);

  // Pointer Events only, attached natively so preventDefault is non-passive.
  useEffect(() => {
    const wet = wetRef.current;
    if (!wet) return;

    const toPoint = (e: PointerEvent, rect: DOMRect): InputPoint => [
      e.clientX - rect.left,
      e.clientY - rect.top,
      e.pressure,
    ];

    const onDown = (e: PointerEvent) => {
      if (currentRef.current) return; // a second contact cannot hijack the stroke
      if (!acceptsPointer(e.pointerType, fingerRef.current)) return;
      e.preventDefault();
      wet.setPointerCapture(e.pointerId);
      const rect = wet.getBoundingClientRect();
      currentRef.current = {
        pointerId: e.pointerId,
        stroke: { tool: toolRef.current, points: [toPoint(e, rect)] },
        predicted: [],
      };
      scheduleWet();
    };

    const onMove = (e: PointerEvent) => {
      const cur = currentRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      e.preventDefault();
      const rect = wet.getBoundingClientRect();
      // Recorded points: every coalesced sample, not just the dispatched event.
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      if (coalesced.length > 0) {
        for (const ce of coalesced) cur.stroke.points.push(toPoint(ce, rect));
      } else {
        cur.stroke.points.push(toPoint(e, rect));
      }
      // Predicted points: live stroke only; dropped on pointerup.
      const predicted = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
      cur.predicted = predicted.map(pe => toPoint(pe, rect));
      scheduleWet();
    };

    const finish = (e: PointerEvent) => {
      const cur = currentRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      e.preventDefault();
      currentRef.current = null;
      try { wet.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      // Predicted points are dropped; rasterize the recorded stroke onto dry.
      strokesRef.current.push(cur.stroke);
      const ctx = ctxOf(dryRef.current);
      if (ctx) fillStroke(ctx, cur.stroke, false);
      clearWet();
    };

    const block = (e: Event) => e.preventDefault();

    wet.addEventListener('pointerdown', onDown, { passive: false });
    wet.addEventListener('pointermove', onMove, { passive: false });
    wet.addEventListener('pointerup', finish, { passive: false });
    wet.addEventListener('pointercancel', finish, { passive: false });
    // Belt-and-braces for iPad Safari: no scroll/rubber-band/double-tap zoom.
    wet.addEventListener('touchstart', block, { passive: false });
    wet.addEventListener('touchmove', block, { passive: false });
    wet.addEventListener('contextmenu', block);

    return () => {
      wet.removeEventListener('pointerdown', onDown);
      wet.removeEventListener('pointermove', onMove);
      wet.removeEventListener('pointerup', finish);
      wet.removeEventListener('pointercancel', finish);
      wet.removeEventListener('touchstart', block);
      wet.removeEventListener('touchmove', block);
      wet.removeEventListener('contextmenu', block);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ctxOf, clearWet, scheduleWet]);

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redrawDry();
  }

  function clear() {
    strokesRef.current = [];
    baseRef.current = null;
    currentRef.current = null;
    redrawDry();
    clearWet();
  }

  return (
    <div
      className="flex flex-col min-h-0 flex-1 select-none"
      style={{ overscrollBehavior: 'none', WebkitUserSelect: 'none' }}
    >
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
      <div
        ref={wrapRef}
        className="flex-1 min-h-0 relative"
        style={{ background: PAPER, overscrollBehavior: 'none' }}
      >
        <canvas ref={dryRef} className="absolute inset-0 block" />
        <canvas
          ref={wetRef}
          className="absolute inset-0 block touch-none select-none"
          style={{
            touchAction: 'none',
            overscrollBehavior: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
          }}
        />
      </div>
    </div>
  );
});
