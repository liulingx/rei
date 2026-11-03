// 词典：日语生词本 + 自己的词。翻卡复习，不计分
import * as db from '../db.js';
import { esc, html, uid, toast, dayKey, fmtShort } from '../util.js';
import { pick } from '../rei.js';

let lastTab = 'jp';

export default async function cidian(root) {
  let tab = lastTab;
  let editing = null;

  root.append(html(`
    <section class="page cidian">
      <header class="page-head">
        <div>
          <h1>词典</h1>
          <p class="page-sub" lang="ja">ことばを、ひとつずつ。</p>
        </div>
      </header>
      <div class="tabs" role="tablist" aria-label="两本词典">
        <button role="tab" data-tab="jp">日本語</button>
        <button role="tab" data-tab="own">自己的词</button>
      </div>
      <p class="tab-note"></p>
      <div class="cd-tools">
        <input type="search" class="search" aria-label="找词">
        <button class="btn" data-act="add">加一个词</button>
        <button class="btn ghost" data-act="review">翻卡</button>
      </div>
      <form class="word-form" hidden></form>
      <ul class="word-list"></ul>
    </section>
  `));

  const form = root.querySelector('.word-form');
  const listEl = root.querySelector('.word-list');
  const search = root.querySelector('.search');
  const note = root.querySelector('.tab-note');
  const reviewBtn = root.querySelector('[data-act="review"]');

  async function words() {
    return (await db.all('words')).filter(w => w.kind === tab).sort((a, b) => b.added.localeCompare(a.added));
  }

  function setTab(next) {
    tab = lastTab = next;
    root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    note.textContent = tab === 'jp'
      ? '备考 N1 遇到的词。例句自己造一句，最好记。'
      : '像“累”“喜欢”“工作”这样的词，写你自己体会到的意思。意思变了就改，以前的会留着。';
    search.placeholder = tab === 'jp' ? '找词、读音或意思' : '找词';
    reviewBtn.hidden = tab !== 'jp';
    closeForm();
    draw();
  }

  async function draw() {
    const q = search.value.trim();
    const all = await words();
    const shown = q ? all.filter(w => [w.word, w.reading, w.meaning, w.example].some(x => (x || '').includes(q))) : all;
    if (!all.length) {
      listEl.innerHTML = `<li class="quiet empty">${tab === 'jp' ? '还没有词。遇到一个，就加一个。' : '还没有自己的词。'}</li>`;
      return;
    }
    if (!shown.length) { listEl.innerHTML = '<li class="quiet empty">没找到。</li>'; return; }
    listEl.innerHTML = `<li class="count quiet">${q ? `找到 ${shown.length} 个` : `一共 ${all.length} 个`}</li>` + shown.map(w => tab === 'jp' ? jpItem(w) : ownItem(w)).join('');
  }

  function jpItem(w) {
    return `<li class="word">
      <div class="w-head"><span class="w-word" lang="ja">${esc(w.word)}</span>${w.reading ? `<span class="w-read" lang="ja">${esc(w.reading)}</span>` : ''}</div>
      ${w.meaning ? `<p class="w-mean">${esc(w.meaning)}</p>` : ''}
      ${w.example ? `<p class="w-ex" lang="ja">${esc(w.example)}</p>` : ''}
      ${w.where ? `<p class="w-where">在${esc(w.where)}遇到</p>` : ''}
      <div class="w-act"><button class="link-btn" data-act="edit" data-id="${esc(w.id)}">改</button><button class="link-btn" data-act="del" data-id="${esc(w.id)}">删</button></div>
    </li>`;
  }

  function ownItem(w) {
    const hist = (w.history || []).slice().reverse();
    return `<li class="word own">
      <div class="w-head"><span class="w-word">${esc(w.word)}</span><span class="w-read">${fmtShort(dayKey(new Date(w.updated), 0))}</span></div>
      <p class="w-mean">${esc(w.meaning) || '<span class="quiet">还没写意思</span>'}</p>
      ${hist.length ? `<details class="w-hist"><summary>以前的意思（${hist.length}）</summary><ul>${hist.map(h => `<li><span class="quiet">${fmtShort(h.date)}</span> ${esc(h.text)}</li>`).join('')}</ul></details>` : ''}
      <div class="w-act"><button class="link-btn" data-act="edit" data-id="${esc(w.id)}">改</button><button class="link-btn" data-act="del" data-id="${esc(w.id)}">删</button></div>
    </li>`;
  }

  function openForm(w) {
    editing = w || null;
    const v = k => esc(w?.[k] || '');
    form.innerHTML = tab === 'jp' ? `
      <div class="form-grid">
        <label>词<input name="word" lang="ja" required autocomplete="off" value="${v('word')}"></label>
        <label>读音<input name="reading" lang="ja" autocomplete="off" placeholder="かな" value="${v('reading')}"></label>
        <label class="wide">意思<input name="meaning" autocomplete="off" value="${v('meaning')}"></label>
        <label class="wide">例句<textarea name="example" lang="ja" rows="2" placeholder="自己造一句">${v('example')}</textarea></label>
        <label class="wide">在哪遇到的<input name="where" autocomplete="off" placeholder="真题、小说、歌词……" value="${v('where')}"></label>
      </div>
      <div class="form-act"><button class="btn" type="submit">${w ? '改好了' : '收下'}</button><button class="link-btn" type="button" data-act="cancel">算了</button></div>`
      : `
      <div class="form-grid">
        <label class="wide">词<input name="word" required autocomplete="off" value="${v('word')}"></label>
        <label class="wide">我体会到的意思<textarea name="meaning" rows="3">${v('meaning')}</textarea></label>
      </div>
      <div class="form-act"><button class="btn" type="submit">${w ? '改好了' : '收下'}</button><button class="link-btn" type="button" data-act="cancel">算了</button></div>`;
    form.hidden = false;
    form.querySelector('[name="word"]').focus();
  }

  function closeForm() { form.hidden = true; form.innerHTML = ''; editing = null; }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const val = k => String(fd.get(k) || '').trim();
    const word = val('word');
    if (!word) return;
    const now = new Date().toISOString();
    let rec;
    if (tab === 'jp') {
      rec = { ...(editing || {}), id: editing?.id || uid(), kind: 'jp', word, reading: val('reading'), meaning: val('meaning'), example: val('example'), where: val('where'), added: editing?.added || now, updated: now };
    } else {
      const meaning = val('meaning');
      const history = [...(editing?.history || [])];
      if (editing && editing.meaning && editing.meaning !== meaning) history.push({ text: editing.meaning, date: dayKey(new Date(editing.updated), 0) });
      rec = { ...(editing || {}), id: editing?.id || uid(), kind: 'own', word, meaning, history, added: editing?.added || now, updated: now };
    }
    await db.put('words', rec);
    toast(editing ? '改好了' : `收下了「${word}」`, editing ? '' : pick('word'));
    closeForm();
    draw();
  });

  root.addEventListener('click', async e => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openForm(null);
    if (act === 'cancel') closeForm();
    if (act === 'edit') { openForm(await db.get('words', b.dataset.id)); form.scrollIntoView({ block: 'nearest' }); }
    if (act === 'del') {
      const w = await db.get('words', b.dataset.id);
      if (w && confirm(`删掉「${w.word}」？`)) { await db.del('words', w.id); draw(); }
    }
    if (act === 'review') review(await words());
  });

  search.addEventListener('input', draw);
  setTab(tab);
}

