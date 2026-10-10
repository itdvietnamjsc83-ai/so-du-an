// Các màn hình. Mỗi hàm trả về HTML theo dữ liệu thật trong S.
import { S, $, esc, vnd, ty, d, days, addDays, today, DOW, gtById, daById, ntById, cvById, cat, FILTERS, ntRows, tc, can, followed, ROLE_NAME, gtOf, daOf, donVi } from './core.js';
import { ic, pill } from './ui.js';
import { BUILTIN_NHOM } from './bienban.js';
import { nhAlerts, NSU, NKENH } from './notify.js';
import { rpScope, rpPreview, RPCOLS } from './report.js';

export const V = {}, T = {};

/* ---------- mảnh giao diện dùng lại ---------- */
export function hanPill(c) {
  if (c.tt === 'Hoàn thành') { const n = c.xong && c.goc ? Math.round((new Date(c.xong) - new Date(c.goc)) / 864e5) : 0; return n > 0 ? pill('Xong trễ ' + n + ' ngày', 'warn') : pill('Đúng hạn', 'good'); }
  const n = days(c.hh);
  if (n < 0) return pill('Quá hạn ' + (-n) + ' ngày', 'bad');
  if (n <= 3) return pill(n === 0 ? 'Đến hạn hôm nay' : 'Còn ' + n + ' ngày', 'warn');
  return `<span class="muted">Còn ${n} ngày</span>`;
}
export function doneBtn(c) {
  const g = gtOf(c);
  if (!can('done', g.da)) return '';
  return c.tt === 'Hoàn thành' ? `<button class="btn sm" data-act="undo" data-id="${c.id}">↶ Hoàn tác</button>` : `<button class="btn sm" data-act="done" data-id="${c.id}">✓ Xong</button>`;
}
export function chips(list, cur, attr) {
  return `<div class="chips" role="tablist">${Object.keys(FILTERS).map(k => `<button class="chip ${k === cur ? 'on' : ''} ${k}" ${attr}="${k}" role="tab" aria-selected="${k === cur}">${FILTERS[k][0]} <b>${list.filter(FILTERS[k][1]).length}</b></button>`).join('')}</div>`;
}
const SEG = [['xong', 'Đã xong'], ['danglam', 'Đang làm'], ['chuabd', 'Chưa thực hiện'], ['saphan', 'Sắp đến hạn'], ['quahan', 'Quá hạn']];
function stack(cv) {
  return `<div class="stack" role="img" aria-label="${SEG.map(([k, l]) => l + ' ' + cv.filter(c => cat(c) === k).length).join(', ')}">${SEG.map(([k, l]) => { const v = cv.filter(c => cat(c) === k).length; return v ? `<i class="${k}" style="flex:${v}" title="${l}: ${v}"></i>` : ''; }).join('')}</div>`;
}
const legend = () => `<div class="row muted" style="gap:12px;font-size:12px">${SEG.map(([k, l]) => `<span><i class="sw ${k}"></i>${l}</span>`).join('')}</div>`;
const roBanner = daId => followed(daId) ? `<div class="ro-banner">Dự án này đang ở chế độ <b>Chỉ theo dõi</b>: dữ liệu được thay mỗi lần nhận bản mới, không sửa trên máy này.${can('chonBan') ? ' <button class="btn sm" data-act="takeover" data-id="' + daId + '">Chuyển sang cập nhật tiếp</button>' : ''}</div>` : '';
const fileBtn = (f, lab = 'Mở') => f ? `<button class="btn sm" data-act="openfile" data-f="${esc(f)}">${lab}</button>` : '';
const visibleDA = () => S.duAnList.filter(a => !a.luuTru || S.showArchived);
const cvOfDA = id => { const g = new Set(S.goiThau.filter(x => x.da === id).map(x => x.id)); return S.congViec.filter(c => g.has(c.gt)); };

/* ---------- thanh bên, đường dẫn ---------- */
export function renderSide() {
  const nAlert = nhAlerts().length;
  const items = [
    ['tongquan', 'home', 'Tổng quan', true, 0, 'Công việc'],
    ['duan', 'folder', 'Dự án', true, 0, 'Công việc'],
    ['viec', 'task', 'Việc cần làm', true, nAlert, 'Công việc'],
    ['taichinh', 'money', 'Tài chính', can('xemTC'), 0, 'Công việc'],
    ['baocao', 'report', 'Báo cáo', true, 0, 'Công việc'],
    ['nhathau', 'build', 'Nhà thầu & đơn vị', true, 0, 'Danh mục'],
    ['bienban', 'doc', 'Biên bản mẫu', true, 0, 'Danh mục'],
    ['thuvien', 'book', 'Thư viện công việc', true, 0, 'Danh mục'],
    ['nhacviec', 'bell', 'Nhắc việc & thông báo', true, 0, 'Dữ liệu'],
    ['dongbo', 'sync', 'Chia sẻ & đồng bộ', true, 0, 'Dữ liệu'],
    ['keys', 'key', 'Quản lý key', can('key'), 0, 'Dữ liệu'],
    ['caidat', 'gear', 'Cài đặt & nhật ký', true, 0, 'Dữ liệu'],
  ];
  let grp = '';
  const last = S.kv.lastShare;
  $('#side').innerHTML = `<div class="brand"><div class="brand-mark">S</div><div><b>Sổ Dự Án</b><small>${esc(donVi().ten || 'Bản offline')}</small></div></div>` +
    items.filter(i => i[3]).map(i => { const lab = i[5] !== grp ? `<div class="nav-label">${i[5]}</div>` : ''; grp = i[5];
      return lab + `<button class="nav ${navOn(i[0]) ? 'on' : ''}" data-go="${i[0]}">${ic(i[1])}<span>${i[2]}</span>${i[4] ? `<span class="badge">${i[4]}</span>` : ''}</button>`; }).join('') +
    `<div class="side-foot"><span class="dot"></span>${last ? 'Chia sẻ gần nhất: ' + d(last.slice(0, 10)) : 'Chưa chia sẻ lần nào'}<br><span style="opacity:.7">Phiên bản ${esc(S.info?.version || '')}</span></div>`;
}
const navOn = k => S.view === k || (k === 'duan' && (S.view === 'duandetail' || S.view === 'goithau'));
const NAMES = { tongquan: 'Tổng quan', duan: 'Dự án', viec: 'Việc cần làm', taichinh: 'Tài chính', nhathau: 'Nhà thầu & đơn vị', thuvien: 'Thư viện công việc', baocao: 'Báo cáo', nhacviec: 'Nhắc việc & thông báo', keys: 'Quản lý key', bienban: 'Biên bản mẫu', dongbo: 'Chia sẻ & đồng bộ', caidat: 'Cài đặt & nhật ký' };
export function renderCrumbs() {
  const c = [];
  if (S.view === 'duandetail' || S.view === 'goithau') {
    const a = daById(S.duAn) || {};
    c.push(`<button data-go="duan">Dự án</button>`);
    if (S.view === 'goithau') { const g = gtById(S.gtSel) || {}; c.push('<span>›</span>', `<button data-da="${a.id}">${esc(a.ten)}</button>`, '<span>›</span>', `<span class="cur">${esc(g.ma)}</span>`); }
    else c.push('<span>›</span>', `<span class="cur">${esc(a.ten)}</span>`);
  } else c.push(`<span class="cur">${NAMES[S.view] || ''}</span>`);
  $('#crumbs').innerHTML = c.join('');
}
export function renderLic() {
  const l = S.lic || {}; const e = $('#lic'); if (!e) return;
  e.innerHTML = `<span class="av">${esc((l.name || '?').trim().split(' ').pop()[0] || '?')}</span><span><b>${esc(l.name)}</b><small>${ROLE_NAME[l.role] || ''} · hạn ${d(l.exp)}</small></span>`;
}

