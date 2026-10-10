// Báo cáo tiến độ / tài chính: xem trước, xuất Excel (exceljs) và bản in PDF.
import ExcelJS from 'exceljs';
import { S, esc, d, days, today, cat, tc, ntById, donVi, ntRows } from './core.js';

export const RPCOLS = [['nguoi', 'Phụ trách'], ['goc', 'Hạn gốc'], ['hh', 'Hạn hiện hành'], ['xong', 'Ngày hoàn thành'], ['tt', 'Trạng thái'], ['lech', 'Lệch hạn gốc'], ['ghichu', 'Ghi chú']];
const TTN = { xong: 'Đã xong', quahan: 'Quá hạn', saphan: 'Sắp đến hạn', chuabd: 'Chưa thực hiện', danglam: 'Đang làm' };
const TITLE = { tiendo: 'BÁO CÁO TIẾN ĐỘ', taichinh: 'BÁO CÁO TÀI CHÍNH, GIẢI NGÂN', tonghop: 'BÁO CÁO TIẾN ĐỘ VÀ GIẢI NGÂN' };

export function rpScope() { return S.duAnList.map(a => ({ a, gts: S.goiThau.filter(g => g.da === a.id && S.rp.sel.includes(g.id)) })).filter(x => x.gts.length); }
const keepCV = c => { const r = S.rp; return r.loc === 'all' || (r.loc === 'mo' && c.tt !== 'Hoàn thành') || (r.loc === 'quahan' && cat(c) === 'quahan') || (r.loc === 'tre' && (cat(c) === 'quahan' || c.hh !== c.goc || (c.xong && c.xong > c.goc))); };
const lechN = c => { const end = c.xong || (cat(c) === 'quahan' ? today() : c.hh); return Math.round((new Date(end) - new Date(c.goc)) / 864e5) || 0; };
const fmtLech = n => n > 0 ? '+' + n : String(n);
const inPeriod = c => { const r = S.rp; if (!r.tu && !r.den) return true; const x = c.xong || c.hh; return (!r.tu || x >= r.tu) && (!r.den || x <= r.den) || c.tt !== 'Hoàn thành'; };
const cvOf = gid => S.congViec.filter(c => c.gt === gid && inPeriod(c));
function tdRow(cv) { const x = cv.filter(c => c.tt === 'Hoàn thành').length, q = cv.filter(c => cat(c) === 'quahan'); const w = [...q].sort((m, n) => m.hh.localeCompare(n.hh))[0];
  return { n: cv.length, xong: x, dl: cv.length - x - q.length, qh: q.length, pct: cv.length ? Math.round(x / cv.length * 100) : 0, tre: w ? `${w.ten} (${-days(w.hh)} ngày)` : '' }; }
const FK = ['gt', 'tu', 'daNT', 'thuHoi', 'giu', 'daTT', 'congNo'];
const zero = () => Object.fromEntries(FK.map(k => [k, 0]));
const signer = () => ({ lap: S.lic?.name || '', noi: donVi().tinh || '' });

