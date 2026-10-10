// Các màn hình bản điện thoại. Mỗi hàm trả HTML; R.wide = màn hình rộng (Z Fold mở, máy tính bảng).
import { S, esc, vnd, ty, d, days, addDays, today, DOW, gtById, daById, ntById, cvById, cat, FILTERS, ntRows, tc, tamUngTong, ROLE_NAME, gtOf, daOf } from '../../src/core.js';
import { ic, chip, ddmm, hanChip, ttCls, stack, legend, bar, kvRow, fileBtn, empty } from './ui.js';
import { M } from './data.js';
import { DEV } from '../../src/developer.js';

export const R = { wide: false, route: [] };
export const m = { vf: 'quahan', pf: 'all', daf: 'dang', q: '', cnOpen: null, open: new Set(), ntSeg: 'nt', mine: false };
const go = h => `href="#/${h}"`;
const visibleDA = () => S.duAnList.filter(a => !a.luuTru);
const cvOfDA = id => { const g = new Set(S.goiThau.filter(x => x.da === id).map(x => x.id)); return S.congViec.filter(c => g.has(c.gt)); };
const pctOf = cv => cv.length ? Math.round(cv.filter(c => c.tt === 'Hoàn thành').length / cv.length * 100) : 0;
const where = c => { const g = gtOf(c); return `${esc(daOf(g).ten)} · ${esc(g.ma)}`; };
const fmtAt = s => { if (!s) return ''; const x = new Date(s); if (isNaN(x)) return s; return x.toTimeString().slice(0, 5) + ' ' + d(new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)); };
export const dataLine = () => M.meta ? `Dữ liệu đến ${fmtAt(M.meta.at)}, do ${esc(M.meta.by || 'không rõ')}${M.meta.role ? ' (' + (ROLE_NAME[M.meta.role] || M.meta.role) + ')' : ''} gửi` : 'Chưa có dữ liệu';
const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;
const h2 = (t, right = '') => `<div class="row sb"><h2 class="h2">${t}</h2>${right}</div>`;
const more = (h, t) => `<a class="more" ${go(h)}>${t}</a>`;
const top = (title, sub = '', back = '', extra = '') => `<header class="top">${back ? `<a class="back" ${go(back[0])}>${ic('back', 20)}${esc(back[1])}</a>` : ''}<div class="row sb" style="align-items:flex-start"><h1>${title}</h1>${extra}</div>${sub ? `<div class="mut">${sub}</div>` : ''}</header>`;
const noData = () => card(`<h2 class="h2">Chưa có dữ liệu</h2><p class="mut" style="margin:0">Trên máy tính, mở Sổ Dự Án, vào Chia sẻ &amp; đồng bộ, bấm Xuất dữ liệu. Gửi tệp .sodaan sang điện thoại rồi mở ở đây.</p><a class="btn pri" ${go('them/capnhat')}>Chọn tệp .sodaan</a>`);

/* ---------- công nợ ---------- */
const PCOL = ['#1E5FD0', '#7C5BD6', '#E8A23A', '#2A9D8F', '#C4497A', '#5B8C3A', '#B5562F'];
function cnAgg(gids) {
  const o = { gt: 0, daNT: 0, daTT: 0, thuHoi: 0, giu: 0, congNo: 0, qh: 0, quaHan: 0, tuCon: 0, tu: 0 };
  gids.forEach(id => { const t = tc(id); ['gt', 'daNT', 'daTT', 'thuHoi', 'giu', 'congNo', 'quaHan', 'tuCon', 'tu'].forEach(k => o[k] += t[k]);
    o.qh += ntRows(id).filter(r => r.tt === 'Quá hạn').reduce((a, r) => a + r.con, 0); });
  o.trongHan = o.congNo - o.qh; return o;
}
function cnBar(o) {
  const w = v => o.gt ? (v / o.gt * 100).toFixed(2) + '%' : '0';
  const seg = (v, c) => v > 0 ? `<i class="${c}" style="width:${w(v)}"></i>` : '';
  return `<div class="cb">${seg(o.daTT + o.thuHoi, 'tra')}${seg(o.giu, 'giu')}${seg(o.trongHan, 'nth')}${seg(o.qh, 'nqh')}</div>`;
}
const cnLegend = () => `<div class="lg"><span><i class="tra"></i>Đã thanh toán</span><span><i class="giu"></i>Giữ bảo hành</span><span><i class="nth"></i>Nợ trong hạn</span><span><i class="nqh"></i>Nợ quá hạn</span><span><i></i>Chưa nghiệm thu</span></div>`;
function donut(parts, total, label) {
  const r = 54, C = 2 * Math.PI * r; let off = 0;
  const arcs = total > 0 ? parts.filter(x => x.v > 0).map(x => { const len = x.v / total * C; const a = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${x.c}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return a; }).join('') : '';
  return `<svg viewBox="0 0 140 140" width="132" height="132" class="donut" role="img" aria-label="${label} ${ty(total)}"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="22"/>${arcs}<text x="70" y="68" text-anchor="middle" class="dn-v">${ty(total)}</text><text x="70" y="86" text-anchor="middle" class="dn-k">${label}</text></svg>`;
}
function finAlerts(gts) {
  const fa = [];
  gts.forEach(g => {
    ntRows(g.id).forEach(r => { if (r.con > 0 && (r.tt === 'Quá hạn' || days(r.han) <= 7)) fa.push({ k: r.tt === 'Quá hạn' ? 'bad' : 'warn', t: `Đợt ${r.dot} · ${g.ma} ${g.ten}`, s: `${daOf(g).ten} · còn phải trả ${ty(r.con)}`, c: r.tt === 'Quá hạn' ? `Quá hạn ${-days(r.han)} ngày` : `Hạn ${ddmm(r.han)}`, gt: g.id }); });
    if (g.bh?.ht === 'Nộp bảo lãnh' && g.bh.hh && days(g.bh.hh) <= 60) fa.push({ k: 'warn', t: `${g.ma} · thư bảo lãnh sắp hết hạn`, s: daOf(g).ten, c: days(g.bh.hh) < 0 ? 'Đã hết hạn' : 'Hết hạn ' + ddmm(g.bh.hh), gt: g.id });
    const t = tc(g.id); if (t.tuCon > 0 && t.daNT > 0) fa.push({ k: 'info', t: `${g.ma} · tạm ứng chưa thu hồi ${ty(t.tuCon)}`, s: `Thu hồi ${Math.round((g.tlThuHoi || 0) * 100)}% mỗi đợt nghiệm thu`, c: 'Theo dõi', gt: g.id });
  });
  return fa;
}
const linkRow = (h, t, s, right) => `<a class="lk" ${go(h)}><div class="grow"><div class="t">${t}</div>${s ? `<div class="mut">${s}</div>` : ''}</div>${right || ''}</a>`;
const taskRow = c => linkRow('cv/' + c.id, esc(c.ten), where(c) + (c.nguoi ? ' · ' + esc(c.nguoi) : ''), hanChip(c));

