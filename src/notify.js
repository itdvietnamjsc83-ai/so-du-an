// Nhắc việc chạy nền: quy tắc do người dùng đặt, bản tin sáng, giờ yên tĩnh, gửi Telegram/Email.
import { S, api, cat, days, d, vnd, today, ntRows, tc, kvSet, fmtNow, gtOf } from './core.js';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export const NSU = { cv: 'Công việc sắp đến hạn', cvqh: 'Công việc đã quá hạn', hop: 'Cuộc họp sắp diễn ra', tt: 'Đợt thanh toán sắp đến hạn trả', bl: 'Thư bảo lãnh sắp hết hạn', tu: 'Tạm ứng chưa thu hồi xong' };
export const NKENH = [['mh', 'Hiện trên màn hình'], ['am', 'Âm thanh'], ['mail', 'Email'], ['tg', 'Telegram']];

const snoozedNow = () => { const now = Date.now(); return new Set((S.kv.snooze || []).filter(x => x.until > now).map(x => x.id)); };
/** Danh sách cảnh báo cho chuông và thanh bên: việc quá hạn và sắp đến hạn. */
export function nhAlerts() {
  const sz = snoozedNow();
  const cv = S.congViec.filter(c => c.tt !== 'Hoàn thành' && !sz.has(c.id) && c.hh);
  const pick = k => cv.filter(c => cat(c) === k);
  return pick('quahan').map(c => ({ k: 'bad', id: c.id, t: 'Quá hạn ' + (-days(c.hh)) + ' ngày: ' + c.ten, s: gtOf(c).ma + ' · ' + (c.nguoi || '') }))
    .concat(pick('saphan').map(c => ({ k: 'warn', id: c.id, t: (days(c.hh) === 0 ? 'Đến hạn hôm nay' : 'Còn ' + days(c.hh) + ' ngày') + ': ' + c.ten, s: gtOf(c).ma + ' · hạn ' + d(c.hh) })));
}

const hm = () => new Date().toTimeString().slice(0, 5);
function inQuiet(n) {
  if (!n.dnd) return false; const t = hm(), a = n.dndTu, b = n.dndDen;
  return a <= b ? (t >= a && t < b) : (t >= a || t < b);
}
function dayOk(n) { const w = new Date().getDay(); return n.banNgay === 'Mọi ngày' || (n.banNgay === 'Thứ 2 – Thứ 6' ? w >= 1 && w <= 5 : w >= 1 && w <= 6); }
const inScope = (r, daId, c) => r.pham === 'all' || (r.pham === 'mine' ? (!c || c.nguoi === S.lic?.name) : r.pham === daId);

/** Các mục khớp một quy tắc vào lúc này. Mỗi mục có id để không nhắc trùng. */
function matches(r) {
  const out = [];
  const openCV = S.congViec.filter(c => c.tt !== 'Hoàn thành' && c.hh);
  if (r.su === 'cv') openCV.forEach(c => { const n = days(c.hh), g = gtOf(c); if (n >= 0 && (r.lap === 'Một lần' ? n === +r.truoc : n <= +r.truoc) && inScope(r, g.da, c)) out.push({ id: c.id, k: 'warn', t: (n === 0 ? 'Đến hạn hôm nay' : `Còn ${n} ngày`) + ': ' + c.ten, s: `${g.ma} · ${c.nguoi || ''} · hạn ${d(c.hh)}` }); });
  if (r.su === 'cvqh') openCV.forEach(c => { const n = days(c.hh), g = gtOf(c); if (n < 0 && inScope(r, g.da, c)) out.push({ id: c.id, k: 'bad', t: `Quá hạn ${-n} ngày: ${c.ten}`, s: `${g.ma} · ${c.nguoi || ''}` }); });
  if (r.su === 'hop') S.hop.forEach(h => { if (!h.luc || !inScope(r, h.da)) return; const ms = new Date(h.luc) - Date.now(); const lead = (+r.truoc || 0) * (r.dv === 'giờ' ? 36e5 : 864e5);
    if (ms > 0 && ms <= lead) out.push({ id: h.id, k: 'warn', t: `Họp lúc ${h.luc.slice(11, 16)} ngày ${d(h.luc.slice(0, 10))}: ${h.ten}`, s: h.diaDiem || '' }); });
  if (r.su === 'tt' && S.lic) S.goiThau.forEach(g => { if (!inScope(r, g.da)) return; ntRows(g.id).forEach(x => { if (x.con > 0 && days(x.han) <= +r.truoc) out.push({ id: x.id, k: days(x.han) < 0 ? 'bad' : 'warn', t: `${g.ma} đợt ${x.dot}: ${days(x.han) < 0 ? 'quá hạn trả ' + (-days(x.han)) + ' ngày' : 'hạn trả ' + d(x.han)}`, s: 'Còn phải trả ' + vnd(x.con) }); }); });
  if (r.su === 'bl') S.goiThau.forEach(g => { if (g.bh?.ht === 'Nộp bảo lãnh' && g.bh.hh && days(g.bh.hh) <= +r.truoc && days(g.bh.hh) >= -30 && inScope(r, g.da)) out.push({ id: g.id + '-bl', k: 'warn', t: `${g.ma}: thư bảo lãnh hết hạn ${d(g.bh.hh)}`, s: g.bh.nh || '' }); });
  if (r.su === 'tu') S.goiThau.forEach(g => { const t = tc(g.id); if (t.tuCon > 0 && t.daNT > 0 && inScope(r, g.da)) out.push({ id: g.id + '-tu', k: 'info', t: `${g.ma}: tạm ứng còn phải thu hồi ${vnd(t.tuCon)}`, s: '' }); });
  return out;
}
function periodKey(r) {
  const T = today();
  if (r.lap === 'Một lần' || r.su === 'hop') return 'once';
  if (r.lap === 'Mỗi tuần') { const x = new Date(T + 'T00:00:00'); const onejan = new Date(x.getFullYear(), 0, 1); return x.getFullYear() + 'w' + Math.ceil(((x - onejan) / 864e5 + onejan.getDay() + 1) / 7); }
  return T;
}

