// 现场合成的雨声：粉红噪声打底，再随机落几滴
let ctx = null, master = null, bed = null, dropBuf = null, timer = null;
let on = false, volume = 0.5;
const listeners = new Set();

export const isOn = () => on;
export const getVolume = () => volume;
export function onRain(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach(f => f(on));

function pinkNoise(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

function drop() {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = dropBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500 + Math.random() * 4500;
  bp.Q.value = 6 + Math.random() * 10;
  const g = ctx.createGain();
  const peak = 0.03 + Math.random() * 0.09;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.1);
  s.connect(bp).connect(g);
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    g.connect(p).connect(master);
  } else {
    g.connect(master);
  }
  s.start(t);
  s.stop(t + 0.25);
}

function loop() {
  if (!on) return;
  drop();
  timer = setTimeout(loop, 35 + Math.random() * 170);
}

let starting = false;
export async function start() {
  if (on || starting) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  starting = true;
  ctx = ctx || new AC();
  try { await ctx.resume(); } finally { starting = false; }
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  bed = ctx.createBufferSource();
  bed.buffer = pinkNoise(6);
  bed.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const g = ctx.createGain(); g.gain.value = 0.6;
  bed.connect(hp).connect(lp).connect(g).connect(master);
  bed.start();
  dropBuf = pinkNoise(0.2);
  master.gain.setTargetAtTime(volume * 0.7, ctx.currentTime, 0.8);
  on = true;
  loop();
  emit();
}

export function stop() {
  if (!on) return;
  on = false;
  clearTimeout(timer);
  const m = master, b = bed;
  m.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
  setTimeout(() => { try { b.stop(); } catch { /* 已停 */ } m.disconnect(); }, 1800);
  emit();
}

export function toggle() { return on ? stop() : start(); }

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (on && master) master.gain.setTargetAtTime(volume * 0.7, ctx.currentTime, 0.1);
}