export function rpPreview(scope) {
  const r = S.rp; const out = [];
  out.push(`<div class="paper"><div class="pp-t">${TITLE[r.loai]}</div><p style="text-align:center" class="muted">${r.tu || r.den ? `Kỳ báo cáo ${d(r.tu)} – ${d(r.den)} · ` : ''}${scope.length} dự án · ${r.sel.length} gói thầu</p>`);
  if (r.loai !== 'taichinh') {
    out.push(`<h3 class="pp-s">${r.loai === 'tonghop' ? 'I. ' : ''}Tiến độ</h3><table class="pp"><thead><tr><th>Dự án / gói thầu</th><th class="r">Số việc</th><th class="r">Đã xong</th><th class="r">Đang làm</th><th class="r">Quá hạn</th><th class="r">% xong</th><th>Việc trễ nhất</th></tr></thead><tbody>`);
    const row = (lab, o, cls) => `<tr class="${cls}"><td>${lab}</td><td class="r">${o.n}</td><td class="r">${o.xong}</td><td class="r">${o.dl}</td><td class="r ${o.qh ? 'bad' : ''}">${o.qh}</td><td class="r">${o.pct}%</td><td>${esc(o.tre) || '—'}</td></tr>`;
    scope.forEach(({ a, gts }) => { out.push(row('<b>' + esc(a.ten) + '</b>', tdRow(gts.flatMap(g => cvOf(g.id))), 'sub')); gts.forEach(g => out.push(row('&nbsp;&nbsp;' + esc(g.ma) + ' · ' + esc(g.ten), tdRow(cvOf(g.id)), ''))); });
    out.push('</tbody></table>');
    if (r.ct === 'chitiet') {
      const C = r.cols;
      out.push(`<h3 class="pp-s">Chi tiết từng công việc${r.loc !== 'all' ? ' · ' + { mo: 'chưa xong', quahan: 'quá hạn', tre: 'trễ hoặc lùi hạn' }[r.loc] : ''}</h3>`);
      scope.forEach(({ a, gts }) => gts.forEach(g => { const cv = cvOf(g.id).filter(keepCV).sort((x, y) => (x.goc || '').localeCompare(y.goc || ''));
        out.push(`<p class="pp-g"><b>${esc(g.ma)} · ${esc(g.ten)}</b> <span class="muted">${esc(a.ten)} · ${esc(ntById(g.nt).ten)}</span></p>`);
        out.push(cv.length ? `<table class="pp"><thead><tr><th class="r">TT</th><th>Công việc</th>${C.nguoi ? '<th>Phụ trách</th>' : ''}${C.goc ? '<th>Hạn gốc</th>' : ''}${C.hh ? '<th>Hạn hiện hành</th>' : ''}${C.xong ? '<th>Hoàn thành</th>' : ''}${C.tt ? '<th>Trạng thái</th>' : ''}${C.lech ? '<th class="r">Lệch hạn gốc (ngày)</th>' : ''}${C.ghichu ? '<th style="min-width:120px">Ghi chú</th>' : ''}</tr></thead><tbody>${cv.map((c, i) => { const k = cat(c), l = lechN(c); return `<tr><td class="r">${i + 1}</td><td>${esc(c.ten)}</td>${C.nguoi ? `<td>${esc(c.nguoi)}</td>` : ''}${C.goc ? `<td>${d(c.goc)}</td>` : ''}${C.hh ? `<td>${d(c.hh)}${c.hh !== c.goc ? ' *' : ''}</td>` : ''}${C.xong ? `<td>${c.xong ? d(c.xong) : ''}</td>` : ''}${C.tt ? `<td class="${k === 'quahan' ? 'bad' : k === 'saphan' ? 'warn' : ''}">${TTN[k]}</td>` : ''}${C.lech ? `<td class="r ${l > 0 ? 'bad' : ''}">${fmtLech(l)}</td>` : ''}${C.ghichu ? `<td>${esc(c.ghiChu || '')}</td>` : ''}</tr>`; }).join('')}</tbody></table>` : '<p class="muted">Không có công việc phù hợp bộ lọc.</p>'); }));
      out.push('<p class="muted" style="font-size:11px">* hạn đã điều chỉnh. Lệch hạn gốc: dương là trễ so với kế hoạch ban đầu (việc đang quá hạn tính đến hôm nay, việc chưa xong tính theo hạn hiện hành).</p>');
    }
  }
  if (r.loai !== 'tiendo') {
    const T = zero(); const m = v => Math.round(v / 1e6).toLocaleString('vi-VN');
    out.push(`<h3 class="pp-s">${r.loai === 'tonghop' ? 'II. ' : ''}Tài chính, giải ngân (triệu đồng)</h3><table class="pp"><thead><tr><th>Dự án / gói thầu</th><th class="r">Giá trị HĐ</th><th class="r">Tạm ứng</th><th class="r">Đã nghiệm thu</th><th class="r">Thu hồi TƯ</th><th class="r">Giữ BH</th><th class="r">Đã giải ngân</th><th class="r">% giải ngân</th><th class="r">Công nợ</th></tr></thead><tbody>`);
    const row = (lab, o, cls) => { const gn = o.daTT + o.tu; return `<tr class="${cls}"><td>${lab}</td><td class="r">${m(o.gt)}</td><td class="r">${m(o.tu)}</td><td class="r">${m(o.daNT)}</td><td class="r">${m(o.thuHoi)}</td><td class="r">${m(o.giu)}</td><td class="r">${m(gn)}</td><td class="r">${o.gt ? Math.round(gn / o.gt * 100) : 0}%</td><td class="r ${o.congNo ? 'warn' : ''}">${m(o.congNo)}</td></tr>`; };
    scope.forEach(({ a, gts }) => { const o = zero(); const sub = gts.map(g => { const t = tc(g.id); FK.forEach(k => { o[k] += t[k]; T[k] += t[k]; }); return row('&nbsp;&nbsp;' + esc(g.ma) + ' · ' + esc(g.ten), t, ''); }); out.push(row('<b>' + esc(a.ten) + '</b>', o, 'sub'), ...sub); });
    out.push(row('<b>Tổng cộng</b>', T, 'tot'), '</tbody></table><p class="muted" style="font-size:11px">Đã giải ngân = tạm ứng đã chi + các đợt đã thanh toán.</p>');
  }
  const s = signer(); const t = today();
  if (r.ky) out.push(`<div class="pp-sign"><span>Người lập<br><br><br><br>${esc(s.lap)}</span><span>${esc(s.noi ? s.noi + ', ' : '')}ngày ${t.slice(8)} tháng ${t.slice(5, 7)} năm ${t.slice(0, 4)}<br>Người duyệt<br><br><br></span></div>`);
  out.push('</div>'); return out.join('');
}

