// Trạng thái, tính toán nghiệp vụ, phân quyền và lưu dữ liệu.
import { invoke } from '@tauri-apps/api/core';

export const COLLS = ['duAnList','nhaThau','danhBa','goiThau','nghiemThu','thanhToan','thuVien','congViec','deXuat','bienBanMau','keys','revoked','hop','caiDat','banGiao','phieu','taiLieu'];

export const S = {
  view: 'tongquan', duAn: null, gtSel: null, tab: 'congviec', daTab: 'tiendo', vf: 'mo', pf: 'all', bbNhom: 'all',
  lic: null, info: null, kv: {}, snoozed: [],
  rp: { loai: 'tiendo', ct: 'tonghop', loc: 'all', cols: { nguoi: 1, goc: 1, hh: 1, xong: 1, tt: 1, lech: 1, ghichu: 0 }, fmt: 'xlsx', sel: [], tu: '', den: '', ky: true, sheet: true },
  nh: null, imp: null, share: null,
};
COLLS.forEach(c => S[c] = []);

export const DEFAULT_NH = { autostart: 1, tray: 1, ban: 1, banGio: '08:00', banNgay: 'Thứ 2 – Thứ 7', dnd: 1, dndTu: '22:00', dndDen: '07:00', amThanh: 1,
  tg: { token: '', chat: '' }, mail: { host: '', port: 465, user: '', pass: '', to: '' },
  rules: [
    { id: 'r1', on: 1, su: 'cv', truoc: 3, dv: 'ngày', gio: '08:00', pham: 'all', kenh: { mh: 1, am: 1, mail: 0, tg: 0 }, lap: 'Mỗi ngày đến khi xong' },
    { id: 'r2', on: 1, su: 'cvqh', truoc: 0, dv: 'ngày', gio: '08:00', pham: 'all', kenh: { mh: 1, am: 1, mail: 0, tg: 0 }, lap: 'Mỗi ngày đến khi xong' },
    { id: 'r3', on: 1, su: 'hop', truoc: 2, dv: 'giờ', gio: '', pham: 'all', kenh: { mh: 1, am: 1, mail: 0, tg: 0 }, lap: 'Một lần' },
    { id: 'r4', on: 1, su: 'tt', truoc: 5, dv: 'ngày', gio: '09:00', pham: 'all', kenh: { mh: 1, am: 0, mail: 0, tg: 0 }, lap: 'Mỗi ngày đến khi xong' },
    { id: 'r5', on: 1, su: 'bl', truoc: 30, dv: 'ngày', gio: '09:00', pham: 'all', kenh: { mh: 1, am: 0, mail: 0, tg: 0 }, lap: 'Mỗi tuần' },
  ], log: [] };

export const api = (cmd, args) => invoke(cmd, args);