let perm = null;
async function ensurePerm() { if (perm !== null) return perm; try { perm = await isPermissionGranted(); if (!perm) perm = (await requestPermission()) === 'granted'; } catch { perm = false; } return perm; }

/** Gửi một cảnh báo qua các kênh đã chọn và ghi nhật ký. */
export async function deliver(title, items, kenh, { log = true } = {}) {
  const body = items.slice(0, 5).map(x => '• ' + x.t).join('\n') + (items.length > 5 ? `\n… và ${items.length - 5} mục khác` : '');
  const used = []; const n = S.nh;
  if (kenh.mh && await ensurePerm()) { try { sendNotification({ title, body, sound: kenh.am && n.amThanh ? 'default' : undefined }); used.push('Màn hình'); } catch (e) { console.warn(e); } }
  const text = `${title}\n${items.map(x => '• ' + x.t + (x.s ? ' (' + x.s + ')' : '')).join('\n')}`;
  if (kenh.tg && n.tg?.token && n.tg?.chat) { try { await api('send_telegram', { token: n.tg.token, chatId: n.tg.chat, text }); used.push('Telegram'); } catch (e) { used.push('Telegram lỗi'); console.warn(e); } }
  if (kenh.mail && n.mail?.host && n.mail?.to) { try { await api('send_email', { host: n.mail.host, port: +n.mail.port || 465, user: n.mail.user, pass: n.mail.pass, to: n.mail.to, subject: '[Sổ Dự Án] ' + title, body: text }); used.push('Email'); } catch (e) { used.push('Email lỗi'); console.warn(e); } }
  if (log) { n.log = [{ luc: fmtNow(), t: title + (items.length ? ': ' + items.slice(0, 2).map(x => x.t).join('; ') : ''), k: used.join(', ') || 'Không gửi được' }, ...(n.log || [])].slice(0, 100); await kvSet('nh', n); }
  window.dispatchEvent(new CustomEvent('sda-notified'));
  return used;
}

/** Chạy mỗi phút. */
export async function tick(force = false) {
  const n = S.nh; if (!S.lic?.activated) return;
  const st = S.kv.nhState || { sent: {}, ban: '' };
  if (inQuiet(n) && !force) return;
  const now = hm(); let changed = false;
  if (n.ban && dayOk(n) && (force || (now >= n.banGio && st.ban !== today()))) {
    const a = nhAlerts(); const qh = a.filter(x => x.k === 'bad').length, sp = a.length - qh;
    const tt = S.goiThau.flatMap(g => ntRows(g.id).filter(x => x.con > 0 && days(x.han) <= 7)).length;
    if (a.length || tt) await deliver(`Bản tin sáng: ${qh} việc quá hạn, ${sp} việc sắp đến hạn${tt ? `, ${tt} khoản sắp hoặc quá hạn trả` : ''}`, a, { mh: 1, am: 1, tg: 1, mail: 0 });
    st.ban = today(); changed = true;
  }
  for (const r of n.rules) {
    if (!r.on) continue;
    if (!force && r.su !== 'hop' && r.gio && now < r.gio) continue;
    const pk = periodKey(r);
    const fresh = matches(r).filter(x => !st.sent[r.id + '|' + x.id + '|' + pk]);
    if (!fresh.length) continue;
    await deliver(NSU[r.su], fresh, r.kenh);
    fresh.forEach(x => st.sent[r.id + '|' + x.id + '|' + pk] = Date.now()); changed = true;
  }
  if (changed) { const cut = Date.now() - 40 * 864e5; Object.keys(st.sent).forEach(k => { if (st.sent[k] < cut) delete st.sent[k]; }); await kvSet('nhState', st); }
}

/** Thử một quy tắc: gửi ngay, không ghi trạng thái đã nhắc. */
export async function testRule(r) {
  const m = matches(r);
  const items = m.length ? m : [{ t: 'Đây là cảnh báo thử. Hiện chưa có mục nào khớp quy tắc này.', s: '' }];
  return deliver('Thử: ' + NSU[r.su], items, r.kenh, { log: false });
}

export function start() { setTimeout(() => tick(), 8000); setInterval(() => tick().catch(console.error), 60000); }