/* ---------- Excel ---------- */
const BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
function head(ws, cols) { const r = ws.addRow(cols); r.font = { bold: true }; r.alignment = { vertical: 'middle', wrapText: true }; r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF8' } }; c.border = BORDER; }); }
function body(ws, vals, opt = {}) { const r = ws.addRow(vals); r.eachCell({ includeEmpty: true }, c => { c.border = BORDER; }); if (opt.bold) r.font = { bold: true }; if (opt.fill) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } }); return r; }
function title(ws, text, span) { const r = ws.addRow([text]); r.font = { bold: true, size: 14 }; ws.mergeCells(r.number, 1, r.number, span); r.alignment = { horizontal: 'center' }; }
const MONEY = '#,##0';

function sheetTienDo(ws, scope, detail) {
  ws.columns = [{ width: 46 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 9 }, { width: 44 }];
  head(ws, ['Dự án / gói thầu', 'Số việc', 'Đã xong', 'Đang làm', 'Quá hạn', '% xong', 'Việc trễ nhất']);
  scope.forEach(({ a, gts }) => { const o = tdRow(gts.flatMap(g => cvOf(g.id))); body(ws, [a.ten, o.n, o.xong, o.dl, o.qh, o.pct / 100, o.tre], { bold: true, fill: 'FFF5F7FB' }).getCell(6).numFmt = '0%';
    gts.forEach(g => { const x = tdRow(cvOf(g.id)); body(ws, ['   ' + g.ma + ' · ' + g.ten, x.n, x.xong, x.dl, x.qh, x.pct / 100, x.tre]).getCell(6).numFmt = '0%'; }); });
  if (detail) { ws.addRow([]); scope.forEach(({ gts }) => gts.forEach(g => detailRows(ws, g))); }
}
function detailRows(ws, g) {
  const C = S.rp.cols; const cols = [['TT', 6], ['Công việc', 46]].concat(RPCOLS.filter(([k]) => C[k]).map(([k, l]) => [l, k === 'ghichu' ? 30 : 16]));
  const r = ws.addRow([`${g.ma} · ${g.ten} — ${ntById(g.nt).ten}`]); r.font = { bold: true };
  head(ws, cols.map(c => c[0]));
  cvOf(g.id).filter(keepCV).sort((x, y) => (x.goc || '').localeCompare(y.goc || '')).forEach((c, i) => {
    const v = [i + 1, c.ten]; if (C.nguoi) v.push(c.nguoi || ''); if (C.goc) v.push(d(c.goc)); if (C.hh) v.push(d(c.hh) + (c.hh !== c.goc ? ' *' : '')); if (C.xong) v.push(c.xong ? d(c.xong) : ''); if (C.tt) v.push(TTN[cat(c)]); if (C.lech) v.push(lechN(c)); if (C.ghichu) v.push(c.ghiChu || '');
    const row = body(ws, v); if (cat(c) === 'quahan') row.font = { color: { argb: 'FFB42318' } };
  });
  ws.addRow([]);
}
function sheetTaiChinh(ws, scope) {
  ws.columns = [{ width: 46 }, ...Array(8).fill({ width: 17 })];
  head(ws, ['Dự án / gói thầu', 'Giá trị HĐ', 'Tạm ứng', 'Đã nghiệm thu', 'Thu hồi TƯ', 'Giữ BH', 'Đã giải ngân', '% giải ngân', 'Công nợ']);
  const T = zero();
  const put = (lab, o, opt) => { const gn = o.daTT + o.tu; const r = body(ws, [lab, o.gt, o.tu, o.daNT, o.thuHoi, o.giu, gn, o.gt ? gn / o.gt : 0, o.congNo], opt); [2, 3, 4, 5, 6, 7, 9].forEach(i => r.getCell(i).numFmt = MONEY); r.getCell(8).numFmt = '0%'; };
  scope.forEach(({ a, gts }) => { const o = zero(); gts.forEach(g => { const t = tc(g.id); FK.forEach(k => { o[k] += t[k]; T[k] += t[k]; }); }); put(a.ten, o, { bold: true, fill: 'FFF5F7FB' }); gts.forEach(g => put('   ' + g.ma + ' · ' + g.ten, tc(g.id))); });
  put('Tổng cộng', T, { bold: true, fill: 'FFE8EEF8' });
}
function sheetGoi(ws, g, a) {
  const r = S.rp;
  ws.columns = [{ width: 8 }, { width: 46 }, ...Array(7).fill({ width: 17 })];
  ws.addRow([`${g.ma} · ${g.ten}`]).font = { bold: true, size: 13 };
  ws.addRow([`Dự án: ${a.ten}`]); ws.addRow([`Nhà thầu: ${ntById(g.nt).ten}${g.hd ? ' · HĐ ' + g.hd : ''}`]); ws.addRow([]);
  if (r.loai !== 'taichinh') { const x = tdRow(cvOf(g.id)); ws.addRow([`Tiến độ: ${x.n} việc, ${x.xong} đã xong (${x.pct}%), ${x.qh} quá hạn`]).font = { bold: true }; ws.addRow([]); detailRows(ws, g); }
  if (r.loai !== 'tiendo') {
    const t = tc(g.id); ws.addRow(['Tài chính']).font = { bold: true };
    [['Giá trị hợp đồng', t.gt], ['Tạm ứng', t.tu], ['Đã thu hồi tạm ứng', t.thuHoi], ['Đã nghiệm thu', t.daNT], ['Đã thanh toán', t.daTT], ['Giữ bảo hành', t.giu], ['Công nợ', t.congNo]].forEach(([k, v]) => { const row = body(ws, ['', k, v]); row.getCell(3).numFmt = MONEY; });
    ws.addRow([]); head(ws, ['Đợt', 'Ngày nghiệm thu', 'Giá trị NT', 'Trừ tạm ứng', 'Giữ BH', 'Đề nghị TT', 'Đã trả', 'Hạn trả', 'Trạng thái']);
    ntRows(g.id).forEach(x => { const row = body(ws, [x.dot, d(x.ngay), x.gtri, x.khauTru, x.giu, x.deNghi, x.daTra, d(x.han), x.tt]); [3, 4, 5, 6, 7].forEach(i => row.getCell(i).numFmt = MONEY); });
  }
}