/* ---------- định dạng ---------- */
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const vnd = n => Math.round(n || 0).toLocaleString('vi-VN') + ' đ';
export const ty = n => ((n || 0) / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
export const d = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—';
export const iso = dt => { const x = new Date(dt); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
export const today = () => iso(new Date());
export const TODAY = () => new Date(today() + 'T00:00:00');
export const days = s => Math.round((new Date(s + 'T00:00:00') - TODAY()) / 864e5);
export const addDays = (s, n) => { const x = new Date(s + 'T00:00:00'); x.setDate(x.getDate() + n); return iso(x); };
export const uid = p => (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const num = v => Number(String(v ?? '').replace(/\D/g, '')) || 0;
export const DOW = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export const gtById = id => S.goiThau.find(g => g.id === id);
export const daById = id => S.duAnList.find(a => a.id === id);
export const ntById = id => S.nhaThau.find(n => n.id === id) || { ten: '(chưa chọn nhà thầu)', lh: '' };
export const cvById = id => S.congViec.find(c => c.id === id);
export const donVi = () => S.caiDat.find(x => x.id === 'donVi') || { id: 'donVi', ten: '', dc: '', nguoi: [] };

/* ---------- nghiệp vụ ---------- */
export function cat(c) {
  if (c.tt === 'Hoàn thành') return 'xong';
  const n = days(c.hh);
  if (n < 0) return 'quahan';
  if (n <= 3) return 'saphan';
  if (c.tt === 'Chưa làm') return 'chuabd';
  return 'danglam';
}
export const FILTERS = {
  quahan: ['Quá hạn', c => cat(c) === 'quahan'],
  saphan: ['Sắp đến hạn (≤ 3 ngày)', c => cat(c) === 'saphan'],
  chuabd: ['Chưa thực hiện', c => cat(c) === 'chuabd'],
  danglam: ['Đang làm, còn hạn', c => cat(c) === 'danglam'],
  mo: ['Tất cả chưa xong', c => c.tt !== 'Hoàn thành'],
  xong: ['Đã xong', c => c.tt === 'Hoàn thành'],
  all: ['Tất cả', () => true],
};
export const tamUngTong = g => (g.tamUng || []).reduce((a, t) => a + (t.tien || 0), 0);
export function ntRows(gid) {
  const g = gtById(gid); if (!g) return [];
  const tu = tamUngTong(g); let daThuHoi = 0;
  return S.nghiemThu.filter(n => n.gt === gid).sort((a, b) => a.dot - b.dot).map(n => {
    const khauTru = Math.max(0, Math.min(n.gtri * (g.tlThuHoi || 0), tu - daThuHoi)); daThuHoi += khauTru;
    const giu = g.bh?.ht === 'Giữ tiền' ? n.gtri * (g.bh.tl || 0) : 0;
    const deNghi = n.gtri - khauTru - giu;
    const daTra = S.thanhToan.filter(t => t.nt === n.id).reduce((a, t) => a + (t.tien || 0), 0);
    const con = deNghi - daTra; const han = addDays(n.ngay, g.soNgayTT || 30);
    const tt = con <= 0 ? 'Đã trả đủ' : (days(han) < 0 ? 'Quá hạn' : (daTra > 0 ? 'Trả một phần' : 'Chưa trả'));
    return { ...n, khauTru, giu, deNghi, daTra, con, han, tt, tuConLai: tu - daThuHoi };
  });
}
export function tc(gid) {
  const g = gtById(gid); const rows = ntRows(gid); const tu = tamUngTong(g);
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  return { gt: g.gt || 0, tu, thuHoi: sum('khauTru'), tuCon: tu - sum('khauTru'), daNT: sum('gtri'), daTT: sum('daTra'), congNo: sum('con'), giu: sum('giu'),
    quaHan: rows.filter(r => r.tt === 'Quá hạn').length, conLaiHD: (g.gt || 0) - sum('gtri') };
}

/* ---------- phân quyền (bảng đã chốt 10/10/2026: [Giám đốc, Trưởng nhóm, Nhân viên]) ---------- */
export const PERM = {
  taoDA: [1, 1, 0], suaDA: [1, 1, 0], xoaDA: [1, 1, 0], dongDA: [1, 1, 0], suaGT: [1, 1, 0], xoaGT: [1, 1, 0], nhaThau: [1, 1, 0],
  themCV: [1, 1, 0], done: [1, 1, 0], dcHan: [1, 1, 0], ghiChu: [1, 1, 1], thuVien: [1, 1, 0],
  xemTC: [1, 1, 1], ghiTC: [1, 1, 1], suaTC: [1, 1, 0], baoHanh: [1, 1, 1], lapQT: [1, 1, 1], chotQT: [1, 1, 0],
  bcTD: [1, 1, 1], bcTC: [1, 1, 0], luuBC: [1, 1, 1], taoBB: [1, 1, 1], qlMau: [1, 1, 0], nhan: [1, 1, 1], quyTac: [1, 1, 1],
  xuat: [1, 1, 0], nhapXem: [1, 1, 1], nhapGop: [1, 1, 0], chonBan: [1, 1, 0], key: [1, 0, 0], nhatKy: [1, 1, 0], saoLuu: [1, 1, 0], caiDat: [1, 1, 0],
};
export const ROLE_NAME = { GD: 'Giám đốc', TN: 'Trưởng nhóm', NV: 'Nhân viên' };
const READ_KEYS = new Set(['bcTD', 'bcTC', 'luuBC', 'nhan', 'quyTac', 'xuat', 'nhapXem', 'nhapGop', 'chonBan', 'key', 'nhatKy', 'saoLuu', 'caiDat', 'taoBB', 'xemTC']);
export const followed = daId => (S.kv.follow || []).includes(daId);
/** can(k[, daId]): theo vai trò; dự án đang "Chỉ theo dõi" thì không sửa được. */
export function can(k, daId) {
  const role = S.lic?.role; if (!role) return false;
  if (S.share?.joined && role !== 'GD') return canTeam(k, daId, role);
  const ok = !!(PERM[k] || [1, 1, 1])[{ GD: 0, TN: 1, NV: 2 }[role]];
  if (ok && daId && followed(daId) && !READ_KEYS.has(k)) return false;
  return ok;
}

/* ---------- quyền khi làm việc nhóm (theo bảng quyền Giám đốc gửi về, giống phần kiểm tra ở máy Giám đốc) ---------- */
const KEY_GROUP = { taoDA: 'cv', suaDA: 'cv', dongDA: 'cv', suaGT: 'cv', nhaThau: 'cv', themCV: 'cv', thuVien: 'cv', xoaDA: 'xoa', xoaGT: 'xoa',
  done: 'tiendo', ghiChu: 'tiendo', dcHan: 'han', ghiTC: 'tc', suaTC: 'tc', baoHanh: 'tc', lapQT: 'tc', chotQT: 'tc', bcTC: 'tc', qlMau: 'mau', caiDat: 'caidat', taiLieu: 'tl' };
const GD_ONLY = new Set(['key', 'nhatKy', 'chonBan', 'nhapGop', 'saoLuu', 'quyen', 'duyet']);
/** Mức quyền với một nhóm dữ liệu: n sửa ngay, d gửi duyệt, x chỉ xem, h ẩn. */
export function modeOf(group, daId, gtId) {
  const role = S.lic?.role; const t = S.share?.team;
  if (role === 'GD' || !S.share?.joined || !t) return 'n';
  const R = t.rights || {}; const date = today(); const me = S.lic.serial; const now = Date.now();
  let best = null;
  for (const g of R.grants || []) {
    if (g.on === false || !(g.data === group || g.data === 'all')) continue;
    if (g.from && g.from > date) continue; if (g.to && g.to < date) continue;
    const who = g.who === me ? 2 : g.who === role ? 0 : -1; if (who < 0) continue;
    const sco = !g.scope || g.scope === 'all' ? 0 : (daId && g.scope === daId) ? 1 : -1; if (sco < 0) continue;
    if (!best || who + sco >= best[0]) best = [who + sco, (g.lv || 'x')[0]];
  }
  const m = best ? best[1] : ((R.rules || {})[group] || {})[role]?.[0] || 'x';
  const locked = (R.locks || []).some(l => now >= l.at && l.scope && (l.scope === daId || l.scope === gtId));
  return locked && m !== 'h' ? 'x' : m;
}
function canTeam(k, daId, role) {
  if (GD_ONLY.has(k)) return false;
  if (k === 'xemTC') return modeOf('tc', daId) !== 'h';
  const g = KEY_GROUP[k]; if (!g) return true;
  return 'nd'.includes(modeOf(g, daId));
}
/** Thao tác này sẽ thành đề xuất chờ Giám đốc duyệt? (để ghi chú trên nút) */
export const needsApproval = (k, daId) => S.share?.joined && S.lic?.role !== 'GD' && KEY_GROUP[k] && modeOf(KEY_GROUP[k], daId) === 'd';

/* ---------- lưu dữ liệu: so sánh với ảnh chụp, chỉ gửi bản ghi thay đổi ---------- */
let snap = {};
const label = r => r.ten || r.ma || r.lyDo || r.ct || r.id;
export function snapshot() { snap = {}; COLLS.forEach(c => { snap[c] = new Map(S[c].map(r => [r.id, JSON.stringify(r)])); }); }
export async function flush(opts = {}) {
  const changes = [];
  COLLS.forEach(c => {
    const old = snap[c] || new Map(); const seen = new Set();
    S[c].forEach(r => { if (!r.id) r.id = uid(); seen.add(r.id); const j = JSON.stringify(r); if (old.get(r.id) !== j) changes.push({ coll: c, id: r.id, data: r, label: String(label(r)).slice(0, 120) }); });
    old.forEach((j, id) => { if (!seen.has(id)) { let l = id; try { l = label(JSON.parse(j)); } catch { } changes.push({ coll: c, id, data: null, label: String(l).slice(0, 120) }); } });
  });
  if (!changes.length) return 0;
  try {
    const r = await api('db_apply', { changes, system: !!opts.system });
    if (r && (r.proposed || (r.denied || []).length)) {
      // Phần cần duyệt hoặc bị từ chối chưa vào dữ liệu: lấy lại dữ liệu thật để màn hình đúng.
      await load();
      const msg = [r.proposed ? `Đã gửi ${r.proposed} thay đổi cho Giám đốc duyệt` : '', (r.denied || []).length ? `Không có quyền sửa: ${r.denied.slice(0, 3).join(', ')}` : ''].filter(Boolean).join('. ');
      window.dispatchEvent(new CustomEvent('sda-proposed', { detail: msg }));
      return r.direct || 0;
    }
    snapshot(); if (r && r.direct) window.dispatchEvent(new Event('sda-kick')); return changes.length;
  }
  catch (e) { console.error(e); window.dispatchEvent(new CustomEvent('sda-error', { detail: String(e) })); await load().catch(() => {}); return 0; }
}
export async function load() {
  const r = await api('db_load');
  COLLS.forEach(c => S[c] = r.colls[c] || []);
  S.kv = r.kv || {};
  S.share = r.share || null;
  if (S.lic && S.share?.role && S.lic.role !== S.share.role) S.lic.role = S.share.role;
  S.nh = Object.assign(structuredClone(DEFAULT_NH), S.kv.nh || {});
  if (S.kv.rp) Object.assign(S.rp, S.kv.rp);
  snapshot();
}
export async function kvSet(key, value) { S.kv[key] = value; await api('kv_set', { key, value }); }

/* ---------- tiện ích dùng chung ---------- */
export const gtOf = c => gtById(c.gt) || { ma: '?', ten: '(gói đã xóa)', da: '' };
export const daOf = g => daById(g?.da) || { ten: '(dự án đã xóa)', cdt: '' };
/** Danh sách cán bộ để giao việc: người của đơn vị mình + người dùng máy này. */
export function staff() {
  const s = new Set((donVi().nguoi || []).map(p => p.ten).filter(Boolean));
  if (S.lic?.name) s.add(S.lic.name);
  S.congViec.forEach(c => c.nguoi && s.add(c.nguoi));
  return [...s];
}
export const fmtNow = () => { const x = new Date(); return iso(x) + ' ' + x.toTimeString().slice(0, 5); };
export const bbNorm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\.docx$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