/* ---------- Tổng quan ---------- */
function projCard(a) {
  const gts = S.goiThau.filter(g => g.da === a.id); const cv = cvOfDA(a.id);
  const n = k => cv.filter(c => cat(c) === k).length; const q = n('quahan'), sh = n('saphan');
  const open = cv.filter(c => c.tt !== 'Hoàn thành').sort((x, y) => x.hh.localeCompare(y.hh)); const next = open[0];
  const fin = gts.map(g => tc(g.id)); const gtHD = fin.reduce((s, x) => s + x.gt, 0), daNT = fin.reduce((s, x) => s + x.daNT, 0);
  const worst = cv.filter(c => cat(c) === 'quahan').sort((x, y) => x.hh.localeCompare(y.hh))[0];
  const p = pctOf(cv), ntp = gtHD ? Math.round(daNT / gtHD * 100) : 0;
  return `<a class="card lk col" ${go('duan/' + a.id)}>
    <div class="row sb top-al"><div class="t">${esc(a.ten)}</div>${q ? chip(q + ' trễ', 'bad') : sh ? chip(sh + ' sắp hạn', 'warn') : chip(a.tt || 'Đang hoạt động', ttCls(a.tt))}</div>
    <div class="row"><span class="mut w90">Việc đã xong</span>${bar(p, 'ok')}<b class="pc">${p}%</b></div>
    <div class="row"><span class="mut w90">Đã nghiệm thu</span>${bar(ntp)}<b class="pc">${ntp}%</b></div>
    <div class="cnt"><span><b>${n('xong')}</b>Đã xong</span><span><b>${n('danglam') + sh}</b>Đang làm</span><span><b>${n('chuabd')}</b>Chưa làm</span><span class="${q ? 'bad-t' : ''}"><b>${q}</b>Trễ hạn</span></div>
    ${worst ? `<div class="warnline">Trễ nhiều nhất: ${esc(worst.ten)} · quá ${-days(worst.hh)} ngày</div>` : ''}
    <div class="mut">${gts.length} gói thầu · ${next ? `Hạn gần nhất ${esc(next.ten)} ${ddmm(next.hh)}` : 'Không còn việc mở'}</div></a>`;
}
function strip(cvs) {
  const T0 = today(); const DW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `<div class="strip">${Array.from({ length: 14 }, (_, i) => addDays(T0, i)).map(day => { const items = cvs.filter(c => c.hh === day); const dow = new Date(day + 'T00:00:00').getDay();
    return `<div class="day ${day === T0 ? 'today' : ''} ${dow === 0 || dow === 6 ? 'we' : ''}"><span class="dw">${day === T0 ? 'Nay' : DW[dow]}</span><span class="dd">${ddmm(day)}</span><span class="dots">${items.slice(0, 6).map(c => `<i class="${cat(c)}"></i>`).join('')}</span><span class="dn">${items.length || ''}</span></div>`; }).join('')}</div>`;
}
export function tongquan() {
  const T0 = today();
  const head = `<header class="top"><div class="row sb"><div class="row" style="gap:8px"><div class="logo">S</div><b style="font-size:17px">Sổ Dự Án</b></div>${chip('Chỉ xem', 'info')}</div><div class="mut">${dataLine()}</div></header>`;
  if (!S.duAnList.length) return head + `<div class="body">${noData()}</div>`;
  const act = new Set(visibleDA().map(a => a.id)); const gts = S.goiThau.filter(g => act.has(g.da)); const gs = new Set(gts.map(g => g.id));
  const cvs = S.congViec.filter(c => gs.has(c.gt) && c.tt !== 'Hoàn thành'); const n = k => cvs.filter(c => cat(c) === k).length;
  const fin = gts.map(g => tc(g.id)); const congNo = fin.reduce((a, x) => a + x.congNo, 0), ttQH = fin.reduce((a, x) => a + x.quaHan, 0);
  const qhNo = gts.reduce((s, g) => s + ntRows(g.id).filter(r => r.tt === 'Quá hạn').reduce((a, r) => a + r.con, 0), 0);
  const kpis = `<div class="kpis">
    <a class="kpi bad" ${go('viec/quahan')}><b>${n('quahan')}</b><span>Việc quá hạn</span></a>
    <a class="kpi warn" ${go('viec/saphan')}><b>${n('saphan')}</b><span>Sắp đến hạn (≤ 3 ngày)</span></a>
    <a class="kpi" ${go('viec/danglam')}><b>${n('danglam')}</b><span>Đang làm, còn hạn</span></a>
    <a class="kpi" ${go('taichinh')}><b>${ttQH}</b><span>Đợt thanh toán quá hạn</span></a></div>`;
  const urgent = cvs.filter(c => ['quahan', 'saphan'].includes(cat(c))).sort((a, b) => a.hh.localeCompare(b.hh));
  const cChu = card(h2('Cần chú ý', more('viec/quahan', 'Xem tất cả')) + `<div class="list">${urgent.slice(0, 6).map(taskRow).join('') || empty('Không có việc quá hạn hay sắp đến hạn.')}</div>${urgent.length > 6 ? more('viec/quahan', `Còn ${urgent.length - 6} việc nữa`) : ''}`);
  const s14 = card(h2('14 ngày tới') + strip(cvs) + legend());
  const fa = finAlerts(gts);
  const cTC = card(h2('Tài chính cần chú ý', more('taichinh', 'Xem tài chính')) + kvRow('Tổng công nợ nhà thầu', ty(congNo)) + kvRow('Trong đó quá hạn', `<span class="bad-t">${ty(qhNo)}</span>`) +
    `<div class="list sep">${fa.map(x => linkRow('goi/' + x.gt + '/taichinh', esc(x.t), esc(x.s), chip(x.c, x.k))).join('') || empty('Không có khoản nào cần chú ý.')}</div>`);
  const das = visibleDA().filter(a => a.tt !== 'Đã đóng');
  const cDA = `<div class="row sb"><h2 class="h2">Dự án đang theo dõi</h2>${more('duan', `Tất cả (${S.duAnList.length})`)}</div><div class="cards">${das.map(projCard).join('') || empty('Không có dự án đang hoạt động.')}</div>`;
  const date = `<div class="date">${DOW[new Date().getDay()]}, ${d(T0)} · ${act.size} dự án · ${gts.length} gói thầu · ${cvs.length} việc chưa xong</div>`;
  if (R.wide) return head + `<div class="body">${date}${kpis}<div class="cols2"><div class="col">${cChu}${s14}</div><div class="col">${cTC}</div></div>${cDA}</div>`;
  return head + `<div class="body">${date}${kpis}${cChu}${cTC}${s14}${cDA}</div>`;
}

