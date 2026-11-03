// 今天这一话：给一天起个标题，渲染成 TV 标题卡；想写再往下写
import * as db from '../db.js';
import { esc, html, dayKey, fmtDay, fmtShort, fmtTime, debounce } from '../util.js';
import { renderCard, cardHtml } from '../titlecard.js';

const PROMPTS = [
  '今天看见了什么？',
  '身体哪里有感觉？',
  '今天说出口的一句话是什么？',
  '下一小步是什么？',
  '今天的一口汤是什么？一件小的、让身体觉得好的事。',
  '今天学会的一个词，是在哪儿遇到的？',
];

const isDay = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
};

export default async function hua(root, { params, settings }) {
  if (params[0] === 'list') return list(root);

  const today = dayKey(new Date(), settings.dayStart);
  const date = isDay(params[0]) ? params[0] : today;
  const all = (await db.all('entries')).filter(e => isDay(e.id));
  let entry = all.find(e => e.id === date) || null;
  const dates = [...new Set([...all.map(e => e.id), date])].sort();
  const n = dates.indexOf(date) + 1;
  const written = all.map(e => e.id).sort();
  const pos = written.indexOf(date);
  const prev = pos > 0 ? written[pos - 1] : (pos === -1 ? written.filter(d => d < date).pop() : null);
  const next = pos >= 0 ? written[pos + 1] : written.find(d => d > date);
  const prompt = PROMPTS[[...date].reduce((a, c) => a + c.charCodeAt(0), 0) % PROMPTS.length];

  root.append(html(`
    <section class="page hua">
      <header class="page-head">
        <div>
          <h1>今天这一话</h1>
          <p class="page-sub">${fmtDay(date)}${date !== today ? `<span class="sep">·</span><a href="#/hua">回到今天</a>` : ''}</p>
        </div>
        <a class="quiet-link" href="#/hua/list">档案 · 共 ${all.length} 话</a>
      </header>
      <div class="hua-grid">
        <div class="hua-card">
          <div class="tc" id="tc"></div>
        </div>
        <div class="hua-form">
          <label class="field-label" for="hua-t">标题</label>
          <input id="hua-t" class="title-input" maxlength="40" autocomplete="off" placeholder="给今天起个名字" value="${esc(entry?.title || '')}">
          <label class="field-label" for="hua-b">想写再往下写 <span class="opt">可以不写</span></label>
          <textarea id="hua-b" class="body-input" rows="12" placeholder="${esc(prompt)}">${esc(entry?.body || '')}</textarea>
          <div class="hua-foot">
            <span class="save-state" aria-live="polite">${entry ? `存于 ${fmtTime(entry.updated)}` : ''}</span>
            ${entry ? '<button class="link-btn" data-act="tear">撕掉这一话</button>' : ''}
          </div>
        </div>
      </div>
      <nav class="hua-pn" aria-label="前后">
        ${prev ? `<a href="#/hua/${esc(prev)}">‹ ${fmtShort(prev)}</a>` : '<span></span>'}
        ${next ? `<a href="#/hua/${esc(next)}">${fmtShort(next)} ›</a>` : '<span></span>'}
      </nav>
    </section>
  `));

  const tc = root.querySelector('#tc');
  const t = root.querySelector('#hua-t');
  const b = root.querySelector('#hua-b');
  const state = root.querySelector('.save-state');

  const draw = () => renderCard(tc, { n, title: t.value, empty: '（还没有标题）' });
  draw();

  const grow = () => { b.style.height = 'auto'; b.style.height = Math.max(b.scrollHeight, 260) + 'px'; };
  grow();

  let blocked = false;
  const save = debounce(async () => {
    if (blocked) return;
    const title = t.value.trim();
    const body = b.value;
    const now = new Date().toISOString();
    try {
      // 另一个窗口改过这一话的话，不拿这边的旧内容去盖
      const latest = await db.get('entries', date);
      if ((latest?.updated || null) !== (entry?.updated || null)) {
        blocked = true;
        state.textContent = '另一个窗口也改过这一话。这边先不存了，刷新一下再接着写。';
        return;
      }
      if (!title && !body.trim()) {
        if (entry) { await db.del('entries', date); entry = null; state.textContent = '空了，就不留了'; }
        return;
      }
      entry = { id: date, title, body, created: entry?.created || now, updated: now };
      await db.put('entries', entry);
      state.textContent = `存于 ${fmtTime(now)}`;
    } catch (err) {
      console.error(err);
      state.textContent = '这次没存上，再写一个字会重试。';
    }
  }, 700);

  t.addEventListener('input', () => { draw(); state.textContent = '…'; save(); });
  b.addEventListener('input', () => { grow(); state.textContent = '…'; save(); });
  t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); b.focus(); } });

  root.addEventListener('click', async e => {
    if (e.target.dataset.act !== 'tear') return;
    if (!confirm(`撕掉 ${fmtShort(date)} 这一话？标题和正文都会删掉，后面的话数会往前补。`)) return;
    blocked = true;
    await db.del('entries', date);
    location.hash = '#/hua/list';
  });

  if (!entry) t.focus();
  return { flush: () => save.flush() };
}

async function list(root) {
  const all = (await db.all('entries')).filter(e => isDay(e.id)).sort((a, b) => a.id.localeCompare(b.id));
  const items = all.map((e, i) => ({ ...e, n: i + 1 })).reverse();

  root.append(html(`
    <section class="page hua-list">
      <header class="page-head">
        <div>
          <h1>档案</h1>
          <p class="page-sub">第几话，就是写过几篇。中间隔了多久都不算数。</p>
        </div>
        <a class="quiet-link" href="#/hua">回到今天</a>
      </header>
      ${items.length ? '<input type="search" class="search" placeholder="找标题或正文里的字" aria-label="搜索">' : ''}
      <div class="tc-grid"></div>
    </section>
  `));

  const grid = root.querySelector('.tc-grid');
  const draw = q => {
    const shown = q ? items.filter(e => ((e.title || '') + '\n' + (e.body || '')).includes(q)) : items;
    grid.innerHTML = shown.length
      ? shown.map(e => `<a class="tc-mini" href="#/hua/${esc(e.id)}"><div class="tc">${cardHtml({ n: e.n, title: e.title })}</div><span class="tc-date">${fmtShort(e.id)}</span></a>`).join('')
      : `<p class="quiet">${items.length ? '没找到。' : '还没有任何一话。'}</p>`;
  };
  draw('');
  const s = root.querySelector('.search');
  if (s) s.addEventListener('input', () => draw(s.value.trim()));
}
