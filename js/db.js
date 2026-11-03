// 本机存储：IndexedDB，一样东西一个仓
const DB_NAME = 'rei-base';
const VERSION = 1;
const STORES = ['kv', 'entries', 'words', 'fields', 'harvest', 'papers', 'wall', 'tracks'];

let opening = null;
function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

async function run(store, mode, op) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = op(t.objectStore(store));
    let value;
    req.onsuccess = () => { value = req.result; };
    t.oncomplete = () => resolve(value);
    t.onerror = t.onabort = () => reject(t.error || req.error);
  });
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
function changed(store) { for (const f of listeners) f(store); }

export const ready = () => open().then(() => true);
export const all = store => run(store, 'readonly', s => s.getAll());
export const get = (store, id) => run(store, 'readonly', s => s.get(id));
export const put = (store, value) => run(store, 'readwrite', s => s.put(value)).then(() => { changed(store); return value; });
export const del = (store, id) => run(store, 'readwrite', s => s.delete(id)).then(() => changed(store));
export const clear = store => run(store, 'readwrite', s => s.clear()).then(() => changed(store));
// 记账类写入（比如“上次备份时间”），不触发自动备份
export const putQuiet = (store, value) => run(store, 'readwrite', s => s.put(value)).then(() => value);

// 一个事务里改多个仓：要么全成，要么全不成
export async function bulk(stores, fn) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(stores, 'readwrite');
    const map = {};
    for (const s of stores) map[s] = t.objectStore(s);
    try { fn(map); } catch (e) { t.abort(); reject(e); return; }
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error || new Error('aborted'));
  });
  changed('bulk');
}

export const DATA_STORES =['entries', 'words', 'fields', 'harvest', 'papers', 'wall'];

const DEFAULTS = {
  name: '',
  greet: { morning: 'おはよう', day: 'おかえり', night: 'おやすみ' },
  dayStart: 4,
  splash: true,
  music: true,
  seeded: false,
};

export async function getSettings() {
  const s = (await get('kv', 'settings')) || {};
  return { ...DEFAULTS, ...s, greet: { ...DEFAULTS.greet, ...(s.greet || {}) } };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch, id: 'settings' };
  await put('kv', next);
  window.dispatchEvent(new CustomEvent('settings', { detail: next }));
  return next;
}
