// 今天的月相：按朔望月平均长度推算，误差约半天，够看
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC 的新月

const NAMES = [
  [0, 1.2, '新月'], [1.5, 3.5, '三日月'], [6.8, 8.2, '上弦の月'], [11.5, 12.8, '十三夜'],
  [13.8, 15.3, '満月'], [15.3, 16.3, '十六夜'], [21.4, 22.8, '下弦の月'], [25, 28, '有明の月'],
  [28.6, 30, '新月'],
];

export function moonInfo(date = new Date()) {
  const days = (date.getTime() - NEW_MOON) / 86400e3;
  const phase = ((days / SYNODIC) % 1 + 1) % 1;
  const age = phase * SYNODIC;
  const found = NAMES.find(([a, b]) => age >= a && age < b);
  return { phase, age, name: found ? found[2] : '' };
}

// 画月相：暗盘 + 亮面；亮面由外侧半圆和明暗交界的半椭圆围成
export function moonSvg(phase, size = 20, title = '') {
  const r = 10;
  const c = Math.cos(2 * Math.PI * phase);
  const rx = Math.abs(c) * r;
  const waxing = phase < 0.5;
  const s1 = waxing ? 1 : 0;
  const s2 = waxing ? (c > 0 ? 0 : 1) : (c > 0 ? 1 : 0);
  const lit = `M0 ${-r} A${r} ${r} 0 0 ${s1} 0 ${r} A${rx.toFixed(3)} ${r} 0 0 ${s2} 0 ${-r}Z`;
  return `<svg class="moon" width="${size}" height="${size}" viewBox="-11 -11 22 22" role="img" aria-label="${title || '今天的月相'}">`
    + `<circle r="${r}" class="moon-dark"/><path d="${lit}" class="moon-lit"/></svg>`;
}
