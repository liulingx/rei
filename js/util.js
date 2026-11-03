// 小工具：转义、建节点、日期、防抖、提示、TV 版话数
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = n => String(n).padStart(2, '0');

// 一天从 startHour 点开始；凌晨写的算前一天
export function dayKey(d = new Date(), startHour = 4) {
  const x = new Date(d.getTime() - startHour * 3600e3);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDay(key) {
  const d = parseDay(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
}

export function fmtShort(key) {
  const d = parseDay(key);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function fmtTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseDay(toKey) - parseDay(fromKey)) / 86400e3);
}

export function debounce(fn, ms) {
  let t = null, args = null;
  const run = () => { t = null; const a = args; args = null; return fn(...a); };
  const f = (...a) => { args = a; clearTimeout(t); t = setTimeout(run, ms); };
  f.flush = () => { if (t) { clearTimeout(t); return run(); } };
  return f;
}

// 防抖，但把等待期间的每次修改合并起来，不丢前一个字段
export function debouncePatch(fn, ms) {
  let pending = null;
  const d = debounce(() => { const p = pending; pending = null; return fn(p); }, ms);
  const f = patch => { pending = { ...(pending || {}), ...patch }; d(); };
  f.flush = () => d.flush();
  return f;
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// TV 版的写法：第壱話、第弐拾壱話
const DIG = ['', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九'];
export function tvNum(n) {
  if (!Number.isInteger(n) || n < 1) return '';
  if (n >= 1000) return String(n);
  const tens = x => x < 10 ? DIG[x] : (Math.floor(x / 10) === 1 ? '' : DIG[Math.floor(x / 10)]) + '拾' + DIG[x % 10];
  if (n < 100) return tens(n);
  const h = Math.floor(n / 100);
  return (h === 1 ? '' : DIG[h]) + '百' + tens(n % 100);
}

// 页面里临时建的图片地址，换页时统一收回
const urls = new Set();
export function viewUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function revokeViewUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

// 早上、白天、夜里各一句问候，由主人自己定
export function greetingFor(settings, d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return settings.greet.morning;
  if (h >= 11 && h < 22) return settings.greet.day;
  return settings.greet.night;
}

export const reducedMotion =() => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function sessionFlag(key, set) {
  try {
    if (set) sessionStorage.setItem(key, '1');
    return sessionStorage.getItem(key) === '1';
  } catch { return false; }
}
