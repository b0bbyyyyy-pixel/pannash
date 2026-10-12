export type SwitchboardCounts = {
  funded: number;
  offers: number;
  docsIn: number;
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
};

const BG = '#fafafa';
const OFF = { r: 148, g: 160, b: 148 };
const RULE = { r: 168, g: 162, b: 148 };
const FUNDED = { r: 168, g: 132, b: 72 };
const OFFER = { r: 142, g: 138, b: 88 };
const DOCS = { r: 132, g: 148, b: 136 };
const LINE = { r: 150, g: 144, b: 118 };

const GAP = 13;
const PAD_X = 22;
const PAD_Y = 18;
const MAX_LIVE = 42;
const MAX_LINES = 10;
const FPS_MS = 33;

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
    case 'declined': return 220;
    case 'smsFail': return 160;
    case 'sms': return 280;
    case 'smsDone': return 420;
    case 'smsReply': return 620;
    case 'call': return 240;
    case 'text': return 340;
    case 'idle': return 280;
  }
}

function peakFor(kind: BlipKind) {
  switch (kind) {
    case 'declined': return 0.55;
    case 'smsFail': return 0.28;
    case 'sms': return 0.52;
    case 'smsDone': return 0.4;
    case 'smsReply': return 0.7;
    case 'call': return 0.58;
    case 'text': return 0.32;
    case 'idle': return 0.18;
  }
}

function radiusFor(kind: BlipKind) {
  switch (kind) {
    case 'smsReply': return 2.1;
    case 'call': return 1.7;
    case 'sms': return 1.55;
    case 'smsDone': return 1.7;
    case 'declined': return 1.6;
    default: return 1.25;
  }
}