/* ---------- Dự án ---------- */
const DAF = { dang: ['Đang theo dõi', a => !a.luuTru && a.tt !== 'Đã đóng'], all: ['Tất cả', a => !a.luuTru], tre: ['Có việc trễ', a => !a.luuTru && cvOfDA(a.id).some(c => cat(c) === 'quahan')], luu: ['Lưu trữ', a => a.luuTru] };
function daList(sel) {
  const q = m.q.trim().toLowerCase();
  const list = S.duAnList.filter(DAF[m.daf][1]).filter(a => !q || (a.ten + ' ' + (a.cdt || '') + ' ' + (a.diaDiem || '')).toLowerCase().includes(q));
  const chips = `<div class="chips">${Object.entries(DAF).filter(([k]) => k !== 'luu' || S.duAnList.some(a => a.luuTru)).map(([k, [l, f]]) => `<button class="fc ${m.daf === k ? 'on' : ''}" data-daf="${k}">${l} <b>${S.duAnList.filter(f).length}</b></button>`).join('')}</div>`;
  const items = list.map(a => { const cv = cvOfDA(a.id); const q2 = cv.filter(c => cat(c) === 'quahan').length; const p = pctOf(cv);
    return `<a class="card lk col ${sel === a.id ? 'sel' : ''}" ${go('duan/' + a.id)}><div class="row sb top-al"><div class="t">${esc(a.ten)}</div>${q2 ? chip(q2 + ' trễ', 'bad') : chip(a.tt || 'Đang hoạt động', ttCls(a.tt))}</div>
      <div class="mut">${esc(a.cdt || '')}${a.diaDiem ? ' · ' + esc(a.diaDiem) : ''}</div>
      <div class="row">${bar(p, 'ok')}<b class="pc">${p}%</b></div>
      <div class="mut">${S.goiThau.filter(g => g.da === a.id).length} gói thầu · ${cv.length} việc · ${d(a.bd)} – ${d(a.kt)}</div></a>`; }).join('');
  return `<label class="search">${ic('search', 18)}<input id="q" type="search" placeholder="Tìm dự án, chủ đầu tư" value="${esc(m.q)}"></label>${chips}<div class="cards">${items || empty('Không có dự án phù hợp.')}</div>`;
}
export function duan() {
  if (R.wide) { const id = R.route[1] || S.duAnList.filter(DAF[m.daf][1])[0]?.id; return `<div class="split"><aside class="side w320"><h1 class="side-h">Dự án</h1>${daList(id)}</aside><div class="main">${id && daById(id) ? daDetail(id, true) : `<div class="body">${S.duAnList.length ? empty('Chọn một dự án ở bên trái.') : noData()}</div>`}</div></div>`; }
  if (R.route[1]) return daDetail(R.route[1]);
  return top('Dự án', `${S.duAnList.length} dự án`) + `<div class="body">${S.duAnList.length ? daList() : noData()}</div>`;
}
function daDetail(id, inSplit) {
  const a = daById(id); if (!a) return top('Dự án', '', ['duan', 'Dự án']) + `<div class="body">${empty('Không tìm thấy dự án.')}</div>`;
  const gts = S.goiThau.filter(g => g.da === a.id); const cvs = cvOfDA(a.id); const n = k => cvs.filter(c => cat(c) === k).length;
  const xong = n('xong'); const tre = cvs.filter(c => c.tt === 'Hoàn thành' ? c.xong > c.goc : days(c.goc) < 0).length; const p = pctOf(cvs);
  const o = cnAgg(gts.map(g => g.id));
  const head = top(esc(a.ten), `${esc(a.cdt || '')} · ${d(a.bd)} – ${d(a.kt)}${a.tn ? ' · Trưởng nhóm ' + esc(a.tn) : ''}${a.diaDiem ? '<br>' + esc(a.diaDiem) : ''}`, inSplit ? '' : ['duan', 'Dự án'], chip(a.tt || 'Đang hoạt động', ttCls(a.tt)));
  const cTD = card(h2('Tiến độ dự án', `<b class="big">${p}%</b>`) + stack(cvs) + legend() + `<div class="kg5"><div><b>${cvs.length}</b><span>Tổng việc</span></div><div><b>${xong}</b><span>Đã xong</span></div><div><b class="bad-t">${n('quahan')}</b><span>Quá hạn</span></div><div><b class="warn-t">${n('saphan')}</b><span>Sắp đến hạn</span></div><div><b>${tre}</b><span>Trễ so hạn gốc</span></div></div>`);
  const cTC = card(h2('Tài chính dự án') + kvRow('Giá trị hợp đồng', vnd(o.gt)) + kvRow('Đã nghiệm thu', vnd(o.daNT) + ` <span class="mut">(${o.gt ? Math.round(o.daNT / o.gt * 100) : 0}%)</span>`) + kvRow('Đã thanh toán', vnd(o.daTT)) + kvRow('Tạm ứng còn phải thu hồi', vnd(o.tuCon)) + kvRow('Giữ bảo hành', vnd(o.giu)) + kvRow('Công nợ', `<span class="warn-t">${vnd(o.congNo)}</span>`) + (o.qh ? kvRow('Trong đó quá hạn', `<span class="bad-t">${vnd(o.qh)}</span>`) : '') + cnBar(o) + cnLegend());
  const cGT = `<h2 class="h2">Gói thầu (${gts.length})</h2><div class="cards">${gts.map(g => { const cv = S.congViec.filter(c => c.gt === g.id); const q = cv.filter(c => cat(c) === 'quahan').length; const t = tc(g.id);
    return `<a class="card lk col" ${go('goi/' + g.id + '/congviec')}><div class="row sb top-al"><div class="t">${esc(g.ma)} · ${esc(g.ten)}</div>${q ? chip(q + ' quá hạn', 'bad') : chip(pctOf(cv) + '%', 'ok')}</div>
      <div class="mut">${esc(ntById(g.nt).ten)}${g.hd ? ' · HĐ ' + esc(g.hd) : ''}</div>${stack(cv)}
      <div class="row sb mut"><span>${cv.filter(c => c.tt === 'Hoàn thành').length}/${cv.length} việc xong</span><span>HĐ ${ty(g.gt)} · NT ${g.gt ? Math.round(t.daNT / g.gt * 100) : 0}%</span></div>
      <div class="row sb mut"><span>Bảo hành: ${esc(g.bh?.ht || 'Không có')}</span><span>Công nợ ${ty(t.congNo)}</span></div></a>`; }).join('') || empty('Dự án chưa có gói thầu.')}</div>`;
  const next = cvs.filter(c => c.tt !== 'Hoàn thành').sort((x, y) => x.hh.localeCompare(y.hh)).slice(0, 6);
  const cMoc = card(h2('Mốc sắp tới') + `<div class="list">${next.map(taskRow).join('') || empty('Không còn việc mở.')}</div>`);
  const hs = S.hop.filter(h => h.da === a.id).sort((x, y) => y.luc.localeCompare(x.luc));
  const cHop = card(h2('Lịch họp', `<span class="mut">${hs.length}</span>`) + `<div class="list">${hs.map(hopRow).join('') || empty('Chưa có cuộc họp.')}</div>`);
  const cTL = cvs.length ? `<details class="card"><summary class="h2">Bảng tiến độ (hạn gốc, hạn hiện hành, ngày xong)</summary><div class="lg"><span><i class="mk-l goc"></i>Hạn gốc</span><span><i class="mk-l hh"></i>Hạn hiện hành</span><span><i class="mk-l xong"></i>Ngày xong</span><span><i class="mk-l ext"></i>Phần gia hạn</span><span><i class="mk-l today"></i>Hôm nay</span></div><div class="hscroll">${timeline(gts, cvs)}</div></details>` : '';
  if (R.wide) return head + `<div class="body"><div class="cols2"><div class="col">${cTD}${cMoc}${cHop}</div><div class="col">${cTC}</div></div>${cGT}${cTL}</div>`;
  return head + `<div class="body">${cTD}${cTC}${cGT}${cMoc}${cHop}${cTL}</div>`;
}
const hopRow = h => { const past = h.luc.slice(0, 10) < today(); return `<div class="lk"><div class="when ${past ? 'past' : ''}"><b>${h.luc.slice(8, 10)}</b><span>th${+h.luc.slice(5, 7)}</span></div><div class="grow"><div class="t">${esc(h.ten)}</div><div class="mut">${h.luc.slice(11, 16)} · ${esc(h.diaDiem || '')}${h.gt ? ' · ' + esc(gtById(h.gt)?.ma || '') : ''}</div></div>${past ? '' : chip(days(h.luc.slice(0, 10)) === 0 ? 'Hôm nay' : 'Còn ' + days(h.luc.slice(0, 10)) + ' ngày', 'info')}</div>`; };
function timeline(gts, cvs) {
  const T0 = today();
  const ds = cvs.flatMap(c => [c.goc, c.hh, c.xong].filter(Boolean)).concat([T0]).sort();
  const lo0 = addDays(ds[0], -3), lo = lo0 > addDays(T0, -35) ? lo0 : addDays(T0, -35), hi = addDays(ds[ds.length - 1], 4);
  const inR = s => s && s >= lo; const span = Math.max(1, (new Date(hi) - new Date(lo)) / 864e5);
  const X = s => ((new Date(s) - new Date(lo)) / 864e5 / span * 100).toFixed(2) + '%';
  const step = span > 240 ? 56 : span > 120 ? 28 : span > 60 ? 14 : 7; const ticks = []; for (let t = addDays(lo, 3); t < hi; t = addDays(t, step)) ticks.push(t);
  const near = t => Math.abs((new Date(t) - new Date(T0)) / 864e5) < step * 0.45;
  const todayM = `<span class="tl-today" style="left:${X(T0)}"></span>`; const grid = ticks.map(t => `<span class="tl-tick" style="left:${X(t)}"></span>`).join('');
  const rows = gts.map(g => { const cv = cvs.filter(c => c.gt === g.id).sort((a, b) => (a.goc || '').localeCompare(b.goc || '')); if (!cv.length) return '';
    return `<div class="tl-row tl-grp"><div class="tl-name"><b>${esc(g.ma)} · ${esc(g.ten)}</b></div><div class="tl-track">${grid}${todayM}</div></div>` + cv.map(c => { const k = cat(c); const end = c.xong || c.hh;
      return `<div class="tl-row"><div class="tl-name">${esc(c.ten)}</div><div class="tl-track">${grid}${todayM}${end > c.goc && inR(end) ? `<span class="tl-ext" style="left:${X(inR(c.goc) ? c.goc : lo)};width:calc(${X(end)} - ${X(inR(c.goc) ? c.goc : lo)})"></span>` : ''}${inR(c.goc) ? `<span class="mk goc" style="left:${X(c.goc)}"></span>` : ''}${(c.hh !== c.goc || k !== 'xong') && inR(c.hh) ? `<span class="mk hh ${k}" style="left:${X(c.hh)}"></span>` : ''}${inR(c.xong) ? `<span class="mk xong" style="left:${X(c.xong)}"></span>` : ''}${!inR(end) ? `<span class="tl-old">xong ${d(end)}</span>` : ''}</div></div>`; }).join(''); }).join('');
  return `<div class="tl"><div class="tl-row tl-head"><div class="tl-name mut">Công việc</div><div class="tl-track">${ticks.filter(t => !near(t)).map(t => `<span class="tl-lab" style="left:${X(t)}">${ddmm(t)}</span>`).join('')}<span class="tl-lab now" style="left:${X(T0)}">Hôm nay</span></div></div>${rows}</div>`;
}

