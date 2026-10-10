// Dữ liệu trên điện thoại: đọc tệp .sodaan (zip), lưu vào IndexedDB, nạp vào S của core.js.
import { unzipSync, strFromU8 } from 'fflate';
import { S, COLLS } from '../../src/core.js';

const DB = 'sodaan-mobile';
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await idb();
  return new Promise((ok, no) => {
    const t = db.transaction(store, mode); const st = t.objectStore(store); let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => ok(out); t.onerror = () => no(t.error); t.onabort = () => no(t.error);
  });
}
const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const kvGet = k => tx('kv', 'readonly', st => req(st.get(k)));
const kvPut = (k, v) => tx('kv', 'readwrite', st => { st.put(v, k); });

export const M = { meta: null, hist: [] };

/** Nạp dữ liệu đã lưu trên máy vào S. Trả về true nếu đã có dữ liệu. */
export async function loadLocal() {
  const recs = (await kvGet('recs')) || [];
  M.meta = (await kvGet('meta')) || null; M.hist = (await kvGet('hist')) || [];
  fill(recs); return recs.length > 0;
}
function fill(recs) {
  COLLS.forEach(c => S[c] = []);
  recs.forEach(r => { if (!r.deleted && S[r.coll]) S[r.coll].push({ ...r.data, id: r.id }); });
  S.lic = { name: M.meta?.by || '', role: M.meta?.role || 'NV' };
}

/** Đọc tệp người dùng chọn. Lỗi thì ném thông báo tiếng Việt. */
export async function readPackage(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let z; try { z = unzipSync(buf); } catch { throw new Error('Tệp này không phải tệp dữ liệu Sổ Dự Án (.sodaan).'); }
  if (!z['manifest.json'] || !z['data.json']) throw new Error('Tệp này không phải tệp dữ liệu Sổ Dự Án (.sodaan).');
  const manifest = JSON.parse(strFromU8(z['manifest.json']));
  if (manifest.app !== 'so-du-an') throw new Error('Tệp này không phải tệp dữ liệu Sổ Dự Án (.sodaan).');
  const recs = JSON.parse(strFromU8(z['data.json']));
  const files = {}; Object.keys(z).forEach(k => { if (k.startsWith('files/') && !k.endsWith('/') && !k.includes('..')) files[k] = z[k]; });
  return { name: file.name, manifest, recs, files };
}

/** Dự án trong gói mới thay hoàn toàn bản cũ; dự án khác đang có trên máy được giữ nguyên. */
function merged(old, pkg) {
  const pids = new Set(pkg.recs.filter(r => r.coll === 'duAnList').map(r => r.id).concat((pkg.manifest.projects || []).map(p => p.id)));
  const gts = new Set(old.filter(r => r.coll === 'goiThau' && pids.has(r.data?.da)).map(r => r.id));
  const nts = new Set(old.filter(r => r.coll === 'nghiemThu' && gts.has(r.data?.gt)).map(r => r.id));
  const inPkg = new Set(pkg.recs.map(r => r.coll + '|' + r.id));
  const keep = old.filter(r => !inPkg.has(r.coll + '|' + r.id) && !(r.coll === 'duAnList' && pids.has(r.id)) && !pids.has(r.data?.da) && !gts.has(r.data?.gt) && !nts.has(r.data?.nt));
  return keep.concat(pkg.recs);
}

/** So với dữ liệu đang xem: bao nhiêu việc đổi trạng thái, việc mới, dự án mới. */
export async function diff(pkg) {
  const old = (await kvGet('recs')) || [];
  const live = rs => new Map(rs.filter(r => !r.deleted).map(r => [r.coll + '|' + r.id, r]));
  const a = live(old), b = live(merged(old, pkg));
  let doiTT = 0, cvMoi = 0, daMoi = 0, doiHan = 0;
  b.forEach((r, k) => { const o = a.get(k);
    if (r.coll === 'congViec') { if (!o) cvMoi++; else { if (o.data.tt !== r.data.tt) doiTT++; if (o.data.hh !== r.data.hh) doiHan++; } }
    if (r.coll === 'duAnList' && !o) daMoi++; });
  return { doiTT, cvMoi, daMoi, doiHan, first: !old.length };
}

export async function apply(pkg) {
  const old = (await kvGet('recs')) || [];
  const recs = merged(old, pkg);
  await tx('files', 'readwrite', st => { Object.entries(pkg.files).forEach(([k, v]) => st.put(new Blob([v]), k)); });
  const m = pkg.manifest;
  M.meta = { by: m.by || '', role: m.role || 'NV', at: m.exported_at || '', file: pkg.name, imported: new Date().toISOString() };
  M.hist = [{ at: M.meta.at, by: M.meta.by, file: pkg.name }, ...M.hist].slice(0, 20);
  await kvPut('recs', recs); await kvPut('meta', M.meta); await kvPut('hist', M.hist);
  fill(recs);
}

export async function clearAll() {
  await tx('kv', 'readwrite', st => { st.clear(); }); await tx('files', 'readwrite', st => { st.clear(); });
  M.meta = null; M.hist = []; fill([]);
}

export const getFile = path => tx('files', 'readonly', st => req(st.get(path)));