/* ---------- công nợ theo dự án ---------- */
const PCOL = ['#3b6fd8', '#2a9d8f', '#c9772b', '#8b5cc4', '#c4497a', '#5b8c3a', '#b5562f'];
function cnAgg(gids) {
  const o = { gt: 0, daNT: 0, daTT: 0, thuHoi: 0, giu: 0, congNo: 0, qh: 0, quaHan: 0 };
  gids.forEach(id => { const t = tc(id); ['gt', 'daNT', 'daTT', 'thuHoi', 'giu', 'congNo', 'quaHan'].forEach(k => o[k] += t[k]);
    o.qh += ntRows(id).filter(r => r.tt === 'Quá hạn').reduce((a, r) => a + r.con, 0); });
  o.trongHan = o.congNo - o.qh; return o;
}
function cnBar(o) {
  const w = v => o.gt ? (v / o.gt * 100).toFixed(2) + '%' : '0';
  const seg = (v, c, t) => v > 0 ? `<i class="${c}" style="width:${w(v)}" title="${t}: ${vnd(v)}"></i>` : '';
  return `<div class="cnbar">${seg(o.daTT + o.thuHoi, 'tra', 'Đã thanh toán + thu hồi tạm ứng')}${seg(o.giu, 'giu', 'Giữ bảo hành')}${seg(o.trongHan, 'nth', 'Công nợ trong hạn')}${seg(o.qh, 'nqh', 'Công nợ quá hạn')}</div>`;
}
function donut(parts, total, label) {
  const r = 54, C = 2 * Math.PI * r; let off = 0;
  const arcs = total > 0 ? parts.filter(x => x.v > 0).map(x => { const len = x.v / total * C; const a = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${x.c}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(x.t)}: ${vnd(x.v)}</title></circle>`; off += len; return a; }).join('') : '';
  return `<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="${label}"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="22"/>${arcs}<text x="70" y="66" text-anchor="middle" class="dn-v">${ty(total)}</text><text x="70" y="84" text-anchor="middle" class="dn-k">${label}</text></svg>`;
}
function cnPanel() {
  const das = visibleDA().map((a, i) => ({ a, c: PCOL[i % PCOL.length], gts: S.goiThau.filter(g => g.da === a.id) })).filter(x => x.gts.length).map(x => ({ ...x, o: cnAgg(x.gts.map(g => g.id)) }));
  if (!das.length) return '';
  const total = das.reduce((s, x) => s + x.o.congNo, 0), qhTot = das.reduce((s, x) => s + x.o.qh, 0);
  const rows = das.map(x => { const open = S.cnOpen === x.a.id;
    const head = `<button class="cnrow ${open ? 'open' : ''}" data-cn="${x.a.id}" aria-expanded="${open}"><span class="sw" style="background:${x.c}"></span>
      <span class="cn-n"><b>${esc(x.a.ten)}</b><span class="muted">${x.gts.length} gói thầu · HĐ ${ty(x.o.gt)}${x.o.quaHan ? ` · <span style="color:var(--bad)">${x.o.quaHan} đợt quá hạn</span>` : ''}</span></span>
      <span class="cn-b">${cnBar(x.o)}</span>
      <span class="cn-v"><b>${vnd(x.o.congNo)}</b><span class="muted">${total ? Math.round(x.o.congNo / total * 100) : 0}% tổng nợ</span></span><span class="chev">${open ? '▾' : '▸'}</span></button>`;
    const det = open ? `<div class="cndet">${x.gts.map(g => { const o = cnAgg([g.id]); return `<div class="cnsub"><span class="cn-n"><b>${esc(g.ma)}</b> ${esc(g.ten)}<span class="muted">${esc(ntById(g.nt).ten)}</span></span><span class="cn-b">${cnBar(o)}</span><span class="cn-v"><b>${vnd(o.congNo)}</b>${o.qh ? `<span style="color:var(--bad);font-size:12px">quá hạn ${vnd(o.qh)}</span>` : '<span class="muted">trong hạn</span>'}</span><button class="btn sm" data-gt="${g.id}" data-tabgo="taichinh">Mở</button></div>`; }).join('')}</div>` : '';
    return head + det; }).join('');
  return `<section class="panel"><div class="panel-h"><h2>Công nợ theo dự án</h2><button class="btn sm" data-go="taichinh">Xem tài chính</button></div>
    <div class="panel-b cnwrap"><div class="cnchart">${donut(das.map(x => ({ v: x.o.congNo, c: x.c, t: x.a.ten })), total, 'tổng công nợ')}
      <div class="muted" style="text-align:center">Trong đó quá hạn<br><b style="color:var(--bad)">${vnd(qhTot)}</b></div></div>
      <div class="cnlist"><div class="cnleg"><span><i class="tra"></i>Đã thanh toán</span><span><i class="giu"></i>Giữ bảo hành</span><span><i class="nth"></i>Nợ trong hạn</span><span><i class="nqh"></i>Nợ quá hạn</span><span><i></i>Chưa nghiệm thu</span><span class="muted">· độ dài thanh = giá trị hợp đồng · bấm dự án để xem từng gói</span></div>${rows}</div></div></section>`;
}

/* ---------- Tổng quan ---------- */
V.tongquan = () => {
  const T0 = today();
  if (!S.duAnList.length) return `<div class="head"><div><h1>Tổng quan</h1><p class="sub">${DOW[new Date().getDay()]}, ${d(T0)}</p></div></div>
    <div class="empty-big">${ic('folder')}<h2>Chưa có dự án nào</h2><p class="muted">Bắt đầu bằng việc nhập thông tin đơn vị, tạo dự án đầu tiên, hoặc nhận dữ liệu do người khác gửi.</p>
    <div class="row" style="justify-content:center">${can('caiDat') ? '<button class="btn" data-go="caidat">Thông tin đơn vị</button>' : ''}<button class="btn" data-go="dongbo">Nhận dữ liệu</button>${can('taoDA') ? '<button class="btn pri" data-act="da-new">+ Tạo dự án</button>' : ''}</div></div>`;
  const activeDA = new Set(visibleDA().map(a => a.id));
  const gtsAll = S.goiThau.filter(g => activeDA.has(g.da));
  const gSet = new Set(gtsAll.map(g => g.id));
  const cvs = S.congViec.filter(c => gSet.has(c.gt) && c.tt !== 'Hoàn thành');
  const nCat = k => cvs.filter(c => cat(c) === k).length;
  const all = gtsAll.map(g => tc(g.id));
  const congNo = all.reduce((a, x) => a + x.congNo, 0), ttQH = all.reduce((a, x) => a + x.quaHan, 0);
  const tiles = [
    `<button class="tile bad" data-vf="quahan"><span class="k">Quá hạn</span><span class="v">${nCat('quahan')}</span><span class="h">Cần xử lý ngay</span></button>`,
    `<button class="tile warn" data-vf="saphan"><span class="k">Sắp đến hạn (≤ 3 ngày)</span><span class="v">${nCat('saphan')}</span><span class="h">Theo quy tắc nhắc việc</span></button>`,
    `<button class="tile" data-vf="chuabd"><span class="k">Chưa thực hiện</span><span class="v">${nCat('chuabd')}</span><span class="h">Chưa bắt đầu, còn hạn</span></button>`,
    can('xemTC') ? `<button class="tile" data-go="taichinh"><span class="k">Công nợ nhà thầu</span><span class="v">${ty(congNo)}</span><span class="h">${ttQH} đợt quá hạn thanh toán</span></button>`
      : `<button class="tile" data-vf="danglam"><span class="k">Đang làm</span><span class="v">${nCat('danglam')}</span><span class="h">Còn hạn</span></button>`,
  ].join('');
  const urgent = cvs.filter(c => ['quahan', 'saphan'].includes(cat(c))).sort((a, b) => a.hh.localeCompare(b.hh));
  const strip = Array.from({ length: 14 }, (_, i) => addDays(T0, i));
  const DW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const cell = day => { const items = cvs.filter(c => c.hh === day); const dow = new Date(day + 'T00:00:00').getDay();
    return `<div class="day ${day === T0 ? 'today' : ''} ${dow === 0 || dow === 6 ? 'we' : ''}" title="${items.map(c => esc(c.ten)).join(' · ')}"><span class="dw">${day === T0 ? 'Hôm nay' : DW[dow]}</span><span class="dd">${day.slice(8, 10)}/${day.slice(5, 7)}</span><span class="dots">${items.slice(0, 8).map(c => `<i class="${cat(c)}"></i>`).join('')}</span><span class="dn">${items.length || ''}</span></div>`; };
  const das = visibleDA().filter(a => a.tt !== 'Đã đóng').map(a => {
    const gts = S.goiThau.filter(g => g.da === a.id); const cv = cvOfDA(a.id);
    const open = cv.filter(c => c.tt !== 'Hoàn thành').sort((x, y) => x.hh.localeCompare(y.hh)); const next = open[0];
    const q = cv.filter(c => cat(c) === 'quahan').length; const xong = cv.filter(c => c.tt === 'Hoàn thành').length;
    const fin = gts.map(g => tc(g.id)); const gtHD = fin.reduce((s, x) => s + x.gt, 0), daNT = fin.reduce((s, x) => s + x.daNT, 0);
    const pct = cv.length ? Math.round(xong / cv.length * 100) : 0, ntp = gtHD ? Math.round(daNT / gtHD * 100) : 0;
    const nDL = cv.filter(c => ['danglam', 'saphan'].includes(cat(c))).length, nCL = cv.filter(c => cat(c) === 'chuabd').length;
    const worst = cv.filter(c => cat(c) === 'quahan').sort((x, y) => x.hh.localeCompare(y.hh))[0];
    const ring = (v, c, lab) => { const r = 26, C = 2 * Math.PI * r; return `<div class="ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * v / 100} ${C}" transform="rotate(-90 32 32)"/></svg><b>${v}%</b><span>${lab}</span></div>`; };
    const box = (n, k, lab) => `<div class="sbox ${k} ${n ? '' : 'zero'}"><b>${n}</b><span><i class="${k}"></i>${lab}</span></div>`;
    return `<button class="pcard" data-da="${a.id}"><div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><b class="pt">${esc(a.ten)}</b>${q ? pill(q + ' trễ hạn', 'bad') : pill(a.tt)}</div>
      <span class="muted">${esc(a.cdt)} · ${gts.length} gói thầu · ${cv.length} công việc${followed(a.id) ? ' · chỉ theo dõi' : ''}</span>
      ${cv.length ? `<div class="prow">${ring(pct, 'var(--good)', 'việc đã xong')}${can('xemTC') ? ring(ntp, 'var(--accent)', 'giá trị đã nghiệm thu') : ''}</div>
      <div class="sboxes">${box(xong, 'xong', 'Đã xong')}${box(nDL, 'danglam', 'Đang làm')}${box(nCL, 'chuabd', 'Chưa làm')}${box(q, 'quahan', 'Trễ hạn')}</div>
      ${worst ? `<div class="pwarn">Trễ nhiều nhất: ${esc(worst.ten)} · quá ${-days(worst.hh)} ngày</div>` : ''}
      <span class="muted">${next ? `Hạn gần nhất: ${esc(next.ten)} · ${d(next.hh)}` : 'Không còn việc mở'}</span>`
        : '<div class="empty" style="padding:16px">Chưa có công việc. Bấm để thêm gói thầu và công việc.</div>'}</button>`; }).join('');
  const fa = [];
  if (can('xemTC')) gtsAll.forEach(g => {
    ntRows(g.id).forEach(r => { if (r.con > 0 && (r.tt === 'Quá hạn' || days(r.han) <= 7)) fa.push({ k: r.tt === 'Quá hạn' ? 'bad' : 'warn', t: `${g.ma} · đợt ${r.dot}: còn phải trả ${vnd(r.con)}`, s: r.tt === 'Quá hạn' ? `Quá hạn trả ${-days(r.han)} ngày (hạn ${d(r.han)})` : `Hạn trả ${d(r.han)}`, gt: g.id }); });
    if (g.bh?.ht === 'Nộp bảo lãnh' && g.bh.hh && days(g.bh.hh) <= 60) fa.push({ k: 'warn', t: `${g.ma} · thư bảo lãnh sắp hết hạn`, s: `Hết hạn ${d(g.bh.hh)}`, gt: g.id });
    const t = tc(g.id); if (t.tuCon > 0 && t.daNT > 0) fa.push({ k: 'info', t: `${g.ma} · tạm ứng chưa thu hồi ${vnd(t.tuCon)}`, s: `Thu hồi ${Math.round((g.tlThuHoi || 0) * 100)}% mỗi đợt nghiệm thu`, gt: g.id });
  });
  return `<div class="head"><div><h1>Tổng quan</h1><p class="sub">${DOW[new Date().getDay()]}, ${d(T0)} · ${activeDA.size} dự án · ${gtsAll.length} gói thầu · ${cvs.length} việc chưa xong</p></div>
    <div class="row"><button class="btn" data-go="dongbo">Chia sẻ & đồng bộ</button>${can('taoDA') ? '<button class="btn pri" data-act="da-new">+ Tạo dự án</button>' : ''}</div></div>
  <div class="tiles">${tiles}</div>
  <section class="panel"><div class="panel-h"><h2>14 ngày tới</h2>${legend()}</div><div class="panel-b"><div class="strip">${strip.map(cell).join('')}</div></div></section>
  <div class="grid2">
    <section class="panel"><div class="panel-h"><h2>Cần xử lý hôm nay</h2><span class="muted">Quá hạn và đến hạn trong 3 ngày</span></div>
      <div class="panel-b list">${urgent.map(c => { const g = gtOf(c); return `<div class="li"><span class="sev ${cat(c)}"></span><div class="grow"><div class="t">${esc(c.ten)}</div><div class="muted">${esc(g.ma)} · ${esc(daOf(g).ten)} · ${esc(c.nguoi)}</div></div>${hanPill(c)}${doneBtn(c)}</div>`; }).join('') || '<div class="empty">Không có việc quá hạn hay sắp đến hạn.</div>'}</div></section>
    ${can('xemTC') ? `<section class="panel"><div class="panel-h"><h2>Tài chính cần chú ý</h2><button class="btn sm" data-go="taichinh">Xem tài chính</button></div>
      <div class="panel-b list">${fa.map(x => `<div class="li"><span class="sev ${x.k === 'bad' ? 'quahan' : x.k === 'warn' ? 'saphan' : 'danglam'}"></span><div class="grow"><div class="t">${esc(x.t)}</div><div class="muted">${esc(x.s)}</div></div><button class="btn sm" data-gt="${x.gt}" data-tabgo="taichinh">Mở</button></div>`).join('') || '<div class="empty">Không có khoản nào cần chú ý.</div>'}</div></section>` : ''}
  </div>
  ${can('xemTC') ? cnPanel() : ''}
  <section class="panel"><div class="panel-h"><h2>Dự án đang theo dõi</h2><button class="btn sm" data-go="duan">Tất cả dự án</button></div>
    <div class="panel-b"><div class="pcards">${das || '<div class="empty">Không có dự án đang hoạt động.</div>'}</div></div></section>`;
};

/* ---------- Dự án ---------- */
V.duan = () => {
  const list = visibleDA(); const nArch = S.duAnList.filter(a => a.luuTru).length;
  return `<div class="head"><div><h1>Dự án</h1><p class="sub">${list.length} dự án${nArch ? ` · <button class="linkbtn" data-act="toggle-archived">${S.showArchived ? 'Ẩn' : 'Hiện'} ${nArch} dự án lưu trữ</button>` : ''}</p></div><div class="row" style="flex-wrap:wrap"><button class="btn" data-act="xl-tpl" data-scope="">Tải file mẫu Excel</button><button class="btn" data-act="xl-imp">Nhập từ Excel</button>${can('taoDA') ? `<button class="btn pri" data-act="da-new">+ Tạo dự án</button>` : ''}</div></div>
  <section class="panel tbl-wrap"><table><thead><tr><th>Dự án</th><th>Chủ đầu tư</th><th>Trưởng nhóm</th><th>Thời gian</th><th class="r">Gói thầu</th><th class="r">Công việc</th><th>Trạng thái</th></tr></thead><tbody>
  ${list.map(a => { const cv = cvOfDA(a.id); const q = cv.filter(c => cat(c) === 'quahan').length;
    return `<tr class="click" data-da="${a.id}"><td><b>${esc(a.ten)}</b>${a.diaDiem ? `<div class="muted">${esc(a.diaDiem)}</div>` : ''}</td><td>${esc(a.cdt)}</td><td>${esc(a.tn)}</td><td class="date">${d(a.bd)} – ${d(a.kt)}</td><td class="r num">${S.goiThau.filter(g => g.da === a.id).length}</td><td class="r num">${cv.length}${q ? ` <span style="color:var(--bad)">(${q} trễ)</span>` : ''}</td><td>${pill(a.tt)}${followed(a.id) ? ' ' + pill('Chỉ theo dõi', 'info') : ''}${a.luuTru ? ' ' + pill('Lưu trữ', '') : ''}</td></tr>`; }).join('') || `<tr><td colspan="7" class="empty">Chưa có dự án.</td></tr>`}
  </tbody></table></section>`;
};

V.duandetail = () => {
  const a = daById(S.duAn); if (!a) { S.view = 'duan'; return V.duan(); }
  const gts = S.goiThau.filter(g => g.da === a.id);
  const tab = S.daTab || 'tiendo';
  const head = `<div class="head"><div><h1>${esc(a.ten)}</h1><p class="sub">${esc(a.cdt)} · ${d(a.bd)} – ${d(a.kt)}${a.tn ? ' · Trưởng nhóm ' + esc(a.tn) : ''}</p></div><div class="row">${pill(a.tt)}
    ${can('suaDA', a.id) ? `<button class="btn" data-act="da-edit" data-id="${a.id}">Sửa thông tin</button>` : ''}</div></div>${roBanner(a.id)}
  <div class="tabs" role="tablist"><button class="tab ${tab === 'tiendo' ? 'on' : ''}" data-datab="tiendo" role="tab">Tiến độ dự án</button><button class="tab ${tab === 'goithau' ? 'on' : ''}" data-datab="goithau" role="tab">Gói thầu (${gts.length})</button><button class="tab ${tab === 'hop' ? 'on' : ''}" data-datab="hop" role="tab">Lịch họp</button></div>`;
  if (tab === 'hop') {
    const hs = S.hop.filter(h => h.da === a.id).sort((x, y) => y.luc.localeCompare(x.luc));
    return head + `<section class="panel"><div class="panel-h"><h2>Lịch họp</h2>${can('themCV', a.id) ? `<button class="btn sm pri" data-act="hop-new">+ Thêm cuộc họp</button>` : ''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Địa điểm</th><th>Gói thầu</th><th></th></tr></thead><tbody>
    ${hs.map(h => `<tr><td class="date">${d(h.luc.slice(0, 10))} ${h.luc.slice(11, 16)}</td><td><b>${esc(h.ten)}</b></td><td>${esc(h.diaDiem)}</td><td>${esc(gtById(h.gt)?.ma || '—')}</td><td>${can('themCV', a.id) ? `<button class="btn sm" data-act="hop-edit" data-id="${h.id}">Sửa</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có cuộc họp. Khi tạo Giấy mời họp, cuộc họp được thêm vào đây để nhắc.</td></tr>'}
    </tbody></table></div></section>`;
  }
  if (tab === 'goithau') return head + `<section class="panel"><div class="panel-h"><h2>Gói thầu</h2><div class="row" style="flex-wrap:wrap"><button class="btn" data-act="xl-tpl" data-scope="da:${a.id}">Tải mẫu Excel</button>${can('suaGT', a.id) ? `<button class="btn" data-act="xl-imp">Nhập từ Excel</button><button class="btn pri" data-act="gt-new">+ Thêm gói thầu</button>` : ''}</div></div>
  <div class="tbl-wrap"><table><thead><tr><th>Gói thầu</th><th>Nhà thầu</th>${can('xemTC') ? '<th class="r">Giá trị HĐ</th><th class="r">Đã nghiệm thu</th>' : ''}<th>Bảo hành</th><th>Tiến độ việc</th></tr></thead><tbody>
  ${gts.map(g => { const t = tc(g.id); const cv = S.congViec.filter(c => c.gt === g.id); const xong = cv.filter(c => c.tt === 'Hoàn thành').length;
    return `<tr class="click" data-gt="${g.id}"><td><b>${esc(g.ma)}</b> ${esc(g.ten)}<div class="muted">${g.hd ? 'HĐ ' + esc(g.hd) : 'Chưa nhập số hợp đồng'}</div></td><td>${esc(ntById(g.nt).ten)}</td>${can('xemTC') ? `<td class="r num">${vnd(g.gt)}</td><td class="r num">${g.gt ? Math.round(t.daNT / g.gt * 100) : 0}%</td>` : ''}<td>${pill(g.bh?.ht || 'Không có', g.bh?.ht === 'Giữ tiền' ? 'info' : g.bh?.ht === 'Nộp bảo lãnh' ? 'good' : '')}</td><td class="num">${xong}/${cv.length} xong</td></tr>`; }).join('') || `<tr><td colspan="6" class="empty">Chưa có gói thầu.</td></tr>`}
  </tbody></table></div></section>`;
  const cvs = cvOfDA(a.id);
  const n = k => cvs.filter(c => cat(c) === k).length;
  const xong = n('xong'); const tre = cvs.filter(c => c.tt === 'Hoàn thành' ? c.xong > c.goc : days(c.goc) < 0).length;
  if (!gts.length) return head + `<div class="empty-big">${ic('build')}<h2>Dự án chưa có gói thầu</h2><p class="muted">Thêm gói thầu, rồi thêm công việc từ thư viện cho từng gói.</p>${can('suaGT', a.id) ? `<div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn" data-act="xl-tpl" data-scope="da:${a.id}">Tải mẫu Excel</button><button class="btn" data-act="xl-imp">Nhập từ Excel</button><button class="btn pri" data-act="gt-new">+ Thêm gói thầu</button></div>` : ''}</div>`;
  return head + `<div class="kv" style="grid-template-columns:repeat(5,minmax(0,1fr))">
    <div><span>Tổng công việc</span><b>${cvs.length}</b></div>
    <div><span>Đã xong</span><b>${xong} · ${cvs.length ? Math.round(xong / cvs.length * 100) : 0}%</b></div>
    <div><span>Quá hạn</span><b style="color:var(--bad)">${n('quahan')}</b></div>
    <div><span>Sắp đến hạn</span><b style="color:var(--warn)">${n('saphan')}</b></div>
    <div><span>Trễ so với hạn gốc</span><b>${tre}</b></div></div>
  <section class="panel"><div class="panel-h"><h2>Tiến độ theo gói thầu</h2>${legend()}</div>
  <div class="panel-b list">${gts.map(g => { const cv = S.congViec.filter(c => c.gt === g.id); const k = x => cv.filter(c => cat(c) === x).length; const q = k('quahan');
    return `<div class="li"><div class="grow" style="flex-basis:280px"><div class="t"><button class="linkbtn" data-gt="${g.id}">${esc(g.ma)} · ${esc(g.ten)}</button></div><div class="muted">${esc(ntById(g.nt).ten)} · ${k('xong')}/${cv.length} xong${q ? ` · <b style="color:var(--bad)">${q} quá hạn</b>` : ''}</div></div>
    <div style="flex:2 1 260px">${stack(cv)}</div>
    ${q ? `<button class="btn sm" data-gt="${g.id}" data-pfgo="quahan">Xem ${q} việc quá hạn</button>` : `<span class="muted" style="width:150px">Không có việc quá hạn</span>`}</div>`; }).join('')}</div></section>
  ${cvs.length ? `<section class="panel"><div class="panel-h"><h2>Bảng tiến độ</h2><div class="row muted" style="gap:14px;font-size:12px"><span><i class="mk-l goc"></i>Hạn gốc</span><span><i class="mk-l hh"></i>Hạn hiện hành</span><span><i class="mk-l xong"></i>Ngày xong</span><span><i class="mk-l ext"></i>Phần gia hạn</span><span><i class="mk-l today"></i>Hôm nay</span></div></div>
  <div class="tbl-wrap">${timeline(gts, cvs)}</div></section>` : ''}`;
};
function timeline(gts, cvs) {
  const T0 = today();
  const ds = cvs.flatMap(c => [c.goc, c.hh, c.xong].filter(Boolean)).concat([T0]).sort();
  const lo0 = addDays(ds[0], -3), lo = lo0 > addDays(T0, -35) ? lo0 : addDays(T0, -35), hi = addDays(ds[ds.length - 1], 4);
  const inR = s => s && s >= lo;
  const span = Math.max(1, (new Date(hi) - new Date(lo)) / 864e5);
  const X = s => ((new Date(s) - new Date(lo)) / 864e5 / span * 100).toFixed(2) + '%';
  const step = span > 240 ? 56 : span > 120 ? 28 : span > 60 ? 14 : 7; const ticks = []; for (let t = addDays(lo, 3); t < hi; t = addDays(t, step)) ticks.push(t);
  const near = t => Math.abs((new Date(t) - new Date(T0)) / 864e5) < step * 0.45;
  const todayM = `<span class="tl-today" style="left:${X(T0)}"></span>`;
  const grid = ticks.map(t => `<span class="tl-tick" style="left:${X(t)}"></span>`).join('');
  const rows = gts.map(g => { const cv = cvs.filter(c => c.gt === g.id).sort((a, b) => (a.goc || '').localeCompare(b.goc || ''));
    if (!cv.length) return '';
    return `<div class="tl-row tl-grp"><div class="tl-name"><button class="linkbtn" data-gt="${g.id}">${esc(g.ma)} · ${esc(g.ten)}</button></div><div class="tl-track">${grid}${todayM}</div></div>` +
      cv.map(c => { const k = cat(c); const end = c.xong || c.hh;
        return `<div class="tl-row"><div class="tl-name" title="${esc(c.ten)}">${esc(c.ten)}</div><div class="tl-track">${grid}${todayM}
      ${end > c.goc && inR(end) ? `<span class="tl-ext" style="left:${X(inR(c.goc) ? c.goc : lo)};width:calc(${X(end)} - ${X(inR(c.goc) ? c.goc : lo)})"></span>` : ''}
      ${inR(c.goc) ? `<span class="mk goc" style="left:${X(c.goc)}" title="Hạn gốc ${d(c.goc)}"></span>` : ''}
      ${(c.hh !== c.goc || k !== 'xong') && inR(c.hh) ? `<span class="mk hh ${k}" style="left:${X(c.hh)}" title="Hạn hiện hành ${d(c.hh)}"></span>` : ''}
      ${inR(c.xong) ? `<span class="mk xong" style="left:${X(c.xong)}" title="Xong ${d(c.xong)}"></span>` : ''}
      ${!inR(end) ? `<span class="tl-old">xong ${d(end)}</span>` : ''}</div></div>`; }).join(''); }).join('');
  return `<div class="tl"><div class="tl-row tl-head"><div class="tl-name muted">Công việc</div><div class="tl-track">${ticks.filter(t => !near(t)).map(t => `<span class="tl-lab" style="left:${X(t)}">${t.slice(8, 10)}/${t.slice(5, 7)}</span>`).join('')}<span class="tl-lab now" style="left:${X(T0)}">Hôm nay</span></div></div>${rows}</div>`;
}

/* ---------- Gói thầu ---------- */
V.goithau = () => {
  const g = gtById(S.gtSel); if (!g) { S.view = 'duan'; return V.duan(); }
  const t = tc(g.id);
  const tabs = [['congviec', 'Công việc'], ['dexuat', 'Điều chỉnh tiến độ'], ['taichinh', 'Tài chính', can('xemTC')], ['baohanh', 'Bảo hành'], ['quyettoan', 'Quyết toán', can('xemTC')], ['bangiao', 'Bàn giao']].filter(x => x[2] !== false);
  if (!tabs.some(x => x[0] === S.tab)) S.tab = 'congviec';
  const n = ntById(g.nt);
  return `<div class="head"><div><h1>${esc(g.ma)} · ${esc(g.ten)}</h1><p class="sub">${esc(n.ten)}${g.hd ? ' · HĐ ' + esc(g.hd) : ''}${g.ngayKy ? ' ký ' + d(g.ngayKy) : ''}</p></div>
    <div class="row">${can('suaGT', g.da) ? `<button class="btn" data-act="gt-edit" data-id="${g.id}">Sửa hợp đồng</button>` : ''}</div></div>${roBanner(g.da)}
  ${can('xemTC') ? `<div class="kv"><div><span>Giá trị hợp đồng</span><b>${vnd(g.gt)}</b></div><div><span>Đã nghiệm thu</span><b>${vnd(t.daNT)}</b></div><div><span>Đã thanh toán</span><b>${vnd(t.daTT)}</b></div><div><span>Công nợ</span><b style="color:${t.congNo > 0 ? 'var(--warn)' : 'inherit'}">${vnd(t.congNo)}</b></div></div>` : ''}
  <div class="tabs" role="tablist">${tabs.map(x => `<button class="tab ${S.tab === x[0] ? 'on' : ''}" data-tab="${x[0]}" role="tab">${x[1]}</button>`).join('')}</div>
  ${T[S.tab](g)}`;
};
T.congviec = g => {
  const allG = S.congViec.filter(c => c.gt === g.id); const pf = S.pf || 'all'; const cv = allG.filter(FILTERS[pf][1]).sort((a, b) => ((+a.stt || 1e9) - (+b.stt || 1e9)) || (a.hh || '').localeCompare(b.hh || ''));
  const add = can('themCV', g.da);
  return `<section class="panel"><div class="panel-h"><h2>${pf === 'all' ? 'Công việc' : FILTERS[pf][0]} <span class="muted">(${cv.length})</span></h2><div class="row" style="flex-wrap:wrap"><button class="btn" data-act="xl-tpl" data-scope="gt:${g.id}">Tải mẫu Excel (kèm việc hiện có)</button>${add ? `<button class="btn" data-act="xl-imp">Nhập / cập nhật từ Excel</button><button class="btn" data-act="quet">Quét thư viện</button><button class="btn" data-act="cv-new">+ Việc ngoài thư viện</button>` : ''}${can('dcHan', g.da) ? `<button class="btn" data-tab="dexuat">Điều chỉnh hạn</button>` : ''}</div></div>
  <div class="panel-b" style="padding-bottom:0">${chips(allG, pf, 'data-pf')}</div>
  <div class="tbl-wrap"><table><thead><tr><th>Công việc</th><th>Người phụ trách</th><th>Hạn gốc</th><th>Hạn hiện hành</th><th>Trạng thái</th><th>Hạn</th><th></th></tr></thead><tbody>
  ${cv.map(c => `<tr class="click" data-cv="${c.id}"><td>${c.nhom ? `<div class="muted">${esc(c.nhom)}</div>` : ''}<b>${esc(c.ten)}</b>${c.pb ? `<div class="muted">Đã điều chỉnh ${c.pb} lần</div>` : ''}${(c.notes || []).length ? `<div class="muted">${c.notes.length} ghi chú</div>` : ''}</td><td>${esc(c.nguoi)}</td><td class="date">${d(c.goc)}</td><td class="date">${c.hh !== c.goc ? `<b>${d(c.hh)}</b>` : d(c.hh)}</td><td>${pill(c.tt)}${c.tt === 'Hoàn thành' ? `<div class="muted">ngày ${d(c.xong)}</div>` : ''}</td><td>${hanPill(c)}</td><td>${doneBtn(c)}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">${allG.length ? 'Không có việc nào trong nhóm này.' : 'Chưa có công việc. Bấm Quét thư viện, hoặc Tải mẫu Excel để nhập nhanh cả danh sách.'}</td></tr>`}
  </tbody></table></div></section>
  <p class="muted">Hạn gốc khóa sau khi tạo. Hạn hiện hành đổi qua Điều chỉnh tiến độ, mỗi lần đều lưu lịch sử để biết trễ bao nhiêu so với ban đầu. Bấm vào một công việc để xem chi tiết, ghi chú và ảnh hiện trường.</p>`;
};
T.dexuat = g => {
  const ds = S.deXuat.filter(x => x.gt === g.id).sort((a, b) => b.ngay.localeCompare(a.ngay));
  const mine = S.congViec.filter(c => c.gt === g.id && c.tt !== 'Hoàn thành').sort((a, b) => a.hh.localeCompare(b.hh));
  const ok = can('dcHan', g.da);
  return `${ok ? `<section class="panel"><div class="panel-h"><h2>Điều chỉnh hạn chót</h2><span class="muted">Áp dụng ngay, lưu thành một lần điều chỉnh</span></div>
  <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="form"><div class="field"><label for="ly-do">Lý do</label><input id="ly-do" placeholder="Ví dụ: CĐT chấp thuận gia hạn do mưa lớn kéo dài"></div>
    <div class="field"><label>Văn bản căn cứ (không bắt buộc)</label><div class="file"><span class="grow muted" id="f-dxvb-n">Chưa chọn tệp</span><input type="hidden" id="f-dxvb"><button class="btn sm" data-pickfile="dxvb">Chọn tệp</button></div></div></div>
    <div class="tbl-wrap"><table><thead><tr><th style="width:36px"></th><th>Công việc</th><th>Hạn gốc</th><th>Hạn hiện hành</th><th>Hạn mới</th></tr></thead><tbody>
    ${mine.map(c => `<tr><td><input type="checkbox" class="check" id="dx-${c.id}" data-dx="${c.id}"></td><td><label for="dx-${c.id}">${esc(c.ten)}</label></td><td class="date">${d(c.goc)}</td><td class="date">${d(c.hh)}</td><td><input type="date" id="dxd-${c.id}" value="${c.hh}" class="cell-in"></td></tr>`).join('') || `<tr><td colspan="5" class="empty">Không có việc đang làm.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="justify-content:flex-end"><button class="btn pri" data-act="dcsave">Lưu điều chỉnh</button></div>
  </div></section>` : ''}
  <section class="panel"><div class="panel-h"><h2>Lịch sử điều chỉnh</h2><span class="muted">${ds.length} lần</span></div><div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Công việc</th><th>Hạn cũ → hạn mới</th><th>Lý do</th><th>Người điều chỉnh</th><th>Văn bản</th></tr></thead><tbody>
  ${ds.map(x => x.dong.map((r, k) => `<tr><td class="date">${k === 0 ? d(x.ngay) : ''}</td><td>${esc(cvById(r.cv)?.ten || '(đã xóa)')}</td><td class="date"><span class="strike">${d(r.cu)}</span><span class="arrow">→</span><b>${d(r.moi)}</b></td><td>${k === 0 ? esc(x.lyDo) : ''}</td><td>${k === 0 ? esc(x.nguoi) : ''}</td><td>${k === 0 ? fileBtn(x.vb) : ''}</td></tr>`).join('')).join('') || `<tr><td colspan="6" class="empty">Chưa điều chỉnh lần nào.</td></tr>`}
  </tbody></table></div></section>`;
};
T.taichinh = g => {
  const rows = ntRows(g.id); const t = tc(g.id); const w = can('ghiTC', g.da), fix = can('suaTC', g.da);
  return `<section class="panel"><div class="panel-h"><h2>Tạm ứng</h2>${w ? `<button class="btn sm" data-act="tu-new">+ Ghi tạm ứng</button>` : ''}</div>
  <div class="tbl-wrap"><table><thead><tr><th>Lần</th><th>Ngày</th><th class="r">Số tiền</th><th>Chứng từ</th><th></th></tr></thead><tbody>
  ${(g.tamUng || []).map((x, i) => `<tr><td>${x.lan}</td><td class="date">${d(x.ngay)}</td><td class="r num">${vnd(x.tien)}</td><td>${esc(x.ct)} ${fileBtn(x.tep)}</td><td>${fix ? `<button class="btn sm" data-act="tu-edit" data-i="${i}">Sửa</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">Chưa ghi tạm ứng.</td></tr>`}
  </tbody></table></div>
  <div class="panel-b" style="border-top:1px solid var(--line)"><span class="muted">Tỷ lệ thu hồi mỗi đợt nghiệm thu: <b>${Math.round((g.tlThuHoi || 0) * 100)}%</b> · Đã thu hồi ${vnd(t.thuHoi)} · Còn lại <b>${vnd(t.tuCon)}</b></span></div></section>
  <section class="panel"><div class="panel-h"><h2>Nghiệm thu và thanh toán</h2>${w ? `<div class="row"><button class="btn sm" data-act="tt-new" ${rows.length ? '' : 'disabled'}>+ Ghi thanh toán</button><button class="btn sm pri" data-act="nt-new">+ Đợt nghiệm thu</button></div>` : ''}</div>
  <div class="tbl-wrap"><table><thead><tr><th>Đợt</th><th>Ngày NT</th><th class="r">Giá trị NT</th><th class="r">Trừ tạm ứng</th><th class="r">Giữ bảo hành</th><th class="r">Đề nghị TT</th><th class="r">Đã trả</th><th>Hạn trả</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${rows.map(x => `<tr><td>${x.dot}</td><td class="date">${d(x.ngay)}</td><td class="r num">${vnd(x.gtri)}</td><td class="r num">−${vnd(x.khauTru)}</td><td class="r num">${x.giu ? '−' + vnd(x.giu) : '—'}</td><td class="r num"><b>${vnd(x.deNghi)}</b></td><td class="r num">${vnd(x.daTra)}</td><td class="date">${d(x.han)}</td><td>${pill(x.tt)}</td><td class="nowrap">${fileBtn(x.bb, 'Biên bản')}${fix ? `<button class="btn sm" data-act="nt-edit" data-id="${x.id}">Sửa</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="10" class="empty">Chưa có đợt nghiệm thu.</td></tr>`}
  </tbody></table></div></section>
  ${S.thanhToan.some(p => rows.some(r => r.id === p.nt)) ? `<section class="panel"><div class="panel-h"><h2>Các lần chi trả</h2></div><div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Đợt</th><th class="r">Số tiền</th><th>Chứng từ</th><th></th></tr></thead><tbody>
  ${S.thanhToan.filter(p => rows.some(r => r.id === p.nt)).sort((a, b) => a.ngay.localeCompare(b.ngay)).map(p => `<tr><td class="date">${d(p.ngay)}</td><td>Đợt ${rows.find(r => r.id === p.nt).dot}</td><td class="r num">${vnd(p.tien)}</td><td>${esc(p.ct)} ${fileBtn(p.tep)}</td><td>${fix ? `<button class="btn sm" data-act="tt-edit" data-id="${p.id}">Sửa</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></section>` : ''}
  <div class="kv"><div><span>Còn lại của hợp đồng</span><b>${vnd(t.conLaiHD)}</b></div><div><span>Tổng đã chi (tạm ứng + thanh toán)</span><b>${vnd(t.tu + t.daTT)}</b></div><div><span>Tiền giữ bảo hành</span><b>${vnd(t.giu)}</b></div><div><span>Công nợ</span><b>${vnd(t.congNo)}</b></div></div>
  ${w && !fix ? '<p class="muted">Bạn ghi thêm được các khoản mới. Sửa hoặc xóa khoản đã ghi cần Giám đốc hoặc Trưởng nhóm.</p>' : ''}`;
};
T.baohanh = g => {
  const b = g.bh || { ht: 'Không có' }; const t = tc(g.id); const ok = can('baoHanh', g.da);
  return `<section class="panel"><div class="panel-h"><h2>Bảo hành</h2>${ok ? `<button class="btn sm pri" data-act="bh-edit">Cập nhật bảo hành</button>` : ''}</div>
  <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="calc"><span>Hình thức</span><b>${esc(b.ht)}</b><span>Tỷ lệ theo hợp đồng</span><span>${((b.tl || 0) * 100).toLocaleString('vi-VN')}%</span><span>Hết thời gian bảo hành</span><span class="date">${d(b.hhBH)}</span>
    ${b.ht === 'Nộp bảo lãnh' ? `<span>Số thư bảo lãnh</span><span>${esc(b.so || '—')}</span><span>Ngân hàng</span><span>${esc(b.nh || '—')}</span><span>Giá trị bảo lãnh</span><span class="num">${vnd(b.gt)}</span><span>Thư hết hạn</span><span class="date">${d(b.hh)}${b.hh && days(b.hh) <= 60 ? ' ' + pill(days(b.hh) < 0 ? 'Đã hết hạn' : 'Còn ' + days(b.hh) + ' ngày', 'warn') : ''}</span><span>Tệp thư bảo lãnh</span><span>${fileBtn(b.thu) || '<span style="color:var(--bad)">Chưa có</span>'}</span>` : ''}
    ${b.ht === 'Giữ tiền' ? `<span>Đang giữ</span><b>${vnd(t.giu)}</b><span>Ngày hoàn trả tiền giữ</span><span class="date">${d(b.traNgay)}</span>${b.traTep ? `<span>Chứng từ hoàn trả</span><span>${fileBtn(b.traTep)}</span>` : ''}` : ''}</div>
    ${b.ht === 'Nộp bảo lãnh' ? '<div class="note">Nộp bảo lãnh nên <b>không giữ tiền</b> ở các đợt nghiệm thu. Phần mềm nhắc trước khi thư hết hạn theo quy tắc nhắc việc.</div>' : b.ht === 'Giữ tiền' ? `<div class="note">Mỗi đợt nghiệm thu tự giữ lại <b>${((b.tl || 0) * 100).toLocaleString('vi-VN')}%</b> giá trị nghiệm thu.</div>` : '<div class="note">Hợp đồng không quy định bảo hành bằng tiền hoặc thư bảo lãnh.</div>'}
  </div></section>`;
};
T.quyettoan = g => {
  const t = tc(g.id); const q = g.qt || null; const gtq = q?.gt ?? t.daNT;
  const giu = g.bh?.ht === 'Giữ tiền' ? gtq * (g.bh.tl || 0) : 0; const con = gtq - t.tu - t.daTT;
  const lap = can('lapQT', g.da) && !q?.chot, chot = can('chotQT', g.da);
  return `<section class="panel"><div class="panel-h"><h2>Quyết toán hợp đồng</h2>${pill(q?.chot ? 'Đã chốt quyết toán' : q ? 'Đang lập quyết toán' : 'Chưa quyết toán', q?.chot ? 'good' : q ? 'warn' : '')}</div>
  <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="calc"><span>Giá trị quyết toán${q ? '' : ' (tạm tính = đã nghiệm thu)'}</span><span class="num">${vnd(gtq)}</span><span>Đã tạm ứng</span><span class="num">−${vnd(t.tu)}</span><span>Đã thanh toán các đợt</span><span class="num">−${vnd(t.daTT)}</span><span class="tot">Còn phải trả nhà thầu</span><span class="num tot">${vnd(con)}</span><span class="muted">trong đó trả ngay khi quyết toán</span><span class="num">${vnd(Math.max(con - giu, 0))}</span><span class="muted">trong đó giữ đến hết bảo hành</span><span class="num">${giu ? vnd(Math.min(giu, Math.max(con, 0))) : '—'}</span>
    ${q ? `<span>Ngày phê duyệt</span><span class="date">${d(q.ngay)}</span><span>Người lập</span><span>${esc(q.nguoi || '')}</span>${q.chot ? `<span>Người chốt</span><span>${esc(q.nguoiChot || '')}</span>` : ''}` : ''}</div>
    ${q?.tep ? `<div>${fileBtn(q.tep, 'Mở hồ sơ quyết toán')}</div>` : ''}
    <div class="row" style="justify-content:flex-end">${lap ? `<button class="btn ${q ? '' : 'pri'}" data-act="qt-edit">${q ? 'Sửa quyết toán' : 'Lập quyết toán'}</button>` : ''}${chot && q && !q.chot ? `<button class="btn pri" data-act="qt-chot">Chốt quyết toán</button>` : ''}${chot && q?.chot ? `<button class="btn" data-act="qt-mo">Mở lại để sửa</button>` : ''}</div>
  </div></section>
  <p class="muted">Giá trị hợp đồng ${vnd(g.gt)} · đã nghiệm thu ${vnd(t.daNT)}. Tiền giữ bảo hành trả khi hết thời gian bảo hành (${d(g.bh?.hhBH)}). ${q && !q.chot ? 'Quyết toán đang lập, Giám đốc hoặc Trưởng nhóm chốt để khóa số liệu.' : ''}</p>`;
};
T.bangiao = g => {
  const ls = S.banGiao.filter(x => x.gt === g.id).sort((a, b) => b.ngay.localeCompare(a.ngay)); const ok = can('themCV', g.da) || can('ghiTC', g.da);
  return `<section class="panel"><div class="panel-h"><h2>Lịch sử bàn giao</h2>${ok ? `<button class="btn sm pri" data-act="bg-new">+ Ghi bàn giao</button>` : ''}</div>
  <div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Nội dung</th><th>Bên giao → Bên nhận</th><th>Biên bản</th><th></th></tr></thead><tbody>
  ${ls.map(x => `<tr><td class="date">${d(x.ngay)}</td><td>${esc(x.nd)}</td><td>${esc(x.giao)} → ${esc(x.nhan)}</td><td>${fileBtn(x.tep)}</td><td>${ok ? `<button class="btn sm" data-act="bg-edit" data-id="${x.id}">Sửa</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa ghi bàn giao.</td></tr>'}
  </tbody></table></div></section>
  <p class="muted">Lập biên bản bàn giao từ mục Biên bản mẫu, rồi đính kèm bản đã ký vào đây.</p>`;
};

/* ---------- Việc cần làm ---------- */
V.viec = () => {
  const f = S.vf || 'mo'; const act = new Set(visibleDA().map(a => a.id));
  const all = S.congViec.filter(c => act.has(gtOf(c).da));
  const mineOnly = S.vMine && S.lic?.name; const base = mineOnly ? all.filter(c => c.nguoi === S.lic.name) : all;
  const cv = base.filter(FILTERS[f][1]).sort((a, b) => (a.hh || '').localeCompare(b.hh || ''));
  return `<div class="head"><div><h1>${FILTERS[f][0]}</h1><p class="sub">${cv.length} việc · tính đến ${d(today())}, sắp theo hạn</p></div><label class="rp-l"><input type="checkbox" class="check" data-act="vmine" ${S.vMine ? 'checked' : ''}>Chỉ việc giao cho tôi</label></div>
  ${chips(base, f, 'data-vf')}
  <section class="panel tbl-wrap"><table><thead><tr><th>Công việc</th><th>Dự án · gói thầu</th><th>Người phụ trách</th><th>Hạn hiện hành</th><th>Tình trạng</th><th></th></tr></thead><tbody>
  ${cv.map(c => { const g = gtOf(c); return `<tr class="click" data-cv="${c.id}"><td><b>${esc(c.ten)}</b></td><td>${esc(daOf(g).ten)}<div class="muted">${esc(g.ma)} · ${esc(g.ten)}</div></td><td>${esc(c.nguoi)}</td><td class="date">${d(c.hh)}</td><td>${hanPill(c)}</td><td>${doneBtn(c)}</td></tr>`; }).join('') || `<tr><td colspan="6" class="empty">Không có việc nào trong nhóm này.</td></tr>`}
  </tbody></table></section>`;
};

/* ---------- Tài chính ---------- */
V.taichinh = () => {
  const act = new Set(visibleDA().map(a => a.id));
  const rows = S.goiThau.filter(g => act.has(g.da)).map(g => ({ g, t: tc(g.id) }));
  const s = k => rows.reduce((a, r) => a + r.t[k], 0);
  return `<div class="head"><div><h1>Tài chính hợp đồng</h1><p class="sub">Tổng hợp theo gói thầu, mọi dự án</p></div>${can('bcTC') ? '<button class="btn" data-act="tc-xlsx">Xuất Excel</button>' : ''}</div>
  ${cnPanel()}
  <div class="kv"><div><span>Tổng giá trị hợp đồng</span><b>${vnd(s('gt'))}</b></div><div><span>Đã nghiệm thu</span><b>${vnd(s('daNT'))}</b></div><div><span>Tạm ứng còn phải thu hồi</span><b>${vnd(s('tuCon'))}</b></div><div><span>Công nợ</span><b style="color:var(--warn)">${vnd(s('congNo'))}</b></div></div>
  <section class="panel tbl-wrap"><table><thead><tr><th>Gói thầu</th><th>Nhà thầu</th><th class="r">Giá trị HĐ</th><th class="r">Đã nghiệm thu</th><th class="r">Đã thanh toán</th><th class="r">Tạm ứng còn lại</th><th class="r">Giữ bảo hành</th><th class="r">Công nợ</th><th>Cảnh báo</th></tr></thead><tbody>
  ${rows.map(({ g, t }) => `<tr class="click" data-gt="${g.id}" data-tabgo="taichinh"><td><b>${esc(g.ma)}</b> ${esc(g.ten)}<div class="muted">${esc(daOf(g).ten)}</div></td><td>${esc(ntById(g.nt).ten)}</td><td class="r num">${vnd(t.gt)}</td><td class="r num">${vnd(t.daNT)}</td><td class="r num">${vnd(t.daTT)}</td><td class="r num">${vnd(t.tuCon)}</td><td class="r num">${t.giu ? vnd(t.giu) : (g.bh?.ht === 'Nộp bảo lãnh' ? '<span class="muted">Thư BL</span>' : '—')}</td><td class="r num"><b>${vnd(t.congNo)}</b></td><td>${t.quaHan ? pill(t.quaHan + ' đợt quá hạn', 'bad') : pill('Ổn', 'good')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Chưa có gói thầu.</td></tr>'}
  </tbody></table></section>`;
};

/* ---------- Nhà thầu & đơn vị ---------- */
V.nhathau = () => {
  const ok = can('nhaThau');
  const ppl = x => (x.nguoi || []).map(p => esc(p.ten) + (p.cv ? ` <span class="muted">· ${esc(p.cv)}</span>` : '')).join('<br>');
  return `<div class="head"><div><h1>Nhà thầu & đơn vị</h1><p class="sub">Dùng để chọn nhà thầu cho gói thầu và chọn thành phần khi lập biên bản</p></div>${ok ? '<div class="row"><button class="btn" data-act="db-new">+ Đơn vị khác</button><button class="btn pri" data-act="ntc-new">+ Nhà thầu</button></div>' : ''}</div>
  <section class="panel"><div class="panel-h"><h2>Nhà thầu</h2><span class="muted">${S.nhaThau.length}</span></div><div class="tbl-wrap"><table><thead><tr><th>Nhà thầu</th><th>Người đại diện, liên hệ</th><th>Email, điện thoại</th><th>Gói thầu</th></tr></thead><tbody>
  ${S.nhaThau.map(n => `<tr class="${ok ? 'click' : ''}" ${ok ? `data-act="ntc-edit" data-id="${n.id}"` : ''}><td><b>${esc(n.ten)}</b><div class="muted">${esc(n.dc)}</div></td><td>${ppl(n)}</td><td>${esc(n.email)}<div class="muted">${esc(n.sdt)}</div></td><td>${S.goiThau.filter(g => g.nt === n.id).map(g => esc(g.ma)).join(', ')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có nhà thầu.</td></tr>'}
  </tbody></table></div></section>
  <section class="panel"><div class="panel-h"><h2>Đơn vị khác</h2><span class="muted">Tư vấn giám sát, thiết kế, cơ quan quản lý...</span></div><div class="tbl-wrap"><table><thead><tr><th>Đơn vị</th><th>Loại</th><th>Người</th></tr></thead><tbody>
  ${S.danhBa.map(n => `<tr class="${ok ? 'click' : ''}" ${ok ? `data-act="db-edit" data-id="${n.id}"` : ''}><td><b>${esc(n.ten)}</b><div class="muted">${esc(n.dc)}</div></td><td>${esc(n.loai)}</td><td>${ppl(n)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Chưa có đơn vị nào.</td></tr>'}
  </tbody></table></div></section>`;
};

/* ---------- Thư viện công việc ---------- */
V.thuvien = () => {
  const ok = can('thuVien');
  return `<div class="head"><div><h1>Thư viện công việc chuẩn</h1><p class="sub">Dùng khi Quét thư viện trong gói thầu; số ngày dùng để gợi ý hạn</p></div>${ok ? '<button class="btn pri" data-act="tv-new">+ Thêm mẫu</button>' : ''}</div>
  <section class="panel tbl-wrap"><table><thead><tr><th>Công việc</th><th>Nhóm</th><th class="r">Số ngày mặc định</th><th class="r">Đang dùng</th></tr></thead><tbody>
  ${[...S.thuVien].sort((a, b) => (a.nhom + a.ten).localeCompare(b.nhom + b.ten)).map(m => `<tr class="${ok ? 'click' : ''}" ${ok ? `data-act="tv-edit" data-id="${m.id}"` : ''}><td>${esc(m.ten)}</td><td>${pill(m.nhom, '')}</td><td class="r num">${m.ngay}</td><td class="r num">${S.congViec.filter(c => c.mau === m.id).length}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Thư viện trống.</td></tr>'}
  </tbody></table></section>`;
};

/* ---------- Biên bản mẫu ---------- */
V.bienban = () => {
  const L = S.bienBanMau;
  const nh = ['all', ...new Set([...BUILTIN_NHOM, ...L.map(b => b.nhom)])];
  const ord = x => { const i = BUILTIN_NHOM.indexOf(x.nhom); return (i < 0 ? 9 : i) + (x.builtin ? x.id : 'Z' + x.ten); };
  const list = L.filter(b => S.bbNhom === 'all' || b.nhom === S.bbNhom).sort((a, b) => ord(a).localeCompare(ord(b)));
  const ql = can('qlMau');
  return `<div class="head"><div><h1>Biên bản mẫu</h1><p class="sub">Tạo từ mẫu thì phần mềm tự điền tên dự án, gói thầu, nhà thầu, thành phần, ngày... rồi xuất Word để sửa tiếp.</p></div>
    ${ql ? '<div class="row"><button class="btn" data-act="bb-imp">Nạp file mẫu</button><button class="btn pri" data-act="bb-tpl">+ Tạo mẫu biên bản</button></div>' : ''}</div>
  <div class="chips">${nh.map(k => `<button class="chip ${k === S.bbNhom ? 'on' : ''}" data-bbn="${esc(k)}">${k === 'all' ? 'Tất cả' : esc(k)} <b>${k === 'all' ? L.length : L.filter(b => b.nhom === k).length}</b></button>`).join('')}</div>
  <div class="bbgrid">${list.map(b => `<div class="bbcard"><div class="row" style="justify-content:space-between"><span class="bbic">${ic('doc')}</span><span class="row" style="gap:4px">${b.builtin ? '' : pill('Của tôi', 'good')}${pill(b.nhom, '')}</span></div>
    <b>${esc(b.ten)}</b><span class="muted">${esc(b.mt || '')}</span>
    <div class="row" style="margin-top:auto">${can('taoBB') ? `<button class="btn sm pri" data-act="bb-new" data-id="${b.id}">Tạo biên bản</button>` : ''}<button class="btn sm" data-act="bb-dl" data-id="${b.id}">Tải về sửa</button>${ql ? `<button class="btn sm" data-act="bb-menu" data-id="${b.id}">Quản lý</button>` : ''}<span class="muted" style="margin-left:auto;font-size:11.5px">v${b.ver} · ${d(b.ngay)}</span></div></div>`).join('') || '<div class="empty">Chưa có mẫu.</div>'}</div>
  <div class="note" style="margin-top:12px"><b>Thư viện do bạn quản lý.</b> Đổi tên, xóa, thêm tùy ý. Nạp file Word có tên trùng với mẫu đã có (không phân biệt hoa thường, dấu, gạch dưới) thì phần mềm thay mẫu cũ bằng bản mới và giữ bản cũ trong lịch sử.</div>`;
};

/* ---------- Báo cáo ---------- */
V.baocao = () => {
  const r = S.rp; const valid = new Set(S.goiThau.map(g => g.id)); r.sel = r.sel.filter(x => valid.has(x));
  if (!can('bcTC')) r.loai = 'tiendo';
  const scope = rpScope(); const nGt = r.sel.length;
  const tree = visibleDA().map(a => { const gts = S.goiThau.filter(g => g.da === a.id); const on = gts.filter(g => r.sel.includes(g.id)).length;
    return `<div class="rp-da"><label class="rp-l"><input type="checkbox" class="check" data-rpda="${a.id}" ${gts.length && on === gts.length ? 'checked' : ''} ${gts.length ? '' : 'disabled'}><b>${esc(a.ten)}</b><span class="muted">${on}/${gts.length} gói</span></label>
      ${gts.map(g => `<label class="rp-l rp-gt"><input type="checkbox" class="check" data-rpgt="${g.id}" ${r.sel.includes(g.id) ? 'checked' : ''}>${esc(g.ma)} · ${esc(g.ten)}</label>`).join('')}</div>`; }).join('');
  const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" data-rp="${name}" value="${v}" ${v === cur ? 'checked' : ''}>${l}</label>`).join('')}</div>`;
  const quick = `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-rpq="all">Tất cả</button><button class="btn sm" data-rpq="none">Bỏ chọn</button></div>`;
  return `<div class="head"><div><h1>Báo cáo</h1><p class="sub">Chọn loại báo cáo, phạm vi (một gói, một dự án hay nhiều dự án) rồi xuất Excel hoặc bản in PDF</p></div></div>
  <div class="rp">
  <section class="panel rp-cfg"><div class="panel-b" style="display:flex;flex-direction:column;gap:16px">
    <div class="field"><label>Loại báo cáo</label>${seg('loai', can('bcTC') ? [['tiendo', 'Tiến độ'], ['taichinh', 'Tài chính, giải ngân'], ['tonghop', 'Cả hai']] : [['tiendo', 'Tiến độ']], r.loai)}${can('bcTC') ? '' : '<span class="muted" style="font-size:12px">Vai trò của bạn không xuất báo cáo tài chính</span>'}</div>
    ${r.loai !== 'taichinh' ? `<div class="field"><label>Mức chi tiết tiến độ</label>${seg('ct', [['tonghop', 'Tổng hợp theo gói'], ['chitiet', 'Chi tiết từng công việc']], r.ct)}
      ${r.ct === 'chitiet' ? `<select id="rp-loc" aria-label="Lọc công việc" class="cell-in" style="margin-top:6px">${[['all', 'Tất cả công việc'], ['mo', 'Chỉ việc chưa xong'], ['quahan', 'Chỉ việc quá hạn'], ['tre', 'Việc trễ hoặc đã lùi hạn']].map(([v, l]) => `<option value="${v}" ${v === r.loc ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="rpcols"><span class="muted">Cột hiển thị:</span>${RPCOLS.map(([k, l]) => `<label class="rp-l"><input type="checkbox" class="check" data-rpc="${k}" ${r.cols[k] ? 'checked' : ''}>${l}</label>`).join('')}</div>` : ''}</div>` : ''}
    <div class="field"><label>Phạm vi · đã chọn ${nGt} gói thầu thuộc ${scope.length} dự án</label>${quick}<div class="rp-tree">${tree || '<span class="muted">Chưa có dự án.</span>'}</div></div>
    <div class="grid-f"><div class="field"><label for="rp-tu">Từ ngày</label><input id="rp-tu" type="date" value="${r.tu}" data-rpv="tu"></div><div class="field"><label for="rp-den">Đến ngày</label><input id="rp-den" type="date" value="${r.den}" data-rpv="den"></div></div>
    <div class="field"><label>Định dạng</label>${seg('fmt', [['xlsx', 'Excel (.xlsx)'], ['pdf', 'Bản in (PDF, A4)']], r.fmt)}</div>
    ${r.fmt === 'xlsx' ? `<label class="rp-l"><input type="checkbox" class="check" data-rpb="sheet" ${r.sheet ? 'checked' : ''}>Mỗi gói thầu một trang tính (sheet), thêm trang Tổng hợp</label>` : ''}
    <label class="rp-l"><input type="checkbox" class="check" data-rpb="ky" ${r.ky ? 'checked' : ''}>Kèm khung chữ ký người lập, người duyệt</label>
    <div class="row"><button class="btn pri" data-act="rp-export" ${nGt ? '' : 'disabled'}>Xuất ${r.fmt === 'xlsx' ? 'Excel' : 'bản in'}</button></div>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>Xem trước</h2><span class="muted">${r.fmt === 'xlsx' ? 'Trang Tổng hợp' : 'Trang 1'}</span></div><div class="panel-b">${nGt ? rpPreview(scope) : '<div class="empty">Chọn ít nhất một gói thầu.</div>'}</div></section>
  </div>`;
};

/* ---------- Nhắc việc ---------- */
V.nhacviec = () => {
  const n = S.nh; const tg = (k, l, h) => `<label class="tgl"><input type="checkbox" data-nh="${k}" ${n[k] ? 'checked' : ''}><span class="sw2"></span><span><b>${l}</b>${h ? `<span class="muted">${h}</span>` : ''}</span></label>`;
  const sel = (i, f, opts, cur) => `<select data-nr="${i},${f}" aria-label="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const rules = n.rules.map((r, i) => `<div class="rule ${r.on ? '' : 'off'}">
    <label class="tgl sm"><input type="checkbox" data-nr="${i},on" ${r.on ? 'checked' : ''} aria-label="Bật quy tắc"><span class="sw2"></span></label>
    <div class="rule-b"><div class="rule-l">Khi ${sel(i, 'su', Object.entries(NSU), r.su)}
      ${r.su === 'cvqh' ? '<span>báo</span>' : `<span>báo trước</span><input type="number" min="0" value="${r.truoc}" data-nr="${i},truoc" aria-label="Số" class="num-in">${sel(i, 'dv', r.su === 'hop' ? [['giờ', 'giờ'], ['ngày', 'ngày']] : [['ngày', 'ngày']], r.dv)}`}
      ${r.dv === 'giờ' && r.su === 'hop' ? '' : `<span>lúc</span><input type="time" value="${r.gio}" data-nr="${i},gio" aria-label="Giờ báo">`}</div>
      <div class="rule-l"><span>Phạm vi</span>${sel(i, 'pham', [['all', 'Tất cả dự án'], ['mine', 'Chỉ việc giao cho tôi'], ...S.duAnList.map(a => [a.id, a.ten])], r.pham)}<span>Lặp</span>${sel(i, 'lap', [['Một lần', 'Một lần'], ['Mỗi ngày đến khi xong', 'Mỗi ngày đến khi xong'], ['Mỗi tuần', 'Mỗi tuần']], r.lap)}</div>
      <div class="rule-l">${NKENH.map(([k, l]) => `<label class="kchip ${r.kenh[k] ? 'on' : ''}"><input type="checkbox" data-nk="${i},${k}" ${r.kenh[k] ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
    <div class="rule-x"><button class="btn sm" data-act="nh-test" data-i="${i}">Thử</button><button class="btn sm ghost-bad" data-act="nh-del" data-i="${i}" aria-label="Xóa quy tắc">×</button></div></div>`).join('');
  return `<div class="head"><div><h1>Nhắc việc & thông báo</h1><p class="sub">Phần mềm chạy nền, tự hiện cảnh báo ở góc màn hình theo các quy tắc bạn đặt, kể cả khi đã đóng cửa sổ.</p></div>
    <button class="btn pri" data-act="nh-now">Kiểm tra và nhắc ngay</button></div>
  <div class="grid2">
  <section class="panel"><div class="panel-h"><h2>Chạy nền</h2></div><div class="panel-b nhs">
    ${tg('autostart', 'Tự khởi động cùng máy tính', 'Mở máy là phần mềm chạy ngầm, không cần mở cửa sổ')}
    ${tg('tray', 'Đóng cửa sổ thì thu xuống khay hệ thống', 'Biểu tượng nằm cạnh đồng hồ (Windows) hoặc thanh menu (macOS). Muốn thoát hẳn: chuột phải vào biểu tượng, chọn Thoát hẳn')}
    ${tg('amThanh', 'Phát âm thanh khi có cảnh báo', '')}
    <div class="note">Thông báo dùng cơ chế có sẵn của Windows và macOS nên hiện cả khi đang làm việc ở phần mềm khác. Lần đầu, máy có thể hỏi cho phép hiện thông báo.</div></div></section>
  <section class="panel"><div class="panel-h"><h2>Bản tin hằng ngày và giờ yên tĩnh</h2></div><div class="panel-b nhs">
    ${tg('ban', 'Bản tin tổng hợp mỗi sáng', 'Gom việc quá hạn, việc sắp đến hạn, khoản sắp phải trả vào một cảnh báo')}
    <div class="grid-f"><div class="field"><label for="nh-bg">Giờ gửi</label><input id="nh-bg" type="time" value="${n.banGio}" data-nhv="banGio"></div><div class="field"><label for="nh-bn">Ngày</label><select id="nh-bn" data-nhv="banNgay">${['Thứ 2 – Thứ 6', 'Thứ 2 – Thứ 7', 'Mọi ngày'].map(x => `<option ${x === n.banNgay ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    ${tg('dnd', 'Không làm phiền ngoài giờ', 'Cảnh báo trong khoảng này được dồn lại, hiện lúc hết giờ yên tĩnh')}
    <div class="grid-f"><div class="field"><label for="nh-dt">Từ</label><input id="nh-dt" type="time" value="${n.dndTu}" data-nhv="dndTu"></div><div class="field"><label for="nh-dd">Đến</label><input id="nh-dd" type="time" value="${n.dndDen}" data-nhv="dndDen"></div></div></div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Quy tắc nhắc</h2><button class="btn sm pri" data-act="nh-add">+ Thêm quy tắc</button></div><div class="panel-b list">${rules || '<div class="empty">Chưa có quy tắc.</div>'}</div></section>
  <section class="panel"><div class="panel-h"><h2>Gửi qua Telegram và Email</h2><button class="btn sm" data-act="nh-kenh">Cài đặt kênh gửi</button></div><div class="panel-b"><span class="muted">Telegram: ${n.tg?.token && n.tg?.chat ? '<b style="color:var(--good)">đã cài</b>' : 'chưa cài'} · Email: ${n.mail?.host && n.mail?.to ? '<b style="color:var(--good)">đã cài</b>' : 'chưa cài'}. Cần mạng khi gửi; không có mạng thì chỉ hiện trên màn hình.</span></div></section>
  <section class="panel"><div class="panel-h"><h2>Đã nhắc gần đây</h2></div><div class="panel-b list">${(n.log || []).slice(0, 30).map(x => `<div class="li"><span class="date" style="min-width:110px">${esc(x.luc)}</span><div class="grow">${esc(x.t)}</div><span class="muted">${esc(x.k)}</span></div>`).join('') || '<div class="empty">Chưa nhắc lần nào.</div>'}</div></section>`;
};

/* ---------- Chia sẻ & đồng bộ ---------- */
V.dongbo = () => {
  const imp = S.imp; const fl = S.kv.follow || [];
  const exportable = S.duAnList.filter(a => !followed(a.id));
  const sel = S.exSel || (S.exSel = exportable.map(a => a.id));
  return `<div class="head"><div><h1>Chia sẻ & đồng bộ</h1><p class="sub">Dữ liệu nằm trên từng máy. Xuất ra một tệp .sodaan để chuyển sang máy khác; người nhận chọn chỉ theo dõi hoặc cập nhật tiếp rồi gửi lại.</p></div></div>
  <div class="steps">
    <div class="step"><b>1. Xuất</b><span class="muted">Chọn dự án, xuất ra một tệp .sodaan (gồm dữ liệu và tệp đính kèm).</span></div>
    <div class="step"><b>2. Gửi</b><span class="muted">Qua USB, ổ mạng, Google Drive, email hoặc Zalo.</span></div>
    <div class="step"><b>3. Nhận</b><span class="muted">Máy nhận gộp thay đổi. Chỗ hai bên cùng sửa thì bạn chọn giữ bản nào. Phần mềm tự sao lưu trước khi nhận.</span></div>
  </div>
  <div class="grid2">
  <section class="panel"><div class="panel-h"><h2>Xuất dữ liệu</h2></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    ${can('xuat') ? `<div class="field"><label>Dự án</label><div style="display:flex;flex-direction:column;gap:6px">${exportable.map(a => `<label class="row" style="gap:8px"><input type="checkbox" class="check" data-exda="${a.id}" ${sel.includes(a.id) ? 'checked' : ''}>${esc(a.ten)}</label>`).join('') || '<span class="muted">Chưa có dự án.</span>'}</div></div>
      <p class="muted" style="margin:0">Kèm theo danh mục nhà thầu, đơn vị, thư viện công việc và danh sách key đã thu hồi.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn pri" data-act="sync-export" ${sel.length ? '' : 'disabled'}>Chọn nơi lưu và xuất</button></div>`
      : '<div class="note">Vai trò Nhân viên không xuất dữ liệu. Thay đổi của bạn nằm trên máy này; Trưởng nhóm hoặc Giám đốc sẽ thu thập khi cần.</div>'}
    </div></section>
  <section class="panel"><div class="panel-h"><h2>Nhận dữ liệu</h2>${imp ? '<button class="btn sm" data-act="imp-reset">Làm lại</button>' : ''}</div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    ${!imp ? `<div class="file" style="padding:18px"><span class="grow muted">Chọn tệp .sodaan nhận được</span><button class="btn pri" data-act="imp-pick">Chọn tệp</button></div>
      <p class="muted" style="margin:0">Mỗi bản ghi có mã riêng và thời điểm sửa, nên nhận nhiều lần không bị nhân đôi.</p>` : impPreview(imp)}
    <h3>Dự án đang chỉ theo dõi</h3>
    <div class="list">${fl.map(id => { const a = daById(id); return a ? `<div class="li"><div class="grow"><div class="t">${esc(a.ten)}</div><div class="muted">Mỗi lần nhận bản mới thì dữ liệu được thay</div></div>${pill('Theo dõi', 'info')}${can('chonBan') ? `<button class="btn sm" data-act="takeover" data-id="${id}">Chuyển sang cập nhật tiếp</button>` : ''}</div>` : ''; }).join('') || '<div class="empty">Không có.</div>'}</div>
    </div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Lịch sử chia sẻ</h2></div><div class="tbl-wrap"><table><thead><tr><th>Thời điểm</th><th>Loại</th><th>Tệp</th><th>Nội dung</th></tr></thead><tbody>
  ${(S.kv.syncLog || []).map(l => `<tr><td class="date">${esc(l.luc)}</td><td>${esc(l.loai)}</td><td class="num">${esc(l.tep)}</td><td>${esc(l.kq)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có.</td></tr>'}
  </tbody></table></div></section>`;
};
function impPreview(imp) {
  if (imp.done) return `<div class="note"><b>Đã nhận xong.</b> ${imp.done}</div>`;
  const p = imp.pv, m = p.manifest || {};
  const projs = (m.projects || []);
  const CN = { duAnList: 'Dự án', goiThau: 'Gói thầu', congViec: 'Công việc', nghiemThu: 'Đợt nghiệm thu', thanhToan: 'Thanh toán', nhaThau: 'Nhà thầu', danhBa: 'Đơn vị', thuVien: 'Mẫu công việc', deXuat: 'Điều chỉnh hạn', hop: 'Cuộc họp', banGiao: 'Bàn giao', revoked: 'Key thu hồi' };
  const show = v => { const x = v.data || {}; if (v.deleted) return 'Đã xóa'; return [x.tt, x.hh && 'hạn ' + d(x.hh), x.xong && 'xong ' + d(x.xong), x.gtri && vnd(x.gtri), x.tien && vnd(x.tien), x.gt && typeof x.gt === 'number' && vnd(x.gt)].filter(Boolean).join(' · ') || x.ten || x.ma || ''; };
  return `<div class="note"><b>${esc(imp.name)}</b> · ${esc(m.by || '')}${m.role ? ' (' + esc({ GD: 'Giám đốc', TN: 'Trưởng nhóm', NV: 'Nhân viên' }[m.role] || m.role) + ')' : ''} xuất lúc ${esc(String(m.exported_at || '').replace('T', ' ').slice(0, 16))} · ${projs.length} dự án</div>
    ${projs.map(x => { const has = daById(x.id); return `<div class="li"><div class="grow"><div class="t">${esc(x.ten)}</div><div class="muted">${has ? (followed(x.id) ? 'Đang chỉ theo dõi trên máy này, sẽ thay bằng bản mới' : 'Đã có trên máy, gộp thay đổi') : 'Dự án mới với máy này'}</div></div>
      ${has ? '' : `<div class="seg"><label ${can('nhapGop') ? '' : 'class="dis"'}><input type="radio" name="im-${x.id}" data-immode="${x.id}" value="edit" ${imp.mode[x.id] === 'edit' ? 'checked' : ''} ${can('nhapGop') ? '' : 'disabled'}>Cập nhật tiếp</label><label><input type="radio" name="im-${x.id}" data-immode="${x.id}" value="view" ${imp.mode[x.id] === 'view' ? 'checked' : ''}>Chỉ theo dõi</label></div>`}</div>`; }).join('')}
    <div class="kv" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div><span>Thêm mới</span><b style="color:var(--good)">${p.add}</b></div><div><span>Cập nhật</span><b>${p.update + p.delete}</b></div><div><span>Không đổi</span><b>${p.same + p.keep}</b></div><div><span>Hai bên cùng sửa</span><b style="color:var(--warn)">${p.conflicts.length}</b></div></div>
    ${p.conflicts.map(c => `<div class="conflict"><div class="conflict-h">${esc(CN[c.coll] || c.coll)} “${esc(c.label)}”</div><div class="conflict-b">
      <label><input type="radio" name="cf-${esc(c.key)}" data-cf="${esc(c.key)}" value="mine" ${imp.picks[c.key] !== 'theirs' ? 'checked' : ''}><span><b>Giữ bản trên máy này</b><br>${esc(show(c.mine))}<br><span class="muted">${esc(c.mine.updated_by)} sửa ${esc(String(c.mine.updated_at).replace('T', ' ').slice(0, 16))}</span></span></label>
      <label><input type="radio" name="cf-${esc(c.key)}" data-cf="${esc(c.key)}" value="theirs" ${imp.picks[c.key] === 'theirs' ? 'checked' : ''}><span><b>Lấy bản nhận được</b><br>${esc(show(c.theirs))}<br><span class="muted">${esc(c.theirs.updated_by)} sửa ${esc(String(c.theirs.updated_at).replace('T', ' ').slice(0, 16))}</span></span></label></div></div>`).join('')}
    ${p.conflicts.length ? '<p class="muted" style="margin:0">Mặc định chọn bản sửa sau cùng.</p>' : ''}
    ${can('nhapGop') || projs.every(x => !daById(x.id) || followed(x.id)) ? `<div class="row" style="justify-content:flex-end"><button class="btn" data-act="imp-reset">Hủy</button><button class="btn pri" data-act="imp-do">Nhận dữ liệu</button></div>` : '<div class="note">Vai trò của bạn không gộp dữ liệu vào dự án đang có. Chỉ nhận được dự án mới ở chế độ theo dõi.</div>'}`;
}

/* ---------- Quản lý key ---------- */
V.keys = () => {
  const l = S.lic; const rev = new Set(S.revoked.map(r => r.serial));
  return `<div class="head"><div><h1>Quản lý key</h1><p class="sub">Cấp key cho Trưởng nhóm và Nhân viên. Mỗi key dùng trên một máy; thu hồi khi nghỉ việc hoặc đổi máy.</p></div><div class="row"><button class="btn" data-act="g-prov">Nhà cung cấp: cấp key Giám đốc</button>${l.can_issue ? '<button class="btn pri" data-act="key-new">+ Cấp key</button>' : ''}</div></div>
  <div class="kv"><div><span>Key của máy này</span><b>${ROLE_NAME[l.role]}</b></div><div><span>Hạn dùng</span><b>${d(l.exp)}</b></div><div><span>Đã cấp</span><b>${S.keys.length} key</b></div><div><span>Đã thu hồi</span><b>${S.keys.filter(k => rev.has(k.serial)).length} key</b></div></div>
  <section class="panel tbl-wrap"><table><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Mã key</th><th>Máy</th><th>Ngày cấp</th><th>Hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${[...S.keys].sort((a, b) => b.ngay.localeCompare(a.ngay)).map(k => { const r = rev.has(k.serial); return `<tr><td><b>${esc(k.ten)}</b><div class="muted">Cấp bởi ${esc(k.cap)}</div></td><td>${ROLE_NAME[k.role]}</td><td class="num">${esc(k.serial)}</td><td class="num">${esc(k.may || 'Máy bất kỳ (gắn khi kích hoạt)')}</td><td class="date">${d(k.ngay)}</td><td class="date">${d(k.exp)}</td>
    <td>${pill(r ? 'Đã thu hồi' : 'Đã cấp', r ? 'bad' : 'good')}</td><td class="nowrap"><button class="btn sm" data-act="key-show" data-id="${k.id}">Xem key</button>${r ? '' : `<button class="btn sm ghost-bad" data-act="key-rev" data-id="${k.id}">Thu hồi</button>`}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Chưa cấp key nào.</td></tr>'}
  </tbody></table></section>
  <div class="note" style="margin-top:12px"><b>Khóa cố định:</b> bộ cài chứa một khóa kiểm tra không bao giờ đổi, nên gia hạn, đổi máy, thu hồi chỉ là cấp key mới, không phải cài lại. Danh sách key thu hồi đi kèm mỗi lần chia sẻ dữ liệu; máy có key bị thu hồi nhận dữ liệu đó sẽ tự khóa.</div>`;
};

/* ---------- Cài đặt & nhật ký ---------- */
V.caidat = () => {
  const dv = donVi(); const l = S.lic;
  return `<div class="head"><div><h1>Cài đặt & nhật ký</h1><p class="sub">Thông tin đơn vị dùng để điền biên bản, báo cáo. Nhật ký ghi lại mọi thay đổi.</p></div></div>
  <div class="grid2">
  <section class="panel"><div class="panel-h"><h2>Đơn vị tư vấn QLDA (đơn vị mình)</h2>${can('caiDat') ? '<button class="btn sm" data-act="dv-edit">Sửa</button>' : ''}</div>
    <div class="panel-b"><div class="calc"><span>Tên đơn vị</span><b>${esc(dv.ten || '—')}</b><span>Địa chỉ</span><span>${esc(dv.dc || '—')}</span><span>Tỉnh/thành phố (in trên văn bản)</span><span>${esc(dv.tinh || '—')}</span><span>Cán bộ</span><span>${(dv.nguoi || []).map(p => esc(p.ten) + (p.cv ? ' · ' + esc(p.cv) : '')).join('<br>') || '—'}</span></div></div></section>
  <section class="panel"><div class="panel-h"><h2>Máy này</h2></div>
    <div class="panel-b"><div class="calc"><span>Người dùng</span><b>${esc(l.name)}</b><span>Vai trò</span><span>${ROLE_NAME[l.role]}</span><span>Mã máy</span><span class="num">${esc(l.machine)}</span><span>Hạn key</span><span class="date">${d(l.exp)}</span><span>Thư mục dữ liệu</span><span class="num" style="word-break:break-all">${esc(S.info?.dir || '')}</span><span>Sao lưu ra tệp gần nhất</span><span>${esc(S.kv.lastBackup || 'Chưa lần nào')}</span></div>
    <div class="row" style="margin-top:12px;flex-wrap:wrap">${can('saoLuu') ? '<button class="btn" data-act="backup">Sao lưu ra tệp...</button><button class="btn" data-act="restore">Khôi phục từ bản sao lưu...</button>' : ''}<button class="btn" data-act="opendir">Mở thư mục dữ liệu</button><button class="btn" data-act="lic">Thông tin kích hoạt</button></div></div></section>
  </div>
  ${can('nhatKy') ? `<section class="panel"><div class="panel-h"><h2>Nhật ký thay đổi</h2><span class="muted">200 thay đổi gần nhất</span></div><div class="tbl-wrap" id="clog"><div class="empty">Đang tải...</div></div></section>` : ''}`;
};
