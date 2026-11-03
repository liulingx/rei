// 全站共用一个播放器：换页不断，顶栏能停。
// 两首钢琴曲是整个地方的背景音乐；“休息”里放的是主人自己的歌，放的时候背景音乐让开
import * as db from './db.js';
import { BUILTIN } from './tracks.js';
import { toast, reducedMotion } from './util.js';

const audio = new Audio();
audio.preload = 'none';
let queue = [], idx = -1, url = null, mode = '';
let volume = 0.55;
audio.volume = volume;
const listeners = new Set();

export function onPlayer(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const state = () => ({ playing: !audio.paused && !!queue[idx], track: queue[idx] || null, mode });
const emit = () => listeners.forEach(f => f(state()));

export async function loadQueue() {
  const own = (await db.all('tracks')).sort((a, b) => a.added.localeCompare(b.added));
  return own.map(t => ({ id: t.id, name: t.name, blob: t.blob }));
}

// 背景音乐：白天先放《おはよう》，傍晚以后先放《おやすみ》，两首轮着
export function ambient(d = new Date()) {
  if (!BUILTIN.length) return Promise.resolve();
  const h = d.getHours();
  const first = h >= 5 && h < 17 ? 'ohayo' : 'oyasumi';
  const list = [...BUILTIN].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));
  return play(list, 0, 'ambient');
}

function fadeIn() {
  if (reducedMotion()) { audio.volume = volume; return; }
  audio.volume = 0;
  const t0 = performance.now();
  const step = now => {
    // 动画帧的时间戳可能略早于 t0，要夹在 0–1 之间
    const k = Math.max(0, Math.min(1, (now - t0) / 2500));
    audio.volume = volume * k;
    if (k < 1 && !audio.paused) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function play(list, i, as = 'own') {
  queue = list;
  idx = i;
  mode = as;
  const t = queue[idx];
  if (!t) return;
  if (url) { URL.revokeObjectURL(url); url = null; }
  if (t.blob) { url = URL.createObjectURL(t.blob); audio.src = url; } else { audio.src = t.src; }
  try { await audio.play(); fadeIn(); } catch { /* 浏览器不让放就算了 */ }
  emit();
}

export function toggle() {
  if (!queue[idx]) return;
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

export function next() {
  if (!queue.length) return;
  play(queue, (idx + 1) % queue.length);
}

export function stop() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (url) { URL.revokeObjectURL(url); url = null; }
  queue = []; idx = -1; mode = '';
  emit();
}

export function forget(id) {
  if (queue[idx] && queue[idx].id === id) { stop(); return; }
  const cur = queue[idx];
  queue = queue.filter(t => t.id !== id);
  idx = cur ? queue.indexOf(cur) : -1;
}

export const getVolume = () => volume;
export function setVolume(v) { volume = Math.min(1, Math.max(0, v)); audio.volume = volume; }

audio.addEventListener('error', () => {
  if (!queue[idx]) return;
  toast(`「${queue[idx].name}」放不了，可能是这个浏览器不认这种格式`);
  emit();
});
audio.addEventListener('ended', next);
audio.addEventListener('play', emit);
audio.addEventListener('pause', emit);