/* ---------- Gói thầu ---------- */
const TABS = [['congviec', 'Công việc'], ['dexuat', 'Điều chỉnh tiến độ'], ['taichinh', 'Tài chính'], ['baohanh', 'Bảo hành'], ['quyettoan', 'Quyết toán'], ['bangiao', 'Bàn giao']];
export function goi() {
  const g = gtById(R.route[1]); if (!g) return top('Gói thầu', '', ['duan', 'Dự án']) + `<div class="body">${empty('Không tìm thấy gói thầu.')}</div>`;
  const tab = TABS.some(x => x[0] === R.route[2]) ? R.route[2] : 'congviec'; const a = daOf(g); const t = tc(g.id);
  const cv = S.congViec.filter(c => c.gt === g.id); const p = pctOf(cv);
  const sub = `Nhà thầu: ${esc(ntById(g.nt).ten)}${g.hd ? '<br>HĐ ' + esc(g.hd) : ''}${g.ngayKy ? ' ký ' + d(g.ngayKy) : ''}`;
  const prog = `<div class="row">${bar(p, 'ok')}<b class="pc">${p}%</b><span class="mut nowrap">${cv.filter(c => c.tt === 'Hoàn thành').length}/${cv.length} việc</span></div>`;
  const fin = `<div class="kg4"><div><span>Giá trị HĐ</span><b>${ty(g.gt)}</b></div><div><span>Đã nghiệm thu</span><b>${ty(t.daNT)}</b></div><div><span>Đã thanh toán</span><b>${ty(t.daTT)}</b></div><div><span>Công nợ</span><b class="${t.congNo > 0 ? 'warn-t' : ''}">${ty(t.congNo)}</b></div></div>`;
  const body = TG[tab](g);
  if (R.wide) return `<div class="split"><aside class="side w260"><a class="back" ${go('duan/' + g.da)}>${ic('back', 20)}${esc(a.ten)}</a><h1 class="side-h" style="padding:0">${esc(g.ma)} · ${esc(g.ten)}</h1><div class="mut">${sub}</div>${prog}${fin}<nav class="vtabs">${TABS.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" ${go('goi/' + g.id + '/' + k)}>${l}</a>`).join('')}</nav></aside><div class="main"><div class="body">${body}</div></div></div>`;
  return `<header class="top"><a class="back" ${go('duan/' + g.da)}>${ic('back', 20)}${esc(a.ten)}</a><h1>${esc(g.ma)} · ${esc(g.ten)}</h1><div class="mut">${sub}</div>${prog}
    <nav class="tabs">${TABS.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" ${go('goi/' + g.id + '/' + k)} data-tab>${l}</a>`).join('')}</nav></header><div class="body">${tab !== 'taichinh' ? fin : ''}${body}</div>`;
}
const TG = {};
TG.congviec = g => {
  const all = S.congViec.filter(c => c.gt === g.id); const pf = m.pf;
  const cv = all.filter(FILTERS[pf][1]).sort((a, b) => ((+a.stt || 1e9) - (+b.stt || 1e9)) || (a.hh || '').localeCompare(b.hh || ''));
  const chips = `<div class="chips">${Object.keys(FILTERS).map(k => `<button class="fc ${k === pf ? 'on' : ''}" data-pf="${k}">${FILTERS[k][0]} <b>${all.filter(FILTERS[k][1]).length}</b></button>`).join('')}</div>`;
  const groups = []; cv.forEach(c => { const k = c.nhom || 'Công việc'; let gr = groups.find(x => x.k === k); if (!gr) groups.push(gr = { k, cv: [] }); gr.cv.push(c); });
  const grp = gr => { const tot = all.filter(c => (c.nhom || 'Công việc') === gr.k); const key = g.id + '|' + gr.k; const op = gr.cv.filter(c => c.tt !== 'Hoàn thành'), dn = gr.cv.filter(c => c.tt === 'Hoàn thành');
    const showDn = m.open.has(key) || dn.length <= 3 || pf === 'xong' ? dn : dn.slice(0, 3);
    return `<div class="grp"><span>${esc(gr.k)}</span><span class="mut">${tot.filter(c => c.tt === 'Hoàn thành').length}/${tot.length} xong</span></div>
    <div class="card tight">${op.concat(showDn).map(c => `<a class="tk" ${go('cv/' + c.id)}><div class="row sb top-al"><div class="t">${esc(c.ten)}</div>${hanChip(c)}</div>
      <div class="mut">Hạn ${d(c.hh)}${c.nguoi ? ' · ' + esc(c.nguoi) : ''}${c.tt === 'Hoàn thành' && c.xong ? ' · xong ' + d(c.xong) : ''}</div>
      ${c.hh !== c.goc ? `<div class="adj">Đã điều chỉnh hạn ${c.pb || 1} lần: hạn gốc ${d(c.goc)}</div>` : ''}${(c.notes || []).length ? `<div class="mut">${c.notes.length} ghi chú${c.notes.some(n => n.tep) ? ', có ảnh/tệp' : ''}</div>` : ''}</a>`).join('')}
    ${showDn.length < dn.length ? `<button class="morebtn" data-open-grp="${esc(key)}">Xem thêm ${dn.length - showDn.length} việc đã xong</button>` : ''}</div>`; };
  return chips + (groups.map(grp).join('') || empty(all.length ? 'Không có việc nào trong nhóm này.' : 'Gói thầu chưa có công việc.'));
};
TG.dexuat = g => {
  const ds = S.deXuat.filter(x => x.gt === g.id).sort((a, b) => b.ngay.localeCompare(a.ngay));
  return `<h2 class="h2">Lịch sử điều chỉnh hạn (${ds.length} lần)</h2>` + (ds.map(x => card(`<div class="row sb"><b>${d(x.ngay)}</b><span class="mut">${esc(x.nguoi || '')}</span></div>${x.lyDo ? `<div>${esc(x.lyDo)}</div>` : ''}
    <div class="list">${(x.dong || []).map(r => `<div class="lk"><div class="grow"><div class="t">${esc(cvById(r.cv)?.ten || '(việc đã xóa)')}</div><div class="mut"><s>${d(r.cu)}</s> → <b class="ink">${d(r.moi)}</b> ${days(r.moi) !== undefined ? `(${Math.round((new Date(r.moi) - new Date(r.cu)) / 864e5) > 0 ? 'lùi' : 'sớm'} ${Math.abs(Math.round((new Date(r.moi) - new Date(r.cu)) / 864e5))} ngày)` : ''}</div></div></div>`).join('')}</div>${fileBtn(x.vb, 'Văn bản căn cứ')}`)).join('') || empty('Chưa điều chỉnh lần nào.'));
};
TG.taichinh = g => {
  const rows = ntRows(g.id); const t = tc(g.id);
  const sum = card(h2('Tóm tắt hợp đồng') + kvRow('Giá trị hợp đồng', vnd(g.gt)) + kvRow('Đã nghiệm thu', vnd(t.daNT)) + kvRow('Đã thanh toán các đợt', vnd(t.daTT)) + kvRow('Tổng đã chi (tạm ứng + thanh toán)', vnd(t.tu + t.daTT)) + kvRow('Tiền giữ bảo hành', vnd(t.giu)) + kvRow('Còn lại của hợp đồng', vnd(t.conLaiHD)) + kvRow('Công nợ', `<span class="${t.congNo > 0 ? 'warn-t' : ''}">${vnd(t.congNo)}</span>`, 'tot') + cnBar(cnAgg([g.id])) + cnLegend());
  const tu = card(h2('Tạm ứng', `<b>${vnd(tamUngTong(g))}</b>`) + `<div class="list">${(g.tamUng || []).map(x => `<div class="lk"><div class="grow"><div class="t">Lần ${x.lan} · ${d(x.ngay)}</div><div class="mut">${esc(x.ct || '')}</div></div><b class="nowrap">${vnd(x.tien)}</b>${fileBtn(x.tep, '')}</div>`).join('') || empty('Chưa ghi tạm ứng.')}</div>
    <div class="mut sep">Thu hồi mỗi đợt nghiệm thu: <b class="ink">${Math.round((g.tlThuHoi || 0) * 100)}%</b> · Đã thu hồi ${vnd(t.thuHoi)} · Còn lại <b class="ink">${vnd(t.tuCon)}</b></div>`);
  const nt = `<h2 class="h2">Nghiệm thu và thanh toán (${rows.length} đợt)</h2>` + (rows.map(x => card(`<div class="row sb"><b>Đợt ${x.dot} · ${d(x.ngay)}</b>${chip(x.tt === 'Quá hạn' ? `Quá hạn ${-days(x.han)} ngày` : x.tt, ttCls(x.tt))}</div>
    ${kvRow('Giá trị nghiệm thu', vnd(x.gtri))}${kvRow('Trừ tạm ứng', '−' + vnd(x.khauTru))}${kvRow('Giữ bảo hành', x.giu ? '−' + vnd(x.giu) : '—')}${kvRow('Đề nghị thanh toán', vnd(x.deNghi), 'tot')}${kvRow('Đã trả', vnd(x.daTra))}${x.con > 0 ? kvRow('Còn phải trả', `<span class="${x.tt === 'Quá hạn' ? 'bad-t' : 'warn-t'}">${vnd(x.con)}</span>`) : ''}${kvRow('Hạn trả', d(x.han))}
    ${S.thanhToan.filter(p => p.nt === x.id).sort((a, b) => a.ngay.localeCompare(b.ngay)).map(p => `<div class="pay"><span>Chi ${d(p.ngay)}${p.ct ? ' · ' + esc(p.ct) : ''}</span><b>${vnd(p.tien)}</b>${fileBtn(p.tep, '')}</div>`).join('')}
    ${fileBtn(x.bb, 'Biên bản nghiệm thu')}`)).join('') || empty('Chưa có đợt nghiệm thu.'));
  if (R.wide) return `<div class="cols2"><div class="col">${sum}${tu}</div><div class="col">${nt}</div></div>`;
  return sum + tu + nt;
};
TG.baohanh = g => {
  const b = g.bh || { ht: 'Không có' }; const t = tc(g.id); const pc = ((b.tl || 0) * 100).toLocaleString('vi-VN') + '%';
  let rows = kvRow('Hình thức', esc(b.ht)) + kvRow('Tỷ lệ theo hợp đồng', pc) + kvRow('Hết thời gian bảo hành', d(b.hhBH));
  if (b.ht === 'Nộp bảo lãnh') rows += kvRow('Số thư bảo lãnh', esc(b.so || '—')) + kvRow('Ngân hàng', esc(b.nh || '—')) + kvRow('Giá trị bảo lãnh', vnd(b.gt)) + kvRow('Thư hết hạn', d(b.hh) + (b.hh && days(b.hh) <= 60 ? ' ' + chip(days(b.hh) < 0 ? 'Đã hết hạn' : 'Còn ' + days(b.hh) + ' ngày', 'warn') : '')) + (b.thu ? fileBtn(b.thu, 'Thư bảo lãnh') : kvRow('Tệp thư bảo lãnh', '<span class="bad-t">Chưa có</span>'));
  if (b.ht === 'Giữ tiền') rows += kvRow('Đang giữ', vnd(t.giu)) + kvRow('Ngày hoàn trả tiền giữ', d(b.traNgay)) + fileBtn(b.traTep, 'Chứng từ hoàn trả');
  const note = b.ht === 'Nộp bảo lãnh' ? 'Nộp bảo lãnh nên không giữ tiền ở các đợt nghiệm thu.' : b.ht === 'Giữ tiền' ? `Mỗi đợt nghiệm thu tự giữ lại ${pc} giá trị nghiệm thu.` : 'Hợp đồng không quy định bảo hành bằng tiền hoặc thư bảo lãnh.';
  return card(h2('Bảo hành') + rows + `<div class="note">${note}</div>`);
};
TG.quyettoan = g => {
  const t = tc(g.id); const q = g.qt || null; const gtq = q?.gt ?? t.daNT;
  const giu = g.bh?.ht === 'Giữ tiền' ? gtq * (g.bh.tl || 0) : 0; const con = gtq - t.tu - t.daTT;
  return card(h2('Quyết toán hợp đồng', chip(q?.chot ? 'Đã chốt' : q ? 'Đang lập' : 'Chưa quyết toán', q?.chot ? 'ok' : q ? 'warn' : 'gray')) +
    kvRow('Giá trị quyết toán' + (q ? '' : ' (tạm tính = đã nghiệm thu)'), vnd(gtq)) + kvRow('Đã tạm ứng', '−' + vnd(t.tu)) + kvRow('Đã thanh toán các đợt', '−' + vnd(t.daTT)) + kvRow('Còn phải trả nhà thầu', vnd(con), 'tot') + kvRow('Trả ngay khi quyết toán', vnd(Math.max(con - giu, 0))) + kvRow('Giữ đến hết bảo hành', giu ? vnd(Math.min(giu, Math.max(con, 0))) : '—') +
    (q ? kvRow('Ngày phê duyệt', d(q.ngay)) + kvRow('Người lập', esc(q.nguoi || '')) + (q.chot ? kvRow('Người chốt', esc(q.nguoiChot || '')) : '') : '') + fileBtn(q?.tep, 'Hồ sơ quyết toán')) +
    `<p class="mut">Giá trị hợp đồng ${vnd(g.gt)} · đã nghiệm thu ${vnd(t.daNT)}. Tiền giữ bảo hành trả khi hết thời gian bảo hành (${d(g.bh?.hhBH)}).</p>`;
};
TG.bangiao = g => {
  const ls = S.banGiao.filter(x => x.gt === g.id).sort((a, b) => b.ngay.localeCompare(a.ngay));
  return `<h2 class="h2">Lịch sử bàn giao (${ls.length})</h2>` + (ls.map(x => card(`<div class="row sb"><b>${d(x.ngay)}</b>${fileBtn(x.tep, 'Biên bản')}</div><div>${esc(x.nd)}</div><div class="mut">${esc(x.giao)} → ${esc(x.nhan)}</div>`)).join('') || empty('Chưa ghi bàn giao.'));
};

