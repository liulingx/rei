// 田：每块田长到苗、青、穗哪一档由主人说了算；同一时间只放一个“下一次”
import * as db from '../db.js';
import { esc, html, uid, toast, dayKey, fmtShort, fmtDay, daysBetween, debouncePatch } from '../util.js';

export const STAGES = ['苗', '青', '穗'];
const MAX_FIELDS = 6;

async function seed(settings) {
  if (settings.seeded) return;
  const now = new Date().toISOString();
  await db.put('fields', { id: uid(), name: '保研', stage: 0, note: '', next: '', date: '', showCountdown: false, order: 0, created: now });
  await db.put('fields', { id: uid(), name: '日语 N1', stage: 0, note: '', next: '', date: '2026-12-06', showCountdown: false, order: 1, created: now });
  await db.saveSettings({ seeded: true });
}

export default async function tian(root, { settings }) {
  await seed(settings);
  const today = dayKey(new Date(), settings.dayStart);

  root.append(html(`
    <section class="tian">
      <div class="tian-banner"><img src="img/field.webp" width="1536" height="1024" alt="夜里的梯田，远处一个人在插秧"></div>
      <div class="page">
        <header class="page-head">
          <div>
            <h1>田</h1>
            <p class="page-sub">长到哪一档，你自己说了算。每块田同一时间只放一个“下一次”，放下它不留记录。</p>
          </div>
        </header>
        <div class="fields"></div>
        <button class="btn ghost add-field" data-act="add">开一块新田</button>
      </div>
    </section>
  `));

  const box = root.querySelector('.fields');
  const savers = new Map();

  function saver(id) {
    if (!savers.has(id)) {
      savers.set(id, debouncePatch(async patch => {
        const f = await db.get('fields', id);
        if (f) await db.put('fields', { ...f, ...patch });
      }, 600));
    }
    return savers.get(id);
  }

  function countdown(f) {
    if (!f.date || !f.showCountdown) return '';
    const d = daysBetween(today, f.date);
    return d > 0 ? `还有 ${d} 天` : d === 0 ? '就是今天' : '那天已经过去了';
  }

  async function draw() {
    const fields = (await db.all('fields')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const harvest = await db.all('harvest');
    root.querySelector('.add-field').hidden = fields.length >= MAX_FIELDS;
    if (!fields.length) { box.innerHTML = '<p class="quiet">现在没有田。想开的时候再开一块。</p>'; return; }
    box.innerHTML = fields.map(f => {
      const got = harvest.filter(h => h.fieldId === f.id).sort((a, b) => b.date.localeCompare(a.date));
      return `<article class="fieldcard" data-id="${esc(f.id)}">
        <header class="fc-head">
          <input class="fc-name" data-k="name" value="${esc(f.name)}" maxlength="20" aria-label="田的名字">
          <div class="stage" role="radiogroup" aria-label="长到哪一档">
            ${STAGES.map((s, i) => `<button role="radio" aria-checked="${f.stage === i}" data-stage="${i}">${s}</button>`).join('')}
          </div>
        </header>
        <label class="fc-label">现在的样子<textarea class="fc-note" data-k="note" rows="2" placeholder="比如：还差什么、走到哪了">${esc(f.note)}</textarea></label>
        <div class="fc-next">
          <label class="fc-label">下一次<input data-k="next" value="${esc(f.next)}" placeholder="如果 ___，我就 ___" autocomplete="off"></label>
          <div class="fc-next-act"><button class="btn" data-act="done">做到了</button><button class="link-btn" data-act="swap">换一个</button></div>
        </div>
        <div class="fc-date">
          <label class="fc-label inline">日子<input type="date" data-k="date" value="${esc(f.date || '')}"></label>
          <label class="chk"><input type="checkbox" data-k="showCountdown" ${f.showCountdown ? 'checked' : ''}> 显示还有几天</label>
          <span class="fc-cd quiet">${f.date ? fmtDay(f.date) : ''}${countdown(f) ? `<span class="sep">·</span>${countdown(f)}` : ''}</span>
        </div>
        ${got.length ? `<details class="fc-harvest"><summary>收过的（${got.length}）</summary><ul>${got.map(h => `<li><span class="quiet">${fmtShort(h.date)}</span> ${esc(h.text)}</li>`).join('')}</ul></details>` : ''}
        <button class="link-btn fc-remove" data-act="remove">删掉这块田</button>
      </article>`;
    }).join('');
  }

  box.addEventListener('input', e => {
    const card = e.target.closest('.fieldcard');
    const k = e.target.dataset.k;
    if (!card || !k || e.target.type === 'checkbox' || e.target.type === 'date') return;
    saver(card.dataset.id)({ [k]: e.target.value });
  });

  box.addEventListener('change', async e => {
    const card = e.target.closest('.fieldcard');
    const k = e.target.dataset.k;
    if (!card || (k !== 'showCountdown' && k !== 'date')) return;
    const s = saver(card.dataset.id);
    await s.flush();
    const f = await db.get('fields', card.dataset.id);
    if (!f) return;
    await db.put('fields', { ...f, [k]: k === 'showCountdown' ? e.target.checked : e.target.value });
    draw();
  });

  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-stage],[data-act]');
    if (!b) return;
    if (b.dataset.act === 'add') {
      const n = (await db.all('fields')).length;
      if (n >= MAX_FIELDS) return;
      await db.put('fields', { id: uid(), name: '新的田', stage: 0, note: '', next: '', date: '', showCountdown: false, order: Date.now(), created: new Date().toISOString() });
      await draw();
      const inputs = box.querySelectorAll('.fc-name');
      const last = inputs[inputs.length - 1];
      last.focus(); last.select();
      return;
    }
    const card = b.closest('.fieldcard');
    if (!card) return;
    const id = card.dataset.id;
    const s = saver(id);
    await s.flush();
    const f = await db.get('fields', id);
    if (!f) return;
    if (b.dataset.stage) {
      await db.put('fields', { ...f, stage: Number(b.dataset.stage) });
      card.querySelectorAll('[data-stage]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      return;
    }
    if (b.dataset.act === 'done') {
      const text = (f.next || '').trim();
      if (!text) { toast('先写一个“下一次”'); card.querySelector('[data-k="next"]').focus(); return; }
      await db.put('harvest', { id: uid(), fieldId: id, text, date: today });
      await db.put('fields', { ...f, next: '' });
      toast('收进“收过的”了');
      draw();
    }
    if (b.dataset.act === 'swap') {
      await db.put('fields', { ...f, next: '' });
      const input = card.querySelector('[data-k="next"]');
      input.value = '';
      input.focus();
    }
    if (b.dataset.act === 'remove') {
      if (!confirm(`删掉「${f.name}」这块田？“收过的”记录会一起删掉，找不回来。`)) return;
      for (const h of (await db.all('harvest')).filter(h => h.fieldId === id)) await db.del('harvest', h.id);
      await db.del('fields', id);
      draw();
    }
  });

  await draw();
  return { flush: async () => { for (const s of savers.values()) await s.flush(); } };
}
