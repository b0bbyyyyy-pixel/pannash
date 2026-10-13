export type SwitchboardCounts = {
  funded: number;
  offers: number;
  docsIn: number;
  prospects: number;
  submitted: number;
  approvals: number;
  day: number;
  daysInMonth: number;
};

export type BlipKind =
  | 'declined'
  | 'call'
  | 'sms'
  | 'smsFail'
  | 'smsDone'
  | 'smsReply'
  | 'text'
  | 'idle';

type Cell = { i: number; x: number; y: number; c: number; r: number };

type Live = {
  i: number;
  kind: BlipKind;
  born: number;
  life: number;
  peak: number;
  r: number;
};

type Line = { a: number; b: number; born: number; life: number };

type Traveler = {
  path: number[];
  step: number;
  nextAt: number;
  kind: BlipKind;
  hopMs: number;
};

type Scan = {
  born: number;
  duration: number;
  sigma: number;
};

const WASH_FUNDED = { r: 228, g: 224, b: 216 };
const WASH_APPROVED = { r: 238, g: 235, b: 228 };
const WASH_DOCS = { r: 246, g: 244, b: 239 };
const WASH_SUBMITTED = { r: 252, g: 251, b: 248 };
const WASH_MIN_SHARE = 0.06;
const OFF = { r: 148, g: 160, b: 148 };
const RULE = { r: 168, g: 162, b: 148 };
const FUNDED = { r: 74, g: 74, b: 74 };
const DOT_SUBMITTED = { r: 104, g: 118, b: 128 };
const DOT_APPROVAL = { r: 138, g: 132, b: 82 };
const DOT_FUNDED = { r: 74, g: 74, b: 74 };

type PersistKind = 'prospect' | 'submitted' | 'approval' | 'funded';
type WashBand = { key: PersistKind; n: number; wash: { r: number; g: number; b: number }; y: number; h: number };
const LINE = { r: 150, g: 144, b: 118 };
const GLOW = { r: 255, g: 253, b: 248 };

const GAP = 13;
const PAD_X = 22;
const PAD_Y = 18;
const MAX_LIVE = 56;
const MAX_LINES = 18;
const FPS_MS = 33;
const SCAN_MS = 5200;
const SCAN_GAP_MS = 600;
const AI_CYCLE_MS = 5800;
const AI_PULSE_MS = 3000;
const AI_SIGMA = 1.7;

function hash(n: number) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return (x ^ (x >>> 16)) >>> 0;
}

