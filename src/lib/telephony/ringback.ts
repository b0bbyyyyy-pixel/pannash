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
