/** US ringback (440+480 Hz, 2s on / 4s off) while Twilio holds audio until the callee answers. */

type RingbackHandle = { start: () => Promise<void>; stop: () => void };

export function createRingback(): RingbackHandle {
  let ctx: AudioContext | null = null;
  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function start() {
    if (stopped) return;
    if (ctx) return;
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* autoplay */ }
    }
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    osc1 = ctx.createOscillator();
    osc2 = ctx.createOscillator();
    osc1.frequency.value = 440;
    osc2.frequency.value = 480;
    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();

    const pulse = () => {
      if (stopped || !ctx || !gain) return;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.07, t + 0.03);
      gain.gain.setValueAtTime(0.07, t + 2);
      gain.gain.linearRampToValueAtTime(0, t + 2.03);
      timer = setTimeout(pulse, 6000);
    };
    pulse();
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    try { osc1?.stop(); } catch { /* already stopped */ }
    try { osc2?.stop(); } catch { /* already stopped */ }
    osc1 = null;
    osc2 = null;
    gain = null;
    const c = ctx;
    ctx = null;
    if (c) void c.close().catch(() => {});
  }

  return { start, stop };
}

/**
 * Incoming ringtone — short 880+1320 Hz chirps, distinct from a US desk-phone ring.
 */
export function createIncomingRing(): RingbackHandle {
  let ctx: AudioContext | null = null;
  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function start() {
    if (stopped) return;
    if (ctx) return;
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* autoplay */ }
    }
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    osc1 = ctx.createOscillator();
    osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = 880;
    osc2.frequency.value = 1320;
    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();

    const chirp = (at: number) => {
      if (!ctx || !gain) return;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.setValueAtTime(0.12, at + 0.12);
      gain.gain.linearRampToValueAtTime(0, at + 0.15);
    };

    const pulse = () => {
      if (stopped || !ctx || !gain) return;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      chirp(t);
      chirp(t + 0.22);
      chirp(t + 0.44);
      timer = setTimeout(pulse, 1400);
    };
    pulse();
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    try { osc1?.stop(); } catch { /* already stopped */ }
    try { osc2?.stop(); } catch { /* already stopped */ }
    osc1 = null;
    osc2 = null;
    gain = null;
    const c = ctx;
    ctx = null;
    if (c) void c.close().catch(() => {});
  }

  return { start, stop };
}

/** Short two-tone beep when hunt hands a live person to the agent. */
export function playPickupBeep(): void {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const beep = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.setValueAtTime(0.18, start + dur);
    gain.gain.linearRampToValueAtTime(0, start + dur + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  };
  void ctx.resume().then(() => {
    const t = ctx.currentTime;
    beep(880, t, 0.12);
    beep(1175, t + 0.16, 0.18);
    window.setTimeout(() => { void ctx.close().catch(() => {}); }, 800);
  }).catch(() => {});
}

export function voiceErrorMessage(e: unknown): string {
  const err = e as { code?: number; message?: string };
  const code = err.code;
  const msg = String(err.message ?? '');
  if (code === 31208 || /microphone|Permission denied/i.test(msg)) {
    return 'Microphone access is required. Allow the mic and try again.';
  }
  if (code === 20101 || code === 20104 || /token/i.test(msg)) {
    return 'Phone session expired. Refresh the page and dial again.';
  }
  if (
    code === 31005 || code === 31009 || code === 31000 || code === 31003
    || /gateway|ICE|WebSocket|connection error/i.test(msg)
  ) {
    return 'Browser call failed (Twilio gateway). Try again — if it keeps happening, refresh the page. Your cell can still reach this number.';
  }
  return msg || 'Call failed.';
}
