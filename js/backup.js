// 导出、导入、自动存到本机文件夹（Chrome / Edge 才有）
import * as db from './db.js';
import { dayKey } from './util.js';

const APP = 'rei-base';

async function blobToB64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}

export async function snapshot() {
  const out = { app: APP, version: 1, exported: new Date().toISOString() };
  out.settings = (await db.get('kv', 'settings')) || null;
  for (const st of db.DATA_STORES) {
    let rows = await db.all(st);
    if (st === 'wall') {
      rows = await Promise.all(rows.map(async ({ blob, ...rest }) => ({ ...rest, type: blob.type, data: await blobToB64(blob) })));
    }
    out[st] = rows;
  }
  return out;
}

const fileName = (tag = '备份') => `秘密基地-${tag}-${dayKey(new Date(), 0)}.json`;

async function markBackup(kind) {
  await db.putQuiet('kv', { id: 'lastBackup', at: new Date().toISOString(), kind });
}

export async function lastBackup() {
  return db.get('kv', 'lastBackup');
}

export async function downloadBackup(tag) {
  const snap = await snapshot();
  const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(tag);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  await markBackup('download');
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('这个文件读不出来，不是备份文件。'); }
  if (!obj || obj.app !== APP) throw new Error('这不是这个地方导出的备份文件。');
  return obj;
}

const str = v => (typeof v === 'string' ? v : '');
const isDayKey = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

// 备份里缺字段的行补上默认值，免得页面读到 undefined 打不开
function normalize(st, row, stamp) {
  const r = { ...row };
  if (st === 'entries') {
    if (!isDayKey(r.id)) return null;
    Object.assign(r, { title: str(r.title), body: str(r.body), created: str(r.created) || stamp, updated: str(r.updated) || stamp });
  } else if (st === 'words') {
    if (!str(r.word)) return null;
    Object.assign(r, { kind: r.kind === 'own' ? 'own' : 'jp', added: str(r.added) || stamp, updated: str(r.updated) || stamp, history: Array.isArray(r.history) ? r.history : [] });
  } else if (st === 'fields') {
    Object.assign(r, { name: str(r.name) || '田', stage: [0, 1, 2].includes(r.stage) ? r.stage : 0, note: str(r.note), next: str(r.next), date: isDayKey(r.date) ? r.date : '', showCountdown: !!r.showCountdown, created: str(r.created) || stamp });
  } else if (st === 'harvest') {
    if (!str(r.text)) return null;
    Object.assign(r, { fieldId: str(r.fieldId), date: isDayKey(r.date) ? r.date : stamp.slice(0, 10) });
  } else if (st === 'papers') {
    if (!str(r.text)) return null;
    r.at = str(r.at) || stamp;
  } else if (st === 'wall') {
    if (!r.data) return null;
    const { data, type, ...rest } = r;
    return { ...rest, name: str(rest.name), added: str(rest.added) || stamp, blob: b64ToBlob(data, type || 'image/jpeg') };
  }
  return r;
}

const stampOf = r => r.updated || r.added || r.at || r.created || r.date || '';

// mode: 'merge' 两边都有的留较新的；'replace' 清空后换成备份。先全部解码校验，再在一个事务里写入
export async function restore(obj, mode) {
  const stamp = str(obj.exported) || new Date().toISOString();
  const rows = {};
  for (const st of db.DATA_STORES) {
    rows[st] = (Array.isArray(obj[st]) ? obj[st] : [])
      .filter(r => r && typeof r.id === 'string')
      .map(r => normalize(st, r, stamp))
      .filter(Boolean);
  }

  if (mode === 'merge') {
    const fieldMap = new Map();
    const localFields = await db.all('fields');
    for (const st of db.DATA_STORES) {
      const local = new Map((st === 'fields' ? localFields : await db.all(st)).map(r => [r.id, r]));
      rows[st] = rows[st].filter(r => {
        if (st === 'fields' && !local.has(r.id)) {
          const same = localFields.find(f => f.name === r.name);
          if (same) { fieldMap.set(r.id, same.id); return false; }
        }
        const old = local.get(r.id);
        return !old || stampOf(r) >= stampOf(old);
      });
      if (st === 'harvest') rows[st] = rows[st].map(h => (fieldMap.has(h.fieldId) ? { ...h, fieldId: fieldMap.get(h.fieldId) } : h));
    }
  }

  await db.bulk([...db.DATA_STORES, 'kv'], s => {
    if (mode === 'replace') {
      for (const st of db.DATA_STORES) s[st].clear();
      if (obj.settings && typeof obj.settings === 'object') s.kv.put({ ...obj.settings, id: 'settings' });
    }
    for (const st of db.DATA_STORES) for (const r of rows[st]) s[st].put(r);
  });
}

export const folderSupported = () => 'showDirectoryPicker' in window;

export async function folderState() {
  const r = await db.get('kv', 'backupDir');
  if (!r || !r.handle) return { bound: false };
  let perm = 'prompt';
  try { perm = await r.handle.queryPermission({ mode: 'readwrite' }); } catch { /* 旧浏览器 */ }
  return { bound: true, name: r.handle.name, perm };
}

export async function bindFolder() {
  const handle = await window.showDirectoryPicker({ id: 'rei-base-backup', mode: 'readwrite' });
  await db.putQuiet('kv', { id: 'backupDir', handle });
  return writeFolderBackup();
}

export async function unbindFolder() {
  await db.del('kv', 'backupDir');
}

export async function regrant() {
  const r = await db.get('kv', 'backupDir');
  if (!r) return 'none';
  const p = await r.handle.requestPermission({ mode: 'readwrite' });
  if (p === 'granted') await writeFolderBackup();
  return p;
}

async function writeOnce() {
  const r = await db.get('kv', 'backupDir');
  if (!r || !r.handle) return false;
  if ((await r.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
  const snap = await snapshot();
  const fh = await r.handle.getFileHandle(fileName(), { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(snap));
  await w.close();
  await markBackup('folder');
  return true;
}

// 写的过程中又有改动，写完再补一轮
let writing = null, again = false;
export async function writeFolderBackup() {
  if (writing) { again = true; return writing; }
  writing = (async () => {
    let ok;
    do { again = false; ok = await writeOnce(); } while (again && ok);
    return ok;
  })();
  try { return await writing; } finally { writing = null; }
}
