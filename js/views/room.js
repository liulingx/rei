// 房间：首页。窗、月、四扇门、墙
import * as db from '../db.js';
import { esc, html, dayKey, viewUrl, uid, toast, greetingFor } from '../util.js';
import { moonInfo, moonSvg } from '../moon.js';
import { STAGES } from './tian.js';
import { folderState } from '../backup.js';
import { roomLine } from '../rei.js';

const MAX_IMAGE = 20 * 1024 * 1024;

export default async function room(root, { settings }) {
  const today = dayKey(new Date(), settings.dayStart);
  const [entry, words, fields, entries] = await Promise.all([
    db.get('entries', today), db.all('words'), db.all('fields'), db.all('entries'),
  ]);
  const m = moonInfo(new Date());
  const jp = words.filter(w => w.kind === 'jp').length;
  const own = words.length - jp;
  const n = entry ? entries.map(e => e.id).sort().indexOf(today) + 1 : 0;

  const huaSub = entry && entry.title
    ? `第 ${n} 话 · 「${esc(entry.title)}」`
    : entry ? `第 ${n} 话 · 还没起标题` : '给今天起个标题';
  const cidianSub = words.length ? `${jp} 个日语词 · ${own} 个自己的词` : '一个词也还没有';
  const tianSub = fields.length
    ? fields.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(f => `${esc(f.name)} · ${STAGES[f.stage] || STAGES[0]}`).join('　')
    : '田还没开';

  root.append(html(`
    <section class="room-hero">
      <img class="room-img" src="img/room.jpg" width="1536" height="1024" alt="月光照进空房间，她坐在窗边，窗外是映着月亮的梯田">
      <div class="room-text">
        <p class="greet" lang="ja">${esc(greetingFor(settings))}</p>
        ${roomLine(new Date(), today) ? `<p class="rei-line" lang="ja">「${esc(roomLine(new Date(), today))}」</p>` : ''}
        <p class="moon-line">${moonSvg(m.phase, 18)}<span lang="ja">今夜の月</span>${m.name ? `<span class="sep">·</span><span lang="ja">${m.name}</span>` : ''}<span class="sep">·</span><span>月齢 ${m.age.toFixed(1)}</span></p>
      </div>
    </section>
    <nav class="doors" aria-label="四个地方">
      <a class="door" href="#/hua"><span class="door-jp" lang="ja">今日の話</span><span class="door-name">今天这一话</span><span class="door-sub">${huaSub}</span></a>
      <a class="door" href="#/cidian"><span class="door-jp" lang="ja">ことば</span><span class="door-name">词典</span><span class="door-sub">${cidianSub}</span></a>
      <a class="door" href="#/tian"><span class="door-jp" lang="ja">田んぼ</span><span class="door-name">田</span><span class="door-sub">${tianSub}</span></a>
      <a class="door" href="#/xiuxi"><span class="door-jp" lang="ja">ひとやすみ</span><span class="door-name">休息</span><span class="door-sub">雨声、音乐、一张纸</span></a>
    </nav>
    <section class="wall" aria-labelledby="wall-h">
      <div class="wall-head">
        <h2 id="wall-h">墙</h2>
        <label class="btn ghost">挂一张图<input type="file" accept="image/*" multiple class="vh" data-act="add"></label>
      </div>
      <div class="wall-grid"></div>
    </section>
  `));

  const grid = root.querySelector('.wall-grid');

  // 自动备份的文件夹要重新点同意时，在门下面淡淡提一句
  const fs = await folderState().catch(() => ({ bound: false }));
  if (fs.bound && fs.perm !== 'granted') {
    root.querySelector('.doors').after(html(`<p class="backup-note quiet">备份文件夹「${esc(fs.name)}」要再点一下同意，才能继续自动存。<a href="#/men">去门牌</a></p>`));
  }

  async function drawWall() {
    const items = (await db.all('wall')).sort((a, b) => b.added.localeCompare(a.added));
    grid.replaceChildren();
    if (!items.length) {
      grid.append(html(`<p class="quiet wall-empty">这面墙还空着。可以挂几张你喜欢的图，它们只存在这台电脑里，不会传到任何地方。</p>`));
      return;
    }
    for (const it of items) {
      const fig = html(`<figure class="pin"><button class="pin-img" data-act="view" data-id="${esc(it.id)}" aria-label="看大图"><img alt="${esc(it.name || '墙上的图')}" loading="lazy"></button><button class="pin-off" data-act="off" data-id="${esc(it.id)}">取下</button></figure>`);
      fig.querySelector('img').src = viewUrl(it.blob);
      grid.append(fig);
    }
  }

  root.addEventListener('change', async e => {
    if (e.target.dataset.act !== 'add') return;
    const files = [...e.target.files];
    e.target.value = '';
    let added = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_IMAGE) { toast(`「${f.name}」太大了，挂不上（超过 20 MB）`); continue; }
      await db.put('wall', { id: uid(), name: f.name, blob: f, added: new Date().toISOString() });
      added++;
    }
    if (added) { toast(`挂上了 ${added} 张`); drawWall(); }
  });

  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'off') {
      if (!confirm('把这张图从墙上取下来？')) return;
      await db.del('wall', b.dataset.id);
      drawWall();
    }
    if (b.dataset.act === 'view') {
      const img = b.querySelector('img');
      const box = html(`<div class="lightbox" role="dialog" aria-modal="true" aria-label="大图"><img alt=""><p class="lightbox-hint">点一下或按 Esc 回去</p></div>`).firstElementChild;
      box.querySelector('img').src = img.src;
      box.querySelector('img').alt = img.alt;
      document.body.append(box);
      const close = () => { box.remove(); window.removeEventListener('keydown', onKey); b.focus(); };
      const onKey = ev => { if (ev.key === 'Escape') close(); };
      box.addEventListener('click', close);
      window.addEventListener('keydown', onKey);
      box.tabIndex = -1;
      box.focus();
    }
  });

  await drawWall();
}