function rgba(c: { r: number; g: number; b: number }, a: number) {
  return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, a))})`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function distCells(a: Cell, b: Cell) {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

function lifeFor(kind: BlipKind) {
  switch (kind) {
    case 'declined': return 280;
    case 'smsFail': return 260;
    case 'sms': return 720;
    case 'smsDone': return 560;
    case 'smsReply': return 1100;
    case 'call': return 320;
    case 'text': return 520;
    case 'idle': return 280;
  }
}

function peakFor(kind: BlipKind) {
  switch (kind) {
    case 'declined': return 0.55;
    case 'smsFail': return 0.32;
    case 'sms': return 0.78;
    case 'smsDone': return 0.5;
    case 'smsReply': return 0.92;
    case 'call': return 0.62;
    case 'text': return 0.42;
    case 'idle': return 0.18;
  }
}

function radiusFor(kind: BlipKind) {
  switch (kind) {
    case 'smsReply': return 2.55;
    case 'call': return 1.75;
    case 'sms': return 2.05;
    case 'smsDone': return 1.85;
    case 'declined': return 1.6;
    default: return 1.3;
  }
}

function colorFor(kind: BlipKind) {
  switch (kind) {
    case 'smsReply': return FUNDED;
    case 'call': return { r: 110, g: 128, b: 112 };
    case 'sms': return { r: 118, g: 148, b: 108 };
    case 'smsFail': return { r: 120, g: 120, b: 118 };
    case 'declined': return { r: 140, g: 128, b: 118 };
    default: return OFF;
  }
}

export class SwitchboardEngine {
  w = 0;
  h = 0;
  cols = 0;
  rows = 0;
  cells: Cell[] = [];
  persist: Partial<Record<PersistKind, number[]>> = {};
  live: Live[] = [];
  lines: Line[] = [];
  traveler: Traveler | null = null;
  scan: Scan | null = null;
  counts: SwitchboardCounts = { funded: 0, offers: 0, docsIn: 0, prospects: 0, submitted: 0, approvals: 0, day: 1, daysInMonth: 31 };
  lastDraw = 0;
  nextIdle = 0;
  nextTravel = 0;
  nextScan = 0;
  liveFrozen = true;
  dialerLive = false;
  campaignLive = false;
  aiLive = false;
  aiT0 = 0;

  setSize(w: number, h: number) {
    const nw = Math.max(1, Math.floor(w));
    const nh = Math.max(1, Math.floor(h));
    if (nw === this.w && nh === this.h && this.cells.length) return;
    this.w = nw;
    this.h = nh;
    this.rebuildGrid();
    this.placePersistent();
  }

  setCounts(next: SwitchboardCounts) {
    const prev = this.counts;
    this.counts = next;
    if (
      prev.prospects !== next.prospects ||
      prev.submitted !== next.submitted ||
      prev.approvals !== next.approvals ||
      prev.funded !== next.funded
    ) {
      this.placePersistent();
    }
  }

  setActivity(opts: { frozen: boolean; dialerLive: boolean; campaignLive: boolean; aiLive: boolean }) {
    this.liveFrozen = opts.frozen;
    this.dialerLive = opts.dialerLive;
    this.campaignLive = opts.campaignLive;
    if (opts.aiLive && !this.aiLive) this.aiT0 = performance.now();
    if (!opts.aiLive) this.aiT0 = 0;
    this.aiLive = opts.aiLive;
    if (opts.frozen || !opts.dialerLive) this.traveler = null;
    if (opts.frozen || !opts.campaignLive) {
      this.scan = null;
      this.nextScan = 0;
    }
  }

  pulse(kind: BlipKind, n = 1) {
    if (this.liveFrozen && kind !== 'idle') return;
    if (kind === 'sms' || kind === 'smsFail' || kind === 'smsDone') return;
    const now = performance.now();
    const spawned: number[] = [];
    for (let k = 0; k < n; k++) {
      const i = this.pickFree(hash(now * 1000 + k + kind.length * 17 + this.live.length));
      if (i < 0) continue;
      this.pushLive({
        i,
        kind,
        born: now + k * 28,
        life: lifeFor(kind),
        peak: peakFor(kind),
        r: radiusFor(kind),
      });
      spawned.push(i);
    }
    if (spawned.length >= 2) {
      this.pushLine(spawned[0], spawned[1], now, 280);
    } else if (spawned.length === 1) {
      const related = this.findRelated(kind, spawned[0], now);
      if (related >= 0) this.pushLine(spawned[0], related, now, 260);
    }
  }

  tick(now: number, ctx: CanvasRenderingContext2D) {
    if (now - this.lastDraw < FPS_MS) return;
    this.lastDraw = now;
    this.advance(now);
    this.draw(ctx);
  }

  private rebuildGrid() {
    const innerW = this.w - PAD_X * 2;
    const innerH = this.h - PAD_Y * 2;
    this.cols = Math.max(6, Math.floor(innerW / GAP));
    this.rows = Math.max(8, Math.floor(innerH / GAP));
    const ox = PAD_X + (innerW - (this.cols - 1) * GAP) / 2;
    const oy = PAD_Y + (innerH - (this.rows - 1) * GAP) / 2;
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const jx = ((hash(i + 3) % 5) - 2) * 0.18;
        const jy = ((hash(i + 9) % 5) - 2) * 0.18;
        this.cells.push({ i, c, r, x: ox + c * GAP + jx, y: oy + r * GAP + jy });
      }
    }
  }

  private washBands(): WashBand[] {
    const layers: { key: PersistKind; n: number; wash: { r: number; g: number; b: number } }[] = [
      { key: 'prospect', n: Math.max(0, this.counts.prospects), wash: WASH_SUBMITTED },
      { key: 'submitted', n: Math.max(0, this.counts.submitted), wash: WASH_DOCS },
      { key: 'approval', n: Math.max(0, this.counts.approvals), wash: WASH_APPROVED },
      { key: 'funded', n: Math.max(0, this.counts.funded), wash: WASH_FUNDED },
    ];
    const total = layers.reduce((s, l) => s + l.n, 0);
    const extra = 1 - WASH_MIN_SHARE * layers.length;
    const shares = layers.map(l => WASH_MIN_SHARE + extra * (total > 0 ? l.n / total : 0.25));
    const heights = shares.map(s => Math.round(s * this.h));
    let delta = this.h - heights.reduce((s, h) => s + h, 0);
    let grow = 0;
    for (let i = 1; i < layers.length; i++) {
      if (layers[i].n > layers[grow].n) grow = i;
    }
    heights[grow] += delta;
    let y = 0;
    return layers.map((l, i) => {
      const h = Math.max(1, heights[i]);
      const band = { ...l, y, h };
      y += h;
      return band;
    });
  }

  private placePersistent() {
    if (!this.cells.length) return;
    const used = new Set<number>();
    const next: Partial<Record<PersistKind, number[]>> = {};
    const bands = this.washBands();
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      if (band.key === 'prospect') {
        next[band.key] = [];
        continue;
      }
      const y1 = i === bands.length - 1 ? this.h + 1 : band.y + band.h;
      next[band.key] = this.placeInBand(band.n, band.y, y1, 17 + i * 41, used);
    }
    this.persist = next;
  }

  private placeInBand(count: number, y0: number, y1: number, salt: number, used: Set<number>) {
    const pool = this.cells.filter(c => c.y >= y0 && c.y < y1 && !used.has(c.i));
    const out: number[] = [];
    if (!pool.length || count <= 0) return out;
    const cap = Math.min(count, pool.length);
    const minDist = pool.length > cap * 3 ? 2 : 1;
    let cursor = salt;
    let attempts = 0;
    while (out.length < cap && attempts < pool.length * 8) {
      cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
      const cell = pool[cursor % pool.length];
      attempts += 1;
      if (used.has(cell.i)) continue;
      let ok = true;
      if (minDist > 1) {
        for (const o of out) {
          if (distCells(cell, this.cells[o]) < minDist) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      used.add(cell.i);
      out.push(cell.i);
    }
    if (out.length < cap) {
      for (const cell of pool) {
        if (out.length >= cap) break;
        if (used.has(cell.i)) continue;
        used.add(cell.i);
        out.push(cell.i);
      }
    }
    return out;
  }

  private occupied() {
    const s = new Set<number>();
    for (const list of Object.values(this.persist)) {
      if (!list) continue;
      for (const i of list) s.add(i);
    }
    return s;
  }

  private pickFree(seed: number) {
    const used = this.occupied();
    const total = this.cells.length;
    if (!total) return -1;
    for (let n = 0; n < 24; n++) {
      const i = (seed + n * 17) % total;
      if (!used.has(i)) return i;
    }
    return seed % total;
  }

  private pushLive(blip: Live) {
    this.live.push(blip);
    if (this.live.length > MAX_LIVE) this.live.splice(0, this.live.length - MAX_LIVE);
  }

  private pushLine(a: number, b: number, now: number, life: number) {
    if (a === b) return;
    this.lines.push({ a, b, born: now, life });
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
  }

  private findRelated(kind: BlipKind, self: number, now: number) {
    const want = kind === 'smsReply' ? new Set<BlipKind>(['sms', 'smsReply'])
      : kind === 'sms' || kind === 'smsFail' || kind === 'smsDone' ? new Set<BlipKind>(['sms', 'smsReply', 'smsFail'])
      : kind === 'call' ? new Set<BlipKind>(['call'])
      : kind === 'text' ? new Set<BlipKind>(['text', 'smsReply'])
      : null;
    if (!want) return -1;
    let best = -1;
    let bestAge = Infinity;
    for (const b of this.live) {
      if (b.i === self || !want.has(b.kind)) continue;
      const age = now - b.born;
      if (age < 0 || age > 700) continue;
      if (age < bestAge) {
        bestAge = age;
        best = b.i;
      }
    }
    return best;
  }

  private waveAt(c: number, r: number, now: number) {
    const scan = this.scan;
    if (!scan || !this.cols) return 0;
    const u = clamp((now - scan.born) / scan.duration, 0, 1);
    const pad = scan.sigma * 2.2;
    const head = u * (this.cols * this.rows + pad * 2) - pad;
    const pos = r * this.cols + c;
    const s2 = 2 * scan.sigma * scan.sigma;
    const g0 = Math.exp(-((pos - head) ** 2) / s2);
    const g1 = Math.exp(-((pos - this.cols - head) ** 2) / s2);
    const edge = u < 0.06 ? u / 0.06 : u > 0.94 ? (1 - u) / 0.06 : 1;
    return Math.max(g0, g1) * edge;
  }

  /** Soft ring from the center out to the edges. 0 at rest. */
  private aiAt(c: number, r: number, now: number) {
    if (!this.aiLive || this.liveFrozen || !this.cols || !this.rows || !this.aiT0) return 0;
    const phase = (now - this.aiT0) % AI_CYCLE_MS;
    const u = phase / AI_PULSE_MS;
    if (u >= 1) return 0;
    const cx = (this.cols - 1) / 2;
    const cy = (this.rows - 1) / 2;
    const maxR = Math.hypot(cx, cy);
    const d = Math.hypot(c - cx, r - cy);
    const head = u * (maxR + AI_SIGMA * 2.2);
    const x = d - head;
    const g = Math.exp(-(x * x) / (2 * AI_SIGMA * AI_SIGMA));
    const fade = u < 0.08 ? u / 0.08 : u > 0.8 ? (1 - u) / 0.2 : 1;
    return g * fade;
  }

  private stepTraveler(t: Traveler, now: number) {
    if (now < t.nextAt) return false;
    const i = t.path[t.step];
    if (i != null) {
      this.pushLive({
        i,
        kind: t.kind,
        born: now,
        life: t.kind === 'sms' ? 190 : lifeFor(t.kind),
        peak: t.kind === 'sms' ? 0.72 : peakFor(t.kind),
        r: t.kind === 'sms' ? 1.85 : radiusFor(t.kind),
      });
      if (t.step > 0) this.pushLine(t.path[t.step - 1], i, now, 160);
    }
    t.step += 1;
    t.nextAt = now + t.hopMs;
    return t.step >= t.path.length;
  }

  private advance(now: number) {
    this.live = this.live.filter(b => now < b.born + b.life + 40);
    this.lines = this.lines.filter(l => now < l.born + l.life);

    if (!this.liveFrozen && this.dialerLive) {
      if (!this.traveler && now >= this.nextTravel) {
        this.traveler = this.makeTraveler(now, 'call', 70);
        this.nextTravel = now + 1400 + (hash(Math.floor(now)) % 900);
      }
      if (this.traveler && this.stepTraveler(this.traveler, now)) this.traveler = null;
    } else {
      this.traveler = null;
    }

    if (!this.liveFrozen && this.campaignLive && this.cells.length) {
      if (!this.scan && now >= this.nextScan) {
        this.scan = { born: now, duration: SCAN_MS, sigma: 5.6 };
      }
      if (this.scan && now - this.scan.born >= this.scan.duration) {
        this.scan = null;
        this.nextScan = now + SCAN_GAP_MS;
      }
    } else {
      this.scan = null;
    }

    const idle = !this.dialerLive && !this.campaignLive && !this.aiLive && !this.liveFrozen;
    if (idle) {
      if (!this.nextIdle) this.nextIdle = now + 4500;
      if (now >= this.nextIdle) {
        this.pulse('idle', 1);
        this.nextIdle = now + 4500 + (hash(Math.floor(now)) % 3500);
      }
    }
  }

  private makeTraveler(now: number, kind: BlipKind = 'call', hopMs = 70): Traveler {
    const mode = hash(Math.floor(now / 13)) % 3;
    const path: number[] = [];
    if (mode === 1 && this.rows > 4) {
      const col = hash(Math.floor(now / 29)) % this.cols;
      const start = hash(Math.floor(now / 17)) % Math.max(1, this.rows - 5);
      const len = 5 + (hash(col + start) % 4);
      const dir = (hash(col * 11 + start) & 1) === 0 ? 1 : -1;
      const r0 = dir < 0 ? Math.min(this.rows - 1, start + len) : start;
      for (let n = 0; n < len; n++) {
        const rr = r0 + dir * n;
        if (rr < 0 || rr >= this.rows) break;
        path.push(rr * this.cols + col);
      }
    } else if (mode === 2 && this.cols > 6 && this.rows > 4) {
      const row = hash(Math.floor(now / 80)) % this.rows;
      const start = hash(Math.floor(now / 17)) % Math.max(1, this.cols - 5);
      const across = 4 + (hash(row + start) % 4);
      const dir = (hash(row * 13 + start) & 1) === 0 ? 1 : -1;
      let c = dir < 0 ? Math.min(this.cols - 1, start + across) : start;
      for (let n = 0; n < across; n++) {
        const cc = c + dir * n;
        if (cc < 0 || cc >= this.cols) break;
        path.push(row * this.cols + cc);
        c = cc;
      }
      const last = path[path.length - 1];
      if (last != null) {
        const cc = last % this.cols;
        const rr = Math.floor(last / this.cols);
        const vdir = rr < this.rows / 2 ? 1 : -1;
        for (let n = 1; n <= 3; n++) {
          const r2 = rr + vdir * n;
          if (r2 < 0 || r2 >= this.rows) break;
          path.push(r2 * this.cols + cc);
        }
      }
    } else {
      const row = hash(Math.floor(now / 80)) % this.rows;
      const start = hash(Math.floor(now / 17)) % Math.max(1, this.cols - 6);
      const len = 6 + (hash(row + start) % 5);
      const dir = (hash(row * 13 + start) & 1) === 0 ? 1 : -1;
      const c0 = dir < 0 ? Math.min(this.cols - 1, start + len) : start;
      for (let n = 0; n < len; n++) {
        const cc = c0 + dir * n;
        if (cc < 0 || cc >= this.cols) break;
        path.push(row * this.cols + cc);
      }
    }
    return { path, step: 0, nextAt: now, kind, hopMs };
  }

  private decay() {
    const { day, daysInMonth } = this.counts;
    if (daysInMonth <= 1) return 1;
    return 1 - 0.16 * ((day - 1) / (daysInMonth - 1));
  }

  private monthFrac() {
    const { day, daysInMonth } = this.counts;
    const remaining = clamp(daysInMonth - day + 1, 0, daysInMonth);
    return remaining / daysInMonth;
  }

  private drawWash(ctx: CanvasRenderingContext2D) {
    for (const band of this.washBands()) {
      const c = band.wash;
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillRect(0, band.y, this.w, band.h + 1);
    }
  }

  private draw(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    const decay = this.decay();
    this.drawWash(ctx);

    const ruleH = (this.h - PAD_Y * 2) * this.monthFrac();
    ctx.strokeStyle = rgba(RULE, 0.42 * decay);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(10, PAD_Y);
    ctx.lineTo(10, PAD_Y + ruleH);
    ctx.stroke();

    const persist = new Map<number, PersistKind>();
    for (const [kind, list] of Object.entries(this.persist) as [PersistKind, number[] | undefined][]) {
      if (!list) continue;
      for (const i of list) persist.set(i, kind);
    }

    const liveAt = new Map<number, Live[]>();
    for (const b of this.live) {
      if (now < b.born) continue;
      const arr = liveAt.get(b.i);
      if (arr) arr.push(b);
      else liveAt.set(b.i, [b]);
    }

    ctx.lineWidth = 0.5;
    for (const line of this.lines) {
      const ca = this.cells[line.a];
      const cb = this.cells[line.b];
      if (!ca || !cb) continue;
      const t = clamp((now - line.born) / line.life, 0, 1);
      const a = (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8) * 0.32 * decay;
      ctx.strokeStyle = rgba(LINE, a);
      ctx.beginPath();
      ctx.moveTo(ca.x, ca.y);
      ctx.lineTo(cb.x, cb.y);
      ctx.stroke();
    }

    if (this.scan || this.aiLive) {
      for (const cell of this.cells) {
        const sms = this.waveAt(cell.c, cell.r, now);
        const ai = this.aiAt(cell.c, cell.r, now);
        const g = Math.max(sms, ai);
        if (g < 0.05) continue;
        ctx.beginPath();
        ctx.fillStyle = rgba(GLOW, g * 0.2 * decay);
        ctx.arc(cell.x, cell.y, 5.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const cell of this.cells) {
      const p = persist.get(cell.i);
      const lives = liveAt.get(cell.i);
      const sms = this.waveAt(cell.c, cell.r, now);
      const ai = this.aiAt(cell.c, cell.r, now);
      const g = Math.max(sms, ai);
      let r = 1.15;
      let col = OFF;
      let a = 0.2 * decay;

      if (p === 'submitted') {
        r = 1.3;
        col = DOT_SUBMITTED;
        a = 0.88 * decay;
      } else if (p === 'approval') {
        r = 1.3;
        col = DOT_APPROVAL;
        a = 0.88 * decay;
      } else if (p === 'funded') {
        r = 1.35;
        col = DOT_FUNDED;
        a = 0.92 * decay;
      }

      if (g > 0.04) {
        const persistMix = p ? 0.48 : 1;
        const mix = Math.min(1, g * persistMix);
        col = {
          r: Math.round(col.r + (GLOW.r - col.r) * mix),
          g: Math.round(col.g + (GLOW.g - col.g) * mix),
          b: Math.round(col.b + (GLOW.b - col.b) * mix),
        };
        if (!p) r = Math.max(r, 1.15 + g * 1.55);
        a = Math.max(a, (0.22 + g * 0.78) * decay);
      }

      if (lives?.length) {
        let best = 0;
        for (const b of lives) {
          const t = clamp((now - b.born) / b.life, 0, 1);
          const env = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
          const v = b.peak * env;
          if (v > best) {
            best = v;
            col = colorFor(b.kind);
            r = Math.max(r, b.r);
          }
        }
        a = Math.max(a, best * decay);
      }

      ctx.beginPath();
      ctx.fillStyle = rgba(col, a);
      ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