/* ---------- Công việc ---------- */
const VF = [['quahan', 'Quá hạn', 'Việc đã quá hạn, xếp theo hạn sớm nhất'], ['saphan', 'Sắp đến hạn', 'Đến hạn trong 3 ngày tới'], ['danglam', 'Đang làm', 'Đang làm, còn hạn'], ['chuabd', 'Chưa làm', 'Chưa bắt đầu thực hiện'], ['mo', 'Tất cả chưa xong', 'Mọi việc chưa hoàn thành'], ['xong', 'Đã xong', 'Đã hoàn thành, mới nhất trước']];
export function viec() {
  const f = VF.some(x => x[0] === R.route[1]) ? R.route[1] : m.vf; m.vf = f;
  const act = new Set(visibleDA().map(a => a.id)); const all = S.congViec.filter(c => act.has(gtOf(c).da));
  const mine = m.mine && S.lic?.name; const base = mine ? all.filter(c => c.nguoi === S.lic.name) : all;
  const cv = base.filter(FILTERS[f][1]).sort((a, b) => f === 'xong' ? (b.xong || '').localeCompare(a.xong || '') : (a.hh || '').localeCompare(b.hh || ''));
  const cap = VF.find(x => x[0] === f)[2]; const lim = 200;
  const tasks = cv.slice(0, lim).map(c => `<a class="card lk col tight2" ${go('cv/' + c.id)}><div class="row sb top-al"><div class="t">${esc(c.ten)}</div>${hanChip(c)}</div><div class="mut">${where(c)}</div><div class="row mut" style="gap:12px"><span>Hạn <b class="ink">${d(c.hh)}</b></span>${c.nguoi ? `<span>${esc(c.nguoi)}</span>` : ''}</div></a>`).join('') || empty('Không có việc nào trong nhóm này.');
  const mineT = S.lic?.name ? `<label class="tg"><input type="checkbox" data-mine ${m.mine ? 'checked' : ''}>Chỉ việc giao cho ${esc(S.lic.name)}</label>` : '';
  const extra = cv.length > lim ? `<div class="mut">Đang hiện ${lim}/${cv.length} việc.</div>` : '';
  if (R.wide) return `<div class="split"><aside class="side w220"><h1 class="side-h">Công việc</h1>${VF.map(([k, l]) => `<a class="sf ${k === f ? 'on' : ''}" ${go('viec/' + k)}><span>${l}</span><span class="n">${base.filter(FILTERS[k][1]).length}</span></a>`).join('')}<div style="margin-top:10px">${mineT}</div></aside><div class="main"><div class="body"><div class="mut">${cap} · ${cv.length} việc</div><div class="grid2">${tasks}</div>${extra}</div></div></div>`;
  return `<header class="top"><h1>Công việc</h1><div class="chips">${VF.map(([k, l]) => `<a class="fc ${k === f ? 'on' : ''} ${k}" ${go('viec/' + k)}>${l} <b>${base.filter(FILTERS[k][1]).length}</b></a>`).join('')}</div></header><div class="body"><div class="row sb"><span class="mut">${cap} · ${cv.length} việc</span></div>${mineT}${tasks}${extra}</div>`;
}