function signRows(ws) { if (!S.rp.ky) return; const s = signer(); const t = today(); ws.addRow([]); ws.addRow(['Người lập', '', '', '', `${s.noi ? s.noi + ', ' : ''}ngày ${t.slice(8)} tháng ${t.slice(5, 7)} năm ${t.slice(0, 4)}`]).font = { bold: true }; ws.addRow(['', '', '', '', 'Người duyệt']).font = { bold: true }; ws.addRow([]); ws.addRow([]); ws.addRow([s.lap]); }

export async function buildXlsx(scope) {
  const r = S.rp; const wb = new ExcelJS.Workbook(); wb.creator = 'Sổ Dự Án'; wb.created = new Date();
  const ws = wb.addWorksheet('Tổng hợp', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  title(ws, TITLE[r.loai], 9);
  const sub = ws.addRow([`${donVi().ten || ''}${r.tu || r.den ? ` · Kỳ báo cáo ${d(r.tu)} – ${d(r.den)}` : ''} · Lập ngày ${d(today())}`]); ws.mergeCells(sub.number, 1, sub.number, 9); sub.alignment = { horizontal: 'center' }; ws.addRow([]);
  if (r.loai !== 'taichinh') { ws.addRow([(r.loai === 'tonghop' ? 'I. ' : '') + 'TIẾN ĐỘ']).font = { bold: true }; sheetTienDo(ws, scope, r.ct === 'chitiet' && !r.sheet); ws.addRow([]); }
  if (r.loai !== 'tiendo') { ws.addRow([(r.loai === 'tonghop' ? 'II. ' : '') + 'TÀI CHÍNH, GIẢI NGÂN (đồng)']).font = { bold: true }; sheetTaiChinh(ws, scope); }
  signRows(ws);
  if (r.sheet) { const used = new Set(['Tổng hợp']); scope.forEach(({ a, gts }) => gts.forEach(g => { let nm = String(g.ma || g.ten).replace(/[\\/*?:[\]]/g, '-').slice(0, 28) || 'Gói'; let k = 2; while (used.has(nm)) nm = nm.slice(0, 26) + '-' + k++; used.add(nm); sheetGoi(wb.addWorksheet(nm, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } }), g, a); })); }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Excel tài chính nhanh từ màn Tài chính: mọi gói thầu đang hiện. */
export async function buildFinanceXlsx() {
  const save = { ...S.rp }; S.rp.loai = 'taichinh'; S.rp.sel = S.goiThau.map(g => g.id); S.rp.sheet = false;
  try { return await buildXlsx(rpScope()); } finally { Object.assign(S.rp, save); }
}

/** In: dựng trang in riêng rồi gọi hộp thoại in của hệ điều hành (chọn "Lưu thành PDF"). */
export function printHtml(html) {
  let el = document.getElementById('print-root'); if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); }
  el.innerHTML = html; document.body.classList.add('printing');
  setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove('printing'); el.innerHTML = ''; }, 500); }, 50);
}