function review(all) {
  if (!all.length) { toast('还没有词可以翻'); return; }
  const deck = all.slice();
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  let i = 0, flipped = false;
  const box = html(`<div class="review" role="dialog" aria-modal="true" aria-label="翻卡">
    <div class="rv-card" tabindex="0"></div>
    <div class="rv-ctl"><span class="rv-pos quiet"></span><button class="btn ghost" data-rv="flip">翻过来</button><button class="btn" data-rv="next">下一张</button><button class="link-btn" data-rv="close">回去</button></div>
    <p class="rv-hint quiet">空格翻面，→ 下一张，Esc 回去。不记对错。</p>
  </div>`).firstElementChild;
  const card = box.querySelector('.rv-card');
  const pos = box.querySelector('.rv-pos');
  const prevFocus = document.activeElement;
  const draw = () => {
    const w = deck[i];
    card.innerHTML = flipped
      ? `<div class="rv-back">${w.reading ? `<p class="rv-read" lang="ja">${esc(w.reading)}</p>` : ''}<p class="rv-word small" lang="ja">${esc(w.word)}</p>${w.meaning ? `<p class="rv-mean">${esc(w.meaning)}</p>` : ''}${w.example ? `<p class="rv-ex" lang="ja">${esc(w.example)}</p>` : ''}</div>`
      : `<p class="rv-word" lang="ja">${esc(w.word)}</p>`;
    pos.textContent = `${i + 1} / ${deck.length}`;
  };
  const flip = () => { flipped = !flipped; draw(); };
  const next = () => { if (i < deck.length - 1) { i++; flipped = false; draw(); } else close(); };
  const close = () => { box.remove(); window.removeEventListener('keydown', onKey); prevFocus && prevFocus.focus(); };
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if ((e.key === ' ' || e.code === 'Space') && e.target.tagName !== 'BUTTON') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') next();
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-rv]');
    if (e.target.closest('.rv-card')) flip();
    if (!b) return;
    if (b.dataset.rv === 'flip') flip();
    if (b.dataset.rv === 'next') next();
    if (b.dataset.rv === 'close') close();
  });
  window.addEventListener('keydown', onKey);
  document.body.append(box);
  draw();
  card.focus();
}