/* ---------- Chi tiết công việc ---------- */
const IMG = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;
export function cv() {
  const c = cvById(R.route[1]); if (!c) return top('Công việc', '', ['viec/' + m.vf, 'Công việc']) + `<div class="body">${empty('Không tìm thấy công việc.')}</div>`;
  const g = gtOf(c); const a = daOf(g);
  const info = card(kvRow('Trạng thái', `${chip(c.tt, ttCls(c.tt))} ${c.tt !== 'Hoàn thành' ? hanChip(c) : ''}`) + kvRow('Dự án', `<a ${go('duan/' + g.da)}>${esc(a.ten)}</a>`) + kvRow('Gói thầu', `<a ${go('goi/' + g.id + '/congviec')}>${esc(g.ma)} · ${esc(g.ten)}</a>`) + (c.nhom ? kvRow('Hạng mục', esc(c.nhom)) : '') + kvRow('Người phụ trách', esc(c.nguoi || '—')) +
    kvRow('Hạn gốc', d(c.goc)) + kvRow('Hạn hiện hành', d(c.hh) + (c.hh !== c.goc ? ` <span class="mut">(điều chỉnh ${c.pb || 1} lần)</span>` : '')) + (c.tt === 'Hoàn thành' ? kvRow('Ngày hoàn thành', d(c.xong)) : ''));
  const dx = S.deXuat.filter(x => (x.dong || []).some(r => r.cv === c.id)).sort((x, y) => y.ngay.localeCompare(x.ngay));
  const cDX = dx.length ? card(h2('Lịch sử điều chỉnh hạn') + `<div class="list">${dx.map(x => { const r = x.dong.find(r => r.cv === c.id); return `<div class="lk"><div class="grow"><div class="t"><s class="mut">${d(r.cu)}</s> → ${d(r.moi)}</div><div class="mut">${d(x.ngay)} · ${esc(x.nguoi || '')}${x.lyDo ? ' · ' + esc(x.lyDo) : ''}</div></div>${fileBtn(x.vb, '')}</div>`; }).join('')}</div>`) : '';
  const notes = (c.notes || []).slice().reverse();
  const cN = card(h2(`Ghi chú và ảnh hiện trường (${notes.length})`) + `<div class="list">${notes.map(n => `<div class="note-i"><div>${esc(n.t)}</div><div class="mut">${esc(n.ai || '')} · ${esc(n.luc || '')}</div>${n.tep ? (IMG.test(n.tep) ? `<img class="ph" data-src="${esc(n.tep)}" data-open="${esc(n.tep)}" alt="Ảnh kèm ghi chú">` : fileBtn(n.tep)) : ''}</div>`).join('') || empty('Chưa có ghi chú.')}</div>`);
  const body = R.wide ? `<div class="cols2"><div class="col">${info}${cDX}</div><div class="col">${cN}</div></div>` : info + cDX + cN;
  return top(esc(c.ten), `${esc(g.ma)} · ${esc(g.ten)}`, ['goi/' + g.id + '/congviec', g.ma + ' · ' + g.ten]) + `<div class="body">${body}</div>`;
}