function colorFor(kind: BlipKind) {
  switch (kind) {
    case 'smsReply': return FUNDED;
    case 'call': return { r: 110, g: 128, b: 112 };
    case 'sms': return { r: 124, g: 142, b: 118 };
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
  funded: number[] = [];
  offers: number[] = [];
  docs: number[] = [];
  live: Live[] = [];
  lines: Line[] = [];
  traveler: Traveler | null = null;
  counts: SwitchboardCounts = { funded: 0, offers: 0, docsIn: 0, day: 1, daysInMonth: 31 };
  lastDraw = 0;
  nextIdle = 0;
  nextTravel = 0;
  liveFrozen = true;
  dialerLive = false;
  campaignLive = false;

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
      prev.funded !== next.funded ||
      prev.offers !== next.offers ||
      prev.docsIn !== next.docsIn ||
      this.funded.length !== next.funded
    ) {
      this.placePersistent();
    }
  }

  setActivity(opts: { frozen: boolean; dialerLive: boolean; campaignLive: boolean }) {
    this.liveFrozen = opts.frozen;
    this.dialerLive = opts.dialerLive;
    this.campaignLive = opts.campaignLive;
    if (opts.frozen || !opts.dialerLive) this.traveler = null;
  }

  pulse(kind: BlipKind, n = 1) {
    if (this.liveFrozen && kind !== 'idle') return;
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
      this.pushLine(spawned[0], spawned[1], now, kind === 'sms' ? 220 : 280);
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

  private placePersistent() {
    if (!this.cells.length) return;
    const used = new Set<number>();
    this.funded = this.placeSpread(this.counts.funded, 11, 3, used);
    this.offers = this.placeSpread(this.counts.offers, 29, 2, used);
    this.docs = this.placeClusters(this.counts.docsIn, 47, used);
  }

  private placeSpread(count: number, salt: number, minDist: number, used: Set<number>) {
    const out: number[] = [];
    const total = this.cells.length;
    if (!total || count <= 0) return out;
    let cursor = salt;
    let attempts = 0;
    const cap = Math.min(count, total);
    while (out.length < cap && attempts < total * 6) {
      cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
      const i = cursor % total;
      attempts += 1;
      if (used.has(i)) continue;
      const cell = this.cells[i];
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
      used.add(i);
      out.push(i);
    }
    return out;
  }

  private placeClusters(count: number, salt: number, used: Set<number>) {
    const out: number[] = [];
    const total = this.cells.length;
    if (!total || count <= 0) return out;
    const clusterN = Math.max(1, Math.ceil(count / 5));
    const per = Math.ceil(count / clusterN);
    let cursor = salt;
    for (let k = 0; k < clusterN && out.length < count; k++) {
      cursor = (Math.imul(cursor, 1103515245) + 12345) >>> 0;
      const center = cursor % total;
      const cr = Math.floor(center / this.cols);
      const cc = center % this.cols;
      const neigh: number[] = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = cr + dr;
          const c = cc + dc;
          if (rr < 0 || c < 0 || rr >= this.rows || c >= this.cols) continue;
          const i = rr * this.cols + c;
          if (used.has(i)) continue;
          neigh.push(i);
        }
      }
      neigh.sort((a, b) => distCells(this.cells[a], this.cells[center]) - distCells(this.cells[b], this.cells[center]));
      const take = Math.min(per, count - out.length, neigh.length);
      for (let n = 0; n < take; n++) {
        used.add(neigh[n]);
        out.push(neigh[n]);
      }
    }
    if (out.length < count) {
      out.push(...this.placeSpread(count - out.length, salt + 99, 1, used));
    }
    return out;
  }

  private occupied() {
    const s = new Set<number>(this.funded);
    for (const i of this.offers) s.add(i);
    for (const i of this.docs) s.add(i);
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

  private advance(now: number) {
    this.live = this.live.filter(b => now < b.born + b.life + 40);
    this.lines = this.lines.filter(l => now < l.born + l.life);

    if (!this.liveFrozen && this.dialerLive) {
      if (!this.traveler && now >= this.nextTravel) {
        this.traveler = this.makeTraveler(now);
        this.nextTravel = now + 1400 + (hash(Math.floor(now)) % 900);
      }
      if (this.traveler) {
        if (now >= this.traveler.nextAt) {
          const i = this.traveler.path[this.traveler.step];
          if (i != null) {
            this.pushLive({
              i,
              kind: 'call',
              born: now,
              life: 220,
              peak: 0.55,
              r: 1.65,
            });
            if (this.traveler.step > 0) {
              this.pushLine(this.traveler.path[this.traveler.step - 1], i, now, 180);
            }
          }
          this.traveler.step += 1;
          this.traveler.nextAt = now + 70;
          if (this.traveler.step >= this.traveler.path.length) this.traveler = null;
        }
      }
    } else {
      this.traveler = null;
    }

    const idle = !this.dialerLive && !this.campaignLive && !this.liveFrozen;
    if (idle) {
      if (!this.nextIdle) this.nextIdle = now + 4500;
      if (now >= this.nextIdle) {
        this.pulse('idle', 1);
        this.nextIdle = now + 4500 + (hash(Math.floor(now)) % 3500);
      }
    }
  }

  private makeTraveler(now: number): Traveler {
    const row = hash(Math.floor(now / 80)) % this.rows;
    const start = hash(Math.floor(now / 17)) % Math.max(1, this.cols - 6);
    const len = 5 + (hash(row + start) % 5);
    const path: number[] = [];
    const dir = (hash(row * 13 + start) & 1) === 0 ? 1 : -1;
    let c = dir < 0 ? Math.min(this.cols - 1, start + len) : start;
    for (let n = 0; n < len; n++) {
      const cc = c + dir * n;
      if (cc < 0 || cc >= this.cols) break;
      path.push(row * this.cols + cc);
    }
    return { path, step: 0, nextAt: now };
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

  private draw(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    const decay = this.decay();
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.w, this.h);

    const ruleH = (this.h - PAD_Y * 2) * this.monthFrac();
    ctx.strokeStyle = rgba(RULE, 0.42 * decay);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(10, PAD_Y);
    ctx.lineTo(10, PAD_Y + ruleH);
    ctx.stroke();

    const persist = new Map<number, 'funded' | 'offer' | 'docs'>();
    for (const i of this.funded) persist.set(i, 'funded');
    for (const i of this.offers) persist.set(i, 'offer');
    for (const i of this.docs) persist.set(i, 'docs');

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

    for (const cell of this.cells) {
      const p = persist.get(cell.i);
      const lives = liveAt.get(cell.i);
      let r = 1.15;
      let col = OFF;
      let a = 0.2 * decay;

      if (p === 'docs') {
        r = 1.2;
        col = DOCS;
        a = 0.38 * decay;
      } else if (p === 'offer') {
        r = 1.7;
        col = OFFER;
        a = 0.58 * decay;
      } else if (p === 'funded') {
        r = 2.6;
        col = FUNDED;
        a = 0.9 * decay;
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
