// 门牌：站名、问候、备份、说明
import * as db from '../db.js';
import * as backup from '../backup.js';
import * as player from '../player.js';
import { esc, html, toast, debouncePatch, fmtTime, fmtShort, dayKey } from '../util.js';

const isSafari = () => /Safari\//.test(navigator.userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
import { BUILTIN } from '../tracks.js';

export default async function men(root, { settings }) {
  root.append(html(`
    <section class="page men">
      <header class="page-head">
        <div>
          <h1>门牌</h1>
          <p class="page-sub">这里的名字、问候和规矩，都由你来定。</p>
        </div>
      </header>

      <section class="men-block">
        <h2>名字</h2>
        <label class="men-row">这个地方叫<input data-set="name" maxlength="24" placeholder="名前はまだない" value="${esc(settings.name)}"></label>
        <p class="hint quiet">还没起名字的时候，门上写的是“名前はまだない”（名字还没有）。</p>
      </section>

      <section class="men-block">
        <h2>进门时的问候</h2>
        <label class="men-row">早上 5–11 点<input data-greet="morning" maxlength="24" value="${esc(settings.greet.morning)}"></label>
        <label class="men-row">白天 11–22 点<input data-greet="day" maxlength="24" value="${esc(settings.greet.day)}"></label>
        <label class="men-row">夜里<input data-greet="night" maxlength="24" value="${esc(settings.greet.night)}"></label>
        <label class="chk"><input type="checkbox" data-set="splash" ${settings.splash ? 'checked' : ''}> 每次打开先停一下标题卡</label>
        <label class="chk"><input type="checkbox" data-set="rei" ${settings.rei ? 'checked' : ''}> 让她偶尔说一句话（日语）</label>
        <label class="chk"><input type="checkbox" data-set="music" ${settings.music ? 'checked' : ''}> 进门后放钢琴曲（第一次点页面时开始，右上角随时能停）</label>
        <label class="men-row">一天从几点开始
          <select data-set="dayStart">
            <option value="0" ${settings.dayStart === 0 ? 'selected' : ''}>零点</option>
            <option value="4" ${settings.dayStart === 4 ? 'selected' : ''}>凌晨 4 点（熬夜写的算前一天）</option>
          </select>
        </label>
      </section>

      <section class="men-block">
        <h2>备份</h2>
        <p>这里写的东西只存在<strong>这台电脑的这个浏览器</strong>里，网页不会把它上传到任何地方。换电脑、重装系统、清浏览器数据之前，先导出一份。自己放进来的歌比较大，不在备份里。</p>
        ${isSafari() ? '<p class="hint quiet">现在用的是 Safari。Safari 在很久没打开某个网页时，可能会清掉它存的东西。用 Chrome 或 Edge 更稳；继续用 Safari 的话，隔一阵导出一次。</p>' : ''}
        <p class="quiet last-backup"></p>
        <div class="men-act">
          <button class="btn" data-act="export">导出一份备份</button>
          <label class="btn ghost">从备份导入<input type="file" accept="application/json,.json" class="vh" data-act="import"></label>
        </div>
        <div class="import-choice" hidden>
          <p class="import-msg"></p>
          <div class="men-act">
            <button class="btn" data-act="merge">合并进来（两边都有的，留较新的）</button>
            <button class="btn ghost" data-act="replace">清空现在的，换成备份</button>
            <button class="link-btn" data-act="cancel-import">算了</button>
          </div>
        </div>
        <div class="folder"></div>
      </section>

      <section class="men-block">
        <h2>说明</h2>
        <ul class="about">
          <li>这是一个非官方的同人网站，和 khara、《新世纪福音战士》官方都没有关系。</li>
          <li>三张插画是 AI 画的非官方同人图，不是官方作品。</li>
          <li>雨声是网页现场合成的。${BUILTIN.length ? '背景音乐：' + BUILTIN.map(t => esc(t.credit || t.name)).join('；') + '。' : ''}</li>
          <li>没有任何统计、广告或追踪，网页不会把你的东西发给任何地方。</li>
        </ul>
      </section>

      <section class="men-block quiet-zone">
        <h2>全部清空</h2>
        <p class="quiet">把这里写过、存过的东西全部删掉，删了找不回来。</p>
        <button class="link-btn" data-act="wipe">我想全部清空</button>
      </section>
    </section>
  `));

  const lastEl = root.querySelector('.last-backup');
  const folderEl = root.querySelector('.folder');
  const choice = root.querySelector('.import-choice');
  let pending = null;

  async function drawLast() {
    const last = await backup.lastBackup();
    lastEl.textContent = last ? `上次备份：${fmtShort(dayKey(new Date(last.at), 0))} ${fmtTime(last.at)}（${last.kind === 'folder' ? '自动存到文件夹' : '导出'}）` : '还没备份过。';
  }

  async function drawFolder() {
    if (!backup.folderSupported()) {
      folderEl.innerHTML = '<p class="hint quiet">用 Chrome 或 Edge 打开时，可以选一个文件夹，之后每次改动都会自动在里面存一份当天的备份。现在这个浏览器不支持，就隔一阵手动导出一次吧。</p>';
      return;
    }
    const st = await backup.folderState();
    if (!st.bound) {
      folderEl.innerHTML = `<h3>自动备份到文件夹</h3><p class="hint quiet">选一个文件夹（最好是会同步到网盘的那种），之后每次改动，几秒后会在里面存一份当天的备份，同一天只保留一份。</p><button class="btn ghost" data-act="bind">选一个文件夹</button>`;
    } else if (st.perm !== 'granted') {
      folderEl.innerHTML = `<h3>自动备份到文件夹</h3><p class="hint quiet">之前选过「${esc(st.name)}」。浏览器重开后要再点一下同意，才能继续往里存。</p><div class="men-act"><button class="btn ghost" data-act="regrant">继续往「${esc(st.name)}」里存</button><button class="link-btn" data-act="unbind">不用这个文件夹了</button></div>`;
    } else {
      folderEl.innerHTML = `<h3>自动备份到文件夹</h3><p class="hint quiet">正在往「${esc(st.name)}」里存。</p><div class="men-act"><button class="btn ghost" data-act="backup-now">现在存一次</button><button class="link-btn" data-act="unbind">不用这个文件夹了</button></div>`;
    }
  }

  const saveSettings = debouncePatch(async patch => { await db.saveSettings(patch); toast('记下了'); }, 500);
  let greet = { ...settings.greet };

  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.set === 'name') saveSettings({ name: t.value });
    if (t.dataset.greet) {
      greet = { ...greet, [t.dataset.greet]: t.value.trim() || settings.greet[t.dataset.greet] };
      saveSettings({ greet });
    }
  });

  root.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.set === 'splash') { await db.saveSettings({ splash: t.checked }); toast('记下了'); }
    if (t.dataset.set === 'rei') { await db.saveSettings({ rei: t.checked }); toast('记下了'); }
    if (t.dataset.set === 'music') { await db.saveSettings({ music: t.checked }); toast(t.checked ? '下次进门会放' : '下次进门不放了'); }
    if (t.dataset.set === 'dayStart') { await db.saveSettings({ dayStart: Number(t.value) }); toast('记下了'); }
    if (t.dataset.act === 'import') {
      const f = t.files[0];
      t.value = '';
      if (!f) return;
      try {
        pending = backup.parseBackup(await f.text());
        const n = db.DATA_STORES.reduce((a, s) => a + (pending[s] || []).length, 0);
        choice.querySelector('.import-msg').textContent = `这份备份是 ${fmtShort(dayKey(new Date(pending.exported), 0))} 导出的，里面有 ${n} 条东西。要怎么放进来？`;
        choice.hidden = false;
      } catch (err) {
        toast(err.message);
      }
    }
  });

  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'export') { await backup.downloadBackup(); toast('导出好了，看看下载文件夹'); drawLast(); }
      if (act === 'merge' || act === 'replace') {
        if (!pending) return;
        if (act === 'replace' && !confirm('现在这里的东西会先清空，再换成备份里的。换之前会先自动导出一份现在的，以防选错。确定吗？')) return;
        if (act === 'replace') await backup.downloadBackup('导入前');
        await backup.restore(pending, act);
        window.dispatchEvent(new CustomEvent('settings', { detail: await db.getSettings() }));
        pending = null;
        choice.hidden = true;
        toast('放进来了');
        location.hash = '#/';
      }
      if (act === 'cancel-import') { pending = null; choice.hidden = true; }
      if (act === 'bind') { const ok = await backup.bindFolder(); toast(ok ? '选好了，已经存了一份' : '选好了'); drawFolder(); drawLast(); }
      if (act === 'regrant') { await backup.regrant(); drawFolder(); drawLast(); }
      if (act === 'backup-now') { const ok = await backup.writeFolderBackup(); toast(ok ? '存好了' : '没存上，再点一次试试'); drawLast(); }
      if (act === 'unbind') { await backup.unbindFolder(); drawFolder(); }
      if (act === 'wipe') {
        const word = prompt('要全部清空的话，输入“清空”两个字。');
        if (word !== '清空') return;
        player.stop();
        for (const s of [...db.DATA_STORES, 'tracks']) await db.clear(s);
        await db.del('kv', 'settings');
        await db.del('kv', 'paperDraft');
        toast('清空了');
        location.hash = '#/';
        location.reload();
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // 选文件夹时点了取消
      console.error(err);
      toast('没成功：' + (err.message || err));
    }
  });

  await Promise.all([drawLast(), drawFolder()]);
  return { flush: () => saveSettings.flush() };
}