/* ---------- Tài chính tổng ---------- */
export function taichinh() {
  const head = top('Tài chính hợp đồng', 'Tổng hợp mọi dự án, mọi gói thầu', '', S.goiThau.length ? `<button class="btn sm" data-act="tc-xlsx">Xuất Excel</button>` : '');
  if (!S.duAnList.length) return head + `<div class="body">${noData()}</div>`;
  const das = visibleDA().map((a, i) => ({ a, c: PCOL[i % PCOL.length], gts: S.goiThau.filter(g => g.da === a.id) })).filter(x => x.gts.length).map(x => ({ ...x, o: cnAgg(x.gts.map(g => g.id)) }));
  const total = das.reduce((s, x) => s + x.o.congNo, 0), qh = das.reduce((s, x) => s + x.o.qh, 0); const sm = k => das.reduce((s, x) => s + x.o[k], 0);
  const cD = `<div class="card donutc">${donut(das.map(x => ({ v: x.o.congNo, c: x.c })), total, 'tổng công nợ')}<div class="dleg">${das.map(x => `<div class="row" style="gap:6px"><i class="sq" style="background:${x.c}"></i><span>${esc(x.a.ten)} <b>${total ? Math.round(x.o.congNo / total * 100) : 0}%</b></span></div>`).join('')}<div style="margin-top:4px">Trong đó quá hạn<br><b class="bad-t" style="font-size:15px">${ty(qh)}</b></div></div></div>`;
  const tiles = `<div class="kg4 tiles"><div><span>Tổng giá trị hợp đồng</span><b>${ty(sm('gt'))}</b></div><div><span>Đã nghiệm thu</span><b>${ty(sm('daNT'))}</b></div><div><span>Tạm ứng còn phải thu hồi</span><b>${ty(sm('tuCon'))}</b></div><div><span>Công nợ</span><b class="warn-t">${ty(sm('congNo'))}</b></div></div>`;
  const prj = das.map(x => { const open = m.cnOpen === x.a.id;
    return `<div class="card"><button class="prj" data-cn="${x.a.id}" aria-expanded="${open}"><div class="row sb top-al"><div class="col0"><div class="t">${esc(x.a.ten)}</div><div class="mut">${x.gts.length} gói thầu · HĐ ${ty(x.o.gt)}${x.o.quaHan ? ` · <span class="bad-t">${x.o.quaHan} đợt quá hạn</span>` : ''}</div></div><div class="col0 r"><b>${ty(x.o.congNo)}</b><span class="mut">${total ? Math.round(x.o.congNo / total * 100) : 0}% nợ ${open ? '▾' : '▸'}</span></div></div>${cnBar(x.o)}</button>
    ${open ? x.gts.map(g => { const o = cnAgg([g.id]); return `<a class="gsub" ${go('goi/' + g.id + '/taichinh')}><div class="row sb top-al"><div class="col0"><b>${esc(g.ma)} · ${esc(g.ten)}</b><span class="mut">${esc(ntById(g.nt).ten)}</span></div><div class="col0 r"><b>${ty(o.congNo)}</b><span class="${o.qh ? 'bad-t' : 'ok-t'}" style="font-size:11.5px;font-weight:600">${o.qh ? 'quá hạn ' + ty(o.qh) : 'trong hạn'}</span></div></div>${cnBar(o)}<div class="row sb mut"><span>HĐ ${ty(o.gt)} · NT ${ty(o.daNT)}</span><span>Đã trả ${ty(o.daTT)}</span></div><div class="row sb mut"><span>TƯ còn ${ty(o.tuCon)}</span><span>${o.giu ? 'Giữ BH ' + ty(o.giu) : g.bh?.ht === 'Nộp bảo lãnh' ? 'Thư bảo lãnh' : 'Không giữ BH'}</span></div></a>`; }).join('') : ''}</div>`; }).join('');
  const list = `<div class="row sb"><h2 class="h2">Công nợ theo dự án</h2><span class="mut">bấm để xem từng gói</span></div>${cnLegend()}<div class="${R.wide ? 'grid2 al' : 'cards'}">${prj || empty('Chưa có gói thầu.')}</div>`;
  if (R.wide) return head + `<div class="body"><div class="cols2"><div class="col">${cD}</div><div class="col">${tiles}</div></div>${list}</div>`;
  return head + `<div class="body">${cD}${tiles}${list}</div>`;
}

