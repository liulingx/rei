// 入口：路由、顶栏、开场题卡、自动备份
import * as db from './db.js';
import * as backup from './backup.js';
import * as player from './player.js';
import * as rain from './rain.js';
import { esc, debounce, revokeViewUrls, sessionFlag, reducedMotion, html, greetingFor } from './util.js';
import { BUILTIN } from './tracks.js';
import * as rei from './rei.js';
import room from './views/room.js';
import hua from './views/hua.js';
import cidian from './views/cidian.js';
import tian from './views/tian.js';
import xiuxi from './views/xiuxi.js';
import men from './views/men.js';

const ROUTES = { '': room, hua, cidian, tian, xiuxi, men };
const main = document.getElementById('main');
let current = null; // 当前页面返回的 { flush, dispose }
let rendering = Promise.resolve();

function setName(settings) {
  const name = settings.name.trim() || '名前はまだない';
  const el = document.getElementById('brand-name');
  el.textContent = name;
  el.lang = settings.name.trim() ? '' : 'ja';
  document.title = name;
}

async function render() {
  const [seg = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = ROUTES[seg] || room;
  if (current) {
    try { await current.flush?.(); current.dispose?.(); } catch (e) { console.error(e); }
    current = null;
  }
  revokeViewUrls();
  // 每页一个新容器：旧页面挂的事件随容器一起扔掉
  const page = document.createElement('div');
  page.className = 'view';
  main.replaceChildren(page);
  const route = ROUTES[seg] ? (seg || 'room') : 'room';
  document.body.dataset.route = route;
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const settings = await db.getSettings();
  try {
    current = (await view(page, { params, settings })) || null;
  } catch (e) {
    console.error(e);
    page.replaceChildren(html(`<section class="page"><p class="quiet">这一页没打开。刷新试试；要是一直这样，告诉做网站的人。</p></section>`));
  }
  window.scrollTo(0, 0);
  if (!main.contains(document.activeElement)) main.focus({ preventScroll: true });
}

// 关页、切走时，先把各页还没写进去的字存好
function flushNow() {
  try { current?.flush?.(); } catch (e) { console.error(e); }
}

function queueRender() {
  rendering = rendering.then(render, render);
}

// 顶栏右侧：正在放的歌、雨声
function renderNow() {
  const el = document.getElementById('now');
  const p = player.state();
  const parts = [];
  if (rain.isOn()) parts.push(`<button class="now-btn now-rain" data-now="rain" aria-label="停下雨声">雨</button>`);
  if (p.track) {
    parts.push(`<span class="now-item"><button class="now-btn" data-now="toggle" aria-label="${p.playing ? '暂停' : '继续放'}">${p.playing ? '❚❚' : '▶'}</button><span class="now-name" lang="ja">${esc(p.track.name)}</span><button class="now-btn" data-now="next" aria-label="下一首">›</button></span>`);
  } else if (BUILTIN.length) {
    parts.push(`<button class="now-btn now-music" data-now="ambient" aria-label="放钢琴曲">♪</button>`);
  }
  el.innerHTML = parts.join('');
}

function splash(settings) {
  if (!settings.splash || sessionFlag('rei-splash')) return;
  sessionFlag('rei-splash', true);
  const words = greetingFor(settings);
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="splash-card"><span class="splash-line" lang="ja">${esc(words)}</span></div>`;
  document.body.append(el);
  const close = () => { el.remove(); window.removeEventListener('keydown', close); };
  el.addEventListener('click', close);
  window.addEventListener('keydown', close);
  setTimeout(close, reducedMotion() ? 700 : 1500);
}

async function start() {
  try {
    await db.ready();
  } catch {
    main.replaceChildren(html(`<section class="page"><h1>打不开</h1><p class="quiet">这个浏览器不让网页在本机存东西。换成 Chrome 或 Edge 的普通窗口再打开。</p></section>`));
    return;
  }
  const settings = await db.getSettings();
  setName(settings);
  rei.setEnabled(settings.rei);
  splash(settings);
  window.addEventListener('settings', e => { setName(e.detail); rei.setEnabled(e.detail.rei); });
  window.addEventListener('hashchange', queueRender);
  queueRender();

  player.onPlayer(renderNow);
  rain.onRain(renderNow);
  document.getElementById('now').addEventListener('click', e => {
    const b = e.target.closest('[data-now]');
    if (!b) return;
    if (b.dataset.now === 'toggle') player.toggle();
    if (b.dataset.now === 'next') player.next();
    if (b.dataset.now === 'rain') rain.stop();
    if (b.dataset.now === 'ambient' && !player.state().track) player.ambient();
  });
  renderNow();

  // 钢琴曲是整个地方的背景：浏览器不许自动出声，所以在进门后第一次点或按键时开始
  if (settings.music && BUILTIN.length) {
    const kick = () => {
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('keydown', kick, true);
      if (!player.state().track) player.ambient();
    };
    window.addEventListener('pointerdown', kick, true);
    window.addEventListener('keydown', kick, true);
  }

  // 绑过文件夹的话，改动后过几秒自动存一份
  const autoSave = debounce(() => backup.writeFolderBackup().catch(e => console.warn('自动备份没成功', e)), 5000);
  db.onChange(autoSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushNow(); autoSave.flush(); }
  });
  window.addEventListener('pagehide', () => { flushNow(); autoSave.flush(); });

  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* 不支持就算了 */ }
}

start();
