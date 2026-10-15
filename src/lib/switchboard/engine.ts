import type { FlashIntensity } from '@/lib/switchboard/prefs';

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
  | 'email'
  | 'status'
  | 'ai'
  | 'idle';

export type FlashZone = 'any' | 'upper';

type Cell = { i: number; x: number; y: number; c: number; r: number };

type Live = {
  i: number;
  kind: BlipKind;
  born: number;
  life: number;
  peak: number;
  r: number;
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
const REST = { r: 148, g: 160, b: 148 };
const RULE = { r: 168, g: 162, b: 148 };
const FLASH = { r: 118, g: 122, b: 114 };
const GLOW = { r: 255, g: 253, b: 248 };
const DOT_SUBMITTED = { r: 148, g: 146, b: 138 };
const DOT_APPROVAL = { r: 148, g: 144, b: 118 };
const DOT_FUNDED = { r: 148, g: 144, b: 132 };

type PersistKind = 'prospect' | 'submitted' | 'approval' | 'funded';
type WashBand = {
  key: PersistKind;
  n: number;
  wash: { r: number; g: number; b: number };
  y: number;
  h: number;
  row0: number;
  row1: number;
};

const GAP = 13;
const PAD_X = 22;
const PAD_Y = 18;
const MAX_LIVE = 40;
const FPS_MS = 33;
const FLASH_LIFE = 920;
const FLASH_PEAK = 0.78;
const FLASH_R = 2.45;
const REST_R = 1.15;
const PERSIST_R = 1.3;
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

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  const u = clamp(t, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

function zoneFor(_kind: BlipKind): FlashZone {
  return 'upper';
}

export class SwitchboardEngine {
  w = 0;
  h = 0;
  cols = 0;
  rows = 0;
  cells: Cell[] = [];
  persist: Partial<Record<PersistKind, number[]>> = {};
  live: Live[] = [];
  scan: Scan | null = null;
  counts: SwitchboardCounts = { funded: 0, offers: 0, docsIn: 0, prospects: 0, submitted: 0, approvals: 0, day: 1, daysInMonth: 31 };
  lastDraw = 0;
  nextScan = 0;
  liveFrozen = false;
  composing = false;
  nextComposeAt = 0;
  burstUntil = 0;
  nextBurstAt = 0;
  campaignLive = false;
  aiLive = false;
  aiT0 = 0;
  intensity: FlashIntensity = 'normal';

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

  setActivity(opts: { frozen: boolean; campaignLive?: boolean; aiLive?: boolean }) {
    this.liveFrozen = opts.frozen;
    if (opts.frozen) {
      this.composing = false;
      this.burstUntil = 0;
      this.live = [];
      this.scan = null;
      this.nextScan = 0;
      this.aiT0 = 0;
      this.campaignLive = false;
      this.aiLive = false;
      return;
    }
    if (opts.campaignLive != null) {
      if (!opts.campaignLive) {
        this.scan = null;
        this.nextScan = 0;
      }
      this.campaignLive = opts.campaignLive;
    }
    if (opts.aiLive != null) {
      if (opts.aiLive && !this.aiLive) this.aiT0 = performance.now();
      if (!opts.aiLive) this.aiT0 = 0;
      this.aiLive = opts.aiLive;
    }
  }

  setComposing(on: boolean) {
    if (this.intensity === 'off') {
      this.composing = false;
      this.nextComposeAt = 0;
      return;
    }
    if (on && !this.composing) this.nextComposeAt = performance.now();
    if (!on) this.nextComposeAt = 0;
    this.composing = on;
  }

  setIntensity(next: FlashIntensity) {
    this.intensity = next;
    if (next === 'off') {
      this.composing = false;
      this.burstUntil = 0;
      this.live = [];
    }
  }

  pulse(kind: BlipKind, n = 1) {
    if (this.liveFrozen || this.intensity === 'off') return;
    const now = performance.now();
    const zone = zoneFor(kind);
    const count = this.intensity === 'soft' ? 1 : this.intensity === 'strong' ? Math.max(2, n) : n;
    for (let k = 0; k < count; k++) {
      this.spawn(now + k * 70, kind, zone, hash(now * 1000 + k * 31 + kind.length));
    }
  }

  /** Higher-rate version of the same flashes for 1–2 seconds. */
  burst(ms = 1500) {
    if (this.liveFrozen || this.intensity === 'off') return;
    const now = performance.now();
    const dur = this.intensity === 'soft' ? Math.min(ms, 800) : this.intensity === 'strong' ? Math.max(ms, 2000) : ms;
    this.burstUntil = Math.max(this.burstUntil, now + dur);
    if (this.nextBurstAt < now) this.nextBurstAt = now;
  }

  busy(now = performance.now()) {
    if (this.campaignLive || this.aiLive) return true;
    if (this.liveFrozen || this.intensity === 'off') return this.live.some(b => now < b.born + b.life);
    if (this.composing) return true;
    if (now < this.burstUntil) return true;
    return this.live.some(b => now < b.born + b.life);
  }

  tick(now: number, ctx: CanvasRenderingContext2D) {
    if (now - this.lastDraw < FPS_MS) return this.busy(now);
    this.lastDraw = now;
    this.advance(now);
    this.draw(ctx);
    return this.busy(now);
  }

  drawNow(ctx: CanvasRenderingContext2D) {
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
        const jx = ((hash(i + 3) % 5) - 2) * 0.12;
        const jy = ((hash(i + 9) % 5) - 2) * 0.12;
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
    const rowCounts = this.splitRows(shares);
    const innerH = this.h - PAD_Y * 2;
    const oy = PAD_Y + (innerH - Math.max(0, this.rows - 1) * GAP) / 2;
    let row0 = 0;
    let y = 0;
    return layers.map((l, i) => {
      const rc = rowCounts[i] ?? 0;
      const row1 = row0 + rc;
      const split = i === layers.length - 1
        ? this.h
        : oy + (row1 - 0.5) * GAP;
      const band = { ...l, y, h: Math.max(0, split - y), row0, row1 };
      y = split;
      row0 = row1;
      return band;
    });
  }

  private splitRows(shares: number[]) {
    const rows = Math.max(0, this.rows);
    const left = shares.length;
    if (!rows || !left) return shares.map(() => 0);
    const raw = shares.map(s => Math.max(1, Math.round(s * rows)));
    let delta = rows - raw.reduce((s, n) => s + n, 0);
    let grow = 0;
    for (let i = 1; i < raw.length; i++) {
      if (shares[i] > shares[grow]) grow = i;
    }
    raw[grow] += delta;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] < 1) raw[i] = 1;
    }
    delta = rows - raw.reduce((s, n) => s + n, 0);
    raw[grow] = Math.max(1, raw[grow] + delta);
    return raw;
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
      next[band.key] = this.placeInBand(band.n, band.row0, band.row1, 17 + i * 41, used);
    }
    this.persist = next;
  }

  private placeInBand(count: number, row0: number, row1: number, salt: number, used: Set<number>) {
    const pool = this.cells.filter(c => c.r >= row0 && c.r < row1 && !used.has(c.i));
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

  private pool(zone: FlashZone) {
    const used = this.occupied();
    const y1 = zone === 'upper' ? this.h * 0.58 : this.h;
    return this.cells.filter(c => c.y <= y1 && !used.has(c.i));
  }

  private pick(seed: number, zone: FlashZone, avoid: Set<number>) {
    const pool = this.pool(zone).filter(c => !avoid.has(c.i));
    if (!pool.length) return -1;
    return pool[seed % pool.length].i;
  }

  private spawn(born: number, kind: BlipKind, zone: FlashZone, seed: number, avoid?: Set<number>) {
    const i = this.pick(seed, zone, avoid ?? new Set());
    if (i < 0) return -1;
    const look = this.flashLook();
    this.live.push({
      i,
      kind,
      born,
      life: look.life,
      peak: look.peak,
      r: look.r,
    });
    if (this.live.length > MAX_LIVE) this.live.splice(0, this.live.length - MAX_LIVE);
    return i;
  }

  private flashLook() {
    if (this.intensity === 'soft') return { life: 720, peak: 0.42, r: 1.85 };
    if (this.intensity === 'strong') return { life: 1100, peak: 0.95, r: 2.8 };
    return { life: FLASH_LIFE, peak: FLASH_PEAK, r: FLASH_R };
  }

  private spawnCluster(now: number, kind: BlipKind) {
    if (this.intensity === 'soft') {
      this.spawn(now, kind, 'upper', hash(now));
      return;
    }
    const seed = hash(Math.floor(now));
    const first = this.spawn(now, kind, 'upper', seed);
    if (first < 0) return;
    const cell = this.cells[first];
    if (!cell) return;
    const avoid = new Set([first]);
    const y1 = this.h * 0.58;
    const near = this.cells.filter(c => c.i !== first && c.y <= y1 && distCells(c, cell) >= 1 && distCells(c, cell) <= 2);
    const extra = 1 + (seed % 2);
    for (let n = 0; n < extra && near.length; n++) {
      const pick = near[(seed + n * 11) % near.length];
      if (avoid.has(pick.i)) continue;
      avoid.add(pick.i);
      const look = this.flashLook();
      this.live.push({
        i: pick.i,
        kind,
        born: now + 50 + n * 60,
        life: look.life,
        peak: look.peak,
        r: look.r,
      });
    }
  }

  private waveAt(c: number, r: number, now: number) {
    const scan = this.scan;
    if (!scan || !this.cols) return 0;
    const u = clamp((now - scan.born) / scan.duration, 0, 1);
    const pad = scan.sigma * 2.2;
    const head = u * (this.cols * this.rows + pad * 2) - pad;
    const d = r * this.cols + c - head;
    const g = Math.exp(-(d * d) / (2 * scan.sigma * scan.sigma));
    const edge = u < 0.06 ? u / 0.06 : u > 0.94 ? (1 - u) / 0.06 : 1;
    return g * edge;
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

  private advance(now: number) {
    this.live = this.live.filter(b => now < b.born + b.life + 40);
    if (this.liveFrozen) return;

    if (this.campaignLive && this.cells.length) {
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

    if (this.intensity === 'off') return;

    if (now < this.burstUntil && now >= this.nextBurstAt) {
      const roll = hash(Math.floor(now / 7)) % 5;
      if (this.intensity === 'strong' || (this.intensity === 'normal' && roll === 0)) {
        this.spawnCluster(now, 'status');
      } else {
        this.spawn(now, 'status', 'upper', hash(now));
      }
      const gap = this.intensity === 'soft' ? 200 : this.intensity === 'strong' ? 70 : 110;
      this.nextBurstAt = now + gap + (hash(Math.floor(now)) % 70);
    }

    if (this.composing && now >= this.nextComposeAt) {
      this.spawn(now, 'ai', 'upper', hash(now + 19));
      const gap = this.intensity === 'soft' ? 720 : this.intensity === 'strong' ? 260 : 420;
      this.nextComposeAt = now + gap + (hash(Math.floor(now / 3)) % 260);
    }
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

    if (this.scan || this.aiLive) {
      for (const cell of this.cells) {
        const g = Math.max(this.waveAt(cell.c, cell.r, now), this.aiAt(cell.c, cell.r, now));
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
      const g = Math.max(this.waveAt(cell.c, cell.r, now), this.aiAt(cell.c, cell.r, now));
      let r = REST_R;
      let col = REST;
      let a = 0.2 * decay;

      if (p === 'submitted') {
        r = PERSIST_R;
        col = DOT_SUBMITTED;
        a = 0.55 * decay;
      } else if (p === 'approval') {
        r = PERSIST_R;
        col = DOT_APPROVAL;
        a = 0.55 * decay;
      } else if (p === 'funded') {
        r = PERSIST_R;
        col = DOT_FUNDED;
        a = 0.55 * decay;
      }

      if (g > 0.04) {
        const persistMix = p ? 0.48 : 1;
        const mix = Math.min(1, g * persistMix);
        col = mixRgb(col, GLOW, mix);
        if (!p) r = Math.max(r, REST_R + g * 1.55);
        a = Math.max(a, (0.22 + g * 0.78) * decay);
      }

      if (lives?.length) {
        let best = 0;
        for (const b of lives) {
          const t = clamp((now - b.born) / b.life, 0, 1);
          const env = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.78;
          const v = b.peak * env;
          if (v > best) best = v;
        }
        col = mixRgb(col, FLASH, best);
        r = Math.max(r, REST_R + (FLASH_R - REST_R) * best);
        a = Math.max(a, (0.35 + best * 0.6) * decay);
      }

      ctx.beginPath();
      ctx.fillStyle = rgba(col, a);
      ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