/* ---------- Thêm ---------- */
export const MENU = [['nhathau', 'build', 'Nhà thầu & đơn vị', 'Danh bạ, gọi điện, gửi email'], ['hop', 'cal', 'Lịch họp', 'Mọi cuộc họp của các dự án'], ['baocao', 'report', 'Báo cáo', 'Báo cáo tiến độ, tài chính ra PDF hoặc Excel'], ['capnhat', 'sync', 'Cập nhật dữ liệu', 'Mở tệp .sodaan mới gửi từ máy tính'], ['dev', 'info', 'Thông tin nhà phát triển', 'Công ty cổ phần Công nghệ ITD Việt Nam']];
export const SUB = {};
export function them() {
  const sub = R.route[1]; const menu = cur => `<div class="card menu">${MENU.map(([k, i, l, s]) => `<a class="mi ${cur === k ? 'on' : ''}" ${go('them/' + k)}><span class="mic">${ic(i)}</span><span class="grow"><b>${l}</b><span class="mut">${s}</span></span>${ic('next', 18)}</a>`).join('')}</div>`;
  if (R.wide) { const k = SUB[sub] ? sub : 'capnhat'; return `<div class="split"><aside class="side w280"><h1 class="side-h">Thêm</h1>${menu(k)}<div class="mut" style="padding:8px">${dataLine()}</div></aside><div class="main">${SUB[k](true)}</div></div>`; }
  if (sub && SUB[sub]) return SUB[sub]();
  return top('Thêm', dataLine()) + `<div class="body">${menu()}</div>`;
}
const subTop = (t, s, inSplit) => top(t, s, inSplit ? '' : ['them', 'Thêm']);
SUB.nhathau = inSplit => {
  const seg = m.ntSeg; const ppl = x => (x.nguoi || []).map(p => `<div>${esc(p.ten)}${p.cv ? ` <span class="mut">· ${esc(p.cv)}</span>` : ''}</div>`).join('');
  const tel = s => String(s || '').split(/[,;/]/).map(x => x.trim()).filter(Boolean)[0]?.replace(/[^\d+]/g, '');
  const list = seg === 'nt' ? S.nhaThau.map(n => card(`<div class="t">${esc(n.ten)}</div>${n.dc ? `<div class="mut">${esc(n.dc)}</div>` : ''}${ppl(n)}${n.lh ? `<div class="mut">${esc(n.lh)}</div>` : ''}<div class="mut">${n.sdt ? esc(n.sdt) : ''}${n.sdt && n.email ? ' · ' : ''}${n.email ? esc(n.email) : ''}</div>${S.goiThau.some(g => g.nt === n.id) ? `<div class="mut">Gói thầu: ${S.goiThau.filter(g => g.nt === n.id).map(g => esc(g.ma + ' ' + g.ten) + ' <span class="mut">(' + esc(daOf(g).ten) + ')</span>').join('; ')}</div>` : ''}<div class="row">${tel(n.sdt) ? `<a class="btn sm" href="tel:${tel(n.sdt)}">${ic('phone', 16)}Gọi</a>` : ''}${n.email ? `<a class="btn sm" href="mailto:${esc(n.email)}">${ic('mail', 16)}Email</a>` : ''}</div>`)).join('') || empty('Chưa có nhà thầu.')
    : S.danhBa.map(n => card(`<div class="row sb top-al"><div class="t">${esc(n.ten)}</div>${n.loai ? chip(n.loai, 'info') : ''}</div>${n.dc ? `<div class="mut">${esc(n.dc)}</div>` : ''}${ppl(n)}`)).join('') || empty('Chưa có đơn vị nào.');
  return subTop('Nhà thầu & đơn vị', '', inSplit) + `<div class="body"><div class="seg"><button class="${seg === 'nt' ? 'on' : ''}" data-ntseg="nt">Nhà thầu (${S.nhaThau.length})</button><button class="${seg === 'dv' ? 'on' : ''}" data-ntseg="dv">Đơn vị khác (${S.danhBa.length})</button></div><div class="${R.wide ? 'grid2 al' : 'cards'}">${list}</div></div>`;
};
SUB.hop = inSplit => {
  const T0 = today(); const all = S.hop.slice(); const up = all.filter(h => h.luc.slice(0, 10) >= T0).sort((a, b) => a.luc.localeCompare(b.luc)); const past = all.filter(h => h.luc.slice(0, 10) < T0).sort((a, b) => b.luc.localeCompare(a.luc));
  const row = h => { const r = hopRow(h); return r.replace('<div class="grow">', `<div class="grow"><div class="mut">${esc(daById(h.da)?.ten || '')}</div>`); };
  return subTop('Lịch họp', `${up.length} cuộc họp sắp tới`, inSplit) + `<div class="body">${card(h2('Sắp tới') + `<div class="list">${up.map(row).join('') || empty('Không có cuộc họp sắp tới.')}</div>`)}${card(h2('Đã họp') + `<div class="list">${past.slice(0, 30).map(row).join('') || empty('Chưa có.')}</div>`)}</div>`;
};
SUB.dev = inSplit => subTop('Thông tin nhà phát triển', '', inSplit) + `<div class="body">${devCard()}</div>`;
export function devCard() {
  const ln = (k, v) => v ? `<div class="kvr"><span>${k}</span><b>${esc(v)}</b></div>` : '';
  return card(`<div class="wl-logo"><img src="${DEV.logo}" alt="Logo ${esc(DEV.ten)}"></div><div class="mut" style="text-align:center">Nhà phát triển</div><div class="wl-name">${esc(DEV.ten)}</div>${DEV.gioiThieu ? `<p>${esc(DEV.gioiThieu)}</p>` : ''}${ln('Điện thoại / Zalo', DEV.dienThoai)}${ln('Email', DEV.email)}${ln('Website', DEV.website)}${ln('Địa chỉ', DEV.diaChi)}${ln('Mã số thuế', DEV.mst)}<div class="mut" style="text-align:center">Sổ Dự Án trên điện thoại, phiên bản ${__APP_VERSION__}${DEV.banQuyen ? ' · ' + esc(DEV.banQuyen) : ''}</div>`);
}
