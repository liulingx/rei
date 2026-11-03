// TV 版标题卡：粗明朝、压扁、第一行大，后面几行小一号，最后一行靠右
import { esc, tvNum } from './util.js';

const PUNCT = /[、，,。．.！!？?\s・／/：:；;」』）)…—]/;
const SOFT = /[的了着过和与或在是就也都还又をはがにでとへもの]/;

function vlen(s) {
  let n = 0;
  for (const ch of s) n += /[\u0000-ÿ]/.test(ch) ? 0.55 : 1;
  return n;
}

// 每个词最后一个字的位置；浏览器不支持分词时，任何位置都能断
function wordEnds(text, n) {
  const all = new Set(Array.from({ length: n }, (_, i) => i));
  if (!window.Intl || !Intl.Segmenter) return all;
  const seg = new Intl.Segmenter(/[぀-ヿ]/.test(text) ? 'ja' : 'zh', { granularity: 'word' });
  const ends = new Set();
  let pos = 0;
  for (const s of seg.segment(text)) {
    pos += [...s.segment].length;
    ends.add(pos - 1);
  }
  return ends.size ? ends : all;
}

export function splitTitle(raw) {
  const t = (raw || '').trim().replace(/\s+/g, ' ');
  if (!t) return [];
  const total = vlen(t);
  const maxLines = total <= 7 ? 1 : total <= 16 ? 2 : 3;
  if (maxLines === 1) return [t];
  // 在每个目标位置附近挑断点：只在词与词之间断；标点最好，其次是助词，再次是离目标最近处
  const chars = [...t];
  const cum = [];
  chars.reduce((a, ch, i) => (cum[i] = a + vlen(ch)), 0);
  const ends = wordEnds(t, chars.length);
  const cuts = [];
  let from = 0;
  for (let k = 1; k < maxLines; k++) {
    const goal = (total * k) / maxLines;
    let best = -1, bestScore = Infinity;
    for (let i = from; i < chars.length - 1; i++) {
      const dist = Math.abs(cum[i] - goal);
      if (dist > 3 || !ends.has(i)) continue;
      const kind = PUNCT.test(chars[i]) ? 0 : SOFT.test(chars[i]) ? 1 : 2;
      const score = kind + dist * 0.5 - (cum[i] >= goal ? 0.1 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) best = Math.min(chars.length - 2, Math.max(from, cum.findIndex(c => c >= goal)));
    cuts.push(best);
    from = best + 1;
  }
  const lines = [];
  let start = 0;
  for (const c of [...cuts, chars.length - 1]) {
    const line = chars.slice(start, c + 1).join('').trim();
    if (line) lines.push(line);
    start = c + 1;
  }
  return lines;
}

export function cardHtml({ n, title, empty = '（还没有标题）' }) {
  const lines = splitTitle(title);
  const ep = n ? `<div class="tc-ep"><span>第${tvNum(n)}話</span></div>` : '';
  if (!lines.length) {
    return `${ep}<div class="tc-body"><div class="tc-row"><span class="tc-line tc-empty" style="--fs:6cqw">${esc(empty)}</span></div></div>`;
  }
  const first = Math.min(17, 84 / vlen(lines[0]));
  const rows = lines.map((l, i) => {
    const cap = i === 0 ? 17 : first * 0.72;
    const fs = Math.min(cap, 84 / vlen(l)).toFixed(2);
    const right = lines.length > 1 && i === lines.length - 1;
    return `<div class="tc-row${right ? ' r' : ''}"><span class="tc-line" style="--fs:${fs}cqw">${esc(l)}</span></div>`;
  }).join('');
  return `${ep}<div class="tc-body">${rows}</div>`;
}

export function renderCard(el, opts) {
  el.innerHTML = cardHtml(opts);
}
