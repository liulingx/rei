// 休息：雨声、音乐、一张写完可以不留的纸
import * as db from '../db.js';
import * as rain from '../rain.js';
import * as player from '../player.js';
import { esc, html, uid, toast, fmtShort, dayKey, reducedMotion, debounce } from '../util.js';

const MAX_TRACK = 60 * 1024 * 1024;

export default async function xiuxi(root) {
  root.append(html(`
    <section class="page xiuxi">
      <header class="page-head">
        <div>
          <h1>休息</h1>
          <p class="page-sub">累了就来这儿。什么都不做也行。</p>
        </div>
      </header>
      <div class="xx-grid">
        <div class="xx-listen">
          <figure class="xx-moon"><img src="img/mark-600.jpg" width="600" height="600" alt="满月前她的剪影"></figure>
          <h2>听</h2>
          <div class="rain-row">
            <button class="btn" data-act="rain" aria-pressed="false">下雨</button>
            <label class="vol">雨<input type="range" min="0" max="1" step="0.01" data-vol="rain" aria-label="雨声音量"></label>
            <label class="vol">音乐<input type="range" min="0" max="1" step="0.01" data-vol="music" aria-label="音乐音量"></label>
          </div>
          <ul class="tracks"></ul>
          <label class="btn ghost">放几首自己的歌<input type="file" accept="audio/*" multiple class="vh" data-act="addtrack"></label>
          <p class="hint quiet">钢琴曲在右上角，整个地方都能听。这里放的是你自己的歌，只存在这台电脑里；放的时候钢琴曲会让开。</p>
        </div>
        <div class="xx-paper">
          <h2>一张纸</h2>
          <textarea class="paper" rows="12" placeholder="写什么都行。写完可以留下，也可以放掉。"></textarea>
          <div class="paper-act">
            <button class="btn" data-act="keep">留下</button>
            <button class="btn ghost" data-act="let">放掉</button>
          </div>
          <details class="papers"><summary></summary><ul></ul></details>
        </div>
      </div>
    </section>
  `));

  const rainBtn = root.querySelector('[data-act="rain"]');
  const tracksEl = root.querySelector('.tracks');
  const paper = root.querySelector('.paper');
  const papers = root.querySelector('.papers');
  // 纸上没决定留还是放的字先记着，换页回来还在
  const draft = await db.get('kv', 'paperDraft');
  if (draft && draft.text) paper.value = draft.text;
  const saveDraft = debounce(() => db.putQuiet('kv', { id: 'paperDraft', text: paper.value }), 500);
  const clearDraft = () => { saveDraft.flush(); return db.putQuiet('kv', { id: 'paperDraft', text: '' }); };
  paper.addEventListener('input', saveDraft);

  root.querySelector('[data-vol="rain"]').value = rain.getVolume();
  root.querySelector('[data-vol="music"]').value = player.getVolume();

  const syncRain = on => { rainBtn.setAttribute('aria-pressed', String(on)); rainBtn.textContent = on ? '雨停' : '下雨'; };
  syncRain(rain.isOn());
  const offRain = rain.onRain(syncRain);

  let queue = [];
  async function drawTracks() {
    queue = await player.loadQueue();
    const st = player.state();
    tracksEl.innerHTML = queue.length
      ? queue.map((t, i) => {
        const cur = st.track && st.track.id === t.id;
        return `<li class="track${cur ? ' cur' : ''}">
          <button class="track-play" data-play="${i}" aria-label="${cur && st.playing ? '暂停' : '放'}：${esc(t.name)}">${cur && st.playing ? '❚❚' : '▶'}</button>
          <span class="track-name">${esc(t.name)}</span>
          ${t.builtin ? (t.credit ? `<span class="track-credit quiet">${esc(t.credit)}</span>` : '') : `<button class="link-btn" data-rmtrack="${esc(t.id)}">拿走</button>`}
        </li>`;
      }).join('')
      : '<li class="quiet empty">还没有歌。可以放几首自己喜欢的进来。</li>';
  }
  const offPlayer = player.onPlayer(drawTracks);

  async function drawPapers() {
    const all = (await db.all('papers')).sort((a, b) => b.at.localeCompare(a.at));
    papers.hidden = !all.length;
    papers.querySelector('summary').textContent = `留下的纸（${all.length}）`;
    papers.querySelector('ul').innerHTML = all.map(p => `<li><div class="paper-meta quiet">${fmtShort(dayKey(new Date(p.at), 0))}<button class="link-btn" data-rmpaper="${esc(p.id)}">扔掉</button></div><p class="paper-text">${esc(p.text)}</p></li>`).join('');
  }

  root.addEventListener('input', e => {
    if (e.target.dataset.vol === 'rain') rain.setVolume(Number(e.target.value));
    if (e.target.dataset.vol === 'music') player.setVolume(Number(e.target.value));
  });

  root.addEventListener('change', async e => {
    if (e.target.dataset.act !== 'addtrack') return;
    const files = [...e.target.files];
    e.target.value = '';
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('audio/')) continue;
      if (f.size > MAX_TRACK) { toast(`「${f.name}」太大了（超过 60 MB）`); continue; }
      await db.put('tracks', { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), blob: f, added: new Date().toISOString() });
      n++;
    }
    if (n) { toast(`放进来 ${n} 首`); drawTracks(); }
  });

  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'rain') { await rain.toggle(); return; }
    if (b.dataset.play !== undefined) {
      const i = Number(b.dataset.play);
      const st = player.state();
      if (st.track && queue[i] && st.track.id === queue[i].id) player.toggle(); else player.play(queue, i);
      return;
    }
    if (b.dataset.rmtrack) {
      if (!confirm('把这首歌从这里拿走？')) return;
      player.forget(b.dataset.rmtrack);
      await db.del('tracks', b.dataset.rmtrack);
      drawTracks();
      return;
    }
    if (b.dataset.act === 'keep') {
      const text = paper.value.trim();
      if (!text) { toast('纸还是空的'); return; }
      await db.put('papers', { id: uid(), text, at: new Date().toISOString() });
      paper.value = '';
      await clearDraft();
      toast('留下了');
      drawPapers();
      return;
    }
    if (b.dataset.act === 'let') {
      if (!paper.value.trim()) return;
      await clearDraft();
      if (reducedMotion()) { paper.value = ''; return; }
      paper.classList.add('letting');
      setTimeout(() => { paper.value = ''; paper.classList.remove('letting'); }, 900);
      return;
    }
    if (b.dataset.rmpaper) {
      if (!confirm('扔掉这张纸？')) return;
      await db.del('papers', b.dataset.rmpaper);
      drawPapers();
    }
  });

  await Promise.all([drawTracks(), drawPapers()]);
  return { flush: () => saveDraft.flush(), dispose: () => { offRain(); offPlayer(); } };
}
