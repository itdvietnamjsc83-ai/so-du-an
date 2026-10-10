// Nhập nhanh dự án, gói thầu, công việc từ file Excel mẫu; nhập lại để cập nhật tiến độ.
// File mẫu có 3 trang: Dự án, Gói thầu, Công việc. Khớp theo tên dự án, mã gói, tên công việc.
// Ô để trống thì giữ nguyên dữ liệu đang có.
import ExcelJS from 'exceljs';
import { open as openDlg } from '@tauri-apps/plugin-dialog';
import { S, api, esc, today, uid, daById, gtById, can, followed, flush } from './core.js';
import { modal, closeModal, toast } from './ui.js';
import { saveBytes } from './bienban.js';
import { A } from './actions.js';

const TT_CV = ['Chưa làm', 'Đang làm', 'Hoàn thành'];
const TT_DA = ['Chuẩn bị', 'Đang hoạt động', 'Tạm dừng', 'Đã đóng'];
const BH = ['Giữ tiền', 'Nộp bảo lãnh', 'Không có'];

// [khóa, tiêu đề, độ rộng, bắt buộc, loại]
const COLS = {
  da: [['ten', 'Tên dự án', 40, 1], ['cdt', 'Chủ đầu tư', 32, 1], ['cdtDc', 'Địa chỉ chủ đầu tư', 32], ['diaDiem', 'Địa điểm xây dựng', 26],
    ['nhom', 'Nhóm dự án', 12], ['tn', 'Trưởng nhóm phụ trách', 22], ['bd', 'Bắt đầu', 13, 0, 'date'], ['kt', 'Kết thúc dự kiến', 15, 0, 'date'],
    ['tt', 'Trạng thái', 16, 0, 'list', TT_DA], ['ghiChu', 'Ghi chú', 30]],
  gt: [['da', 'Tên dự án', 36, 1], ['ma', 'Mã gói', 12, 1], ['ten', 'Tên gói thầu', 40, 1], ['nt', 'Nhà thầu', 32], ['hd', 'Số hợp đồng', 18],
    ['ngayKy', 'Ngày ký hợp đồng', 15, 0, 'date'], ['gt', 'Giá trị hợp đồng (đ)', 20, 0, 'money', 0, 1], ['tlThuHoi', 'Tỷ lệ thu hồi tạm ứng (%)', 14, 0, 'pct', 0, 1],
    ['soNgayTT', 'Số ngày thanh toán sau nghiệm thu', 14, 0, 'int', 0, 1], ['bhht', 'Hình thức bảo hành', 16, 0, 'list', BH], ['bhtl', 'Tỷ lệ bảo hành (%)', 12, 0, 'pct']],
  cv: [['da', 'Tên dự án', 30, 1], ['gt', 'Mã gói', 11, 1], ['stt', 'STT', 6, 0, 'int'], ['nhom', 'Hạng mục', 24], ['ten', 'Tên công việc', 46, 1],
    ['nguoi', 'Người phụ trách', 20], ['bd', 'Bắt đầu', 13, 0, 'date'], ['hh', 'Hạn hoàn thành', 15, 1, 'date'], ['tt', 'Trạng thái', 13, 0, 'list', TT_CV],
    ['xong', 'Ngày hoàn thành', 15, 0, 'date']],
};
const SHEET = { da: 'Dự án', gt: 'Gói thầu', cv: 'Công việc' };
const cols = k => COLS[k].filter(c => !c[6] || can('xemTC'));

const norm = s => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const keyOf = s => norm(s).replace(/\*$/, '').trim();
const pad = n => String(n).padStart(2, '0');
const toDate = v => new Date(v + 'T00:00:00Z'); // ngày Excel tính theo UTC, tránh lệch 1 ngày ở múi giờ +7

/* ---------- tải file mẫu (kèm dữ liệu đang có trong phạm vi) ---------- */
async function buildTemplate(scope) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Sổ Dự Án';
  const das = scope.gt ? [daById(gtById(scope.gt).da)] : scope.da ? [daById(scope.da)] : scope.empty ? [] : S.duAnList.filter(a => !a.luuTru);
  const gts = scope.gt ? [gtById(scope.gt)] : S.goiThau.filter(g => das.some(a => a.id === g.da));
  const cvs = S.congViec.filter(c => gts.some(g => g.id === c.gt))
    .sort((a, b) => (gtById(a.gt).ma + (a.stt ?? 9999).toString().padStart(5, '0') + (a.goc || '')).localeCompare(gtById(b.gt).ma + (b.stt ?? 9999).toString().padStart(5, '0') + (b.goc || '')));
  const ntName = id => S.nhaThau.find(n => n.id === id)?.ten || '';
  const rows = {
    da: das.map(a => ({ ...a })),
    gt: gts.map(g => ({ ...g, da: daById(g.da)?.ten, nt: ntName(g.nt), tlThuHoi: g.tlThuHoi, bhht: g.bh?.ht, bhtl: g.bh?.tl })),
    cv: cvs.map((c, i) => { const g = gtById(c.gt); return { ...c, da: daById(g.da)?.ten, gt: g.ma, stt: c.stt ?? i + 1 }; }),
  };
  for (const k of ['da', 'gt', 'cv']) {
    const ws = wb.addWorksheet(SHEET[k], { views: [{ state: 'frozen', ySplit: 1 }] });
    const cs = cols(k);
    ws.columns = cs.map(c => ({ header: c[1] + (c[3] ? ' *' : ''), key: c[0], width: c[2] }));
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.height = 30; h.alignment = { vertical: 'middle', wrapText: true };
    cs.forEach((c, i) => { h.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c[3] ? 'FF1F4E79' : 'FF5B7FA6' } }; });
    rows[k].forEach(r => ws.addRow(cs.map(c => {
      const v = r[c[0]]; if (v === undefined || v === null || v === '') return null;
      if (c[4] === 'date') return toDate(v);
      if (c[4] === 'pct') return Math.round(v * 10000) / 100;
      return v;
    })));
    const last = Math.max(rows[k].length + 200, 300);
    cs.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c[4] === 'date') col.numFmt = 'dd/mm/yyyy';
      if (c[4] === 'money') col.numFmt = '#,##0';
      if (c[4] === 'list') for (let r = 2; r <= last; r++) ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + c[5].join(',') + '"'] };
      if (k !== 'da' && c[0] === 'da' && S.duAnList.length) for (let r = 2; r <= last; r++) ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: ["='Dự án'!$A$2:$A$" + last] };
    });
  }
  const hd = wb.addWorksheet('Hướng dẫn');
  hd.getColumn(1).width = 110;
  ['CÁCH DÙNG FILE MẪU NHẬP DỮ LIỆU SỔ DỰ ÁN', '',
    '1. Trang "Dự án": mỗi dòng một dự án. Trang "Gói thầu": mỗi dòng một gói, ghi đúng tên dự án. Trang "Công việc": mỗi dòng một công việc, ghi đúng tên dự án và mã gói.',
    '2. Cột có dấu * là bắt buộc. Ngày ghi dạng 31/12/2026. Tỷ lệ ghi số phần trăm, ví dụ 5 là 5%. Tiền ghi số, ví dụ 1500000000.',
    '3. Có thể chỉ điền một trang, ví dụ chỉ thêm công việc cho gói thầu đã có trong phần mềm.',
    '4. Nhập lại cùng file để cập nhật: phần mềm khớp dự án theo tên, gói thầu theo mã gói, công việc theo hạng mục và tên công việc.',
    '   Dòng đã có thì cập nhật, dòng chưa có thì thêm mới. Ô để trống thì giữ nguyên dữ liệu cũ. Công việc không có trong file thì không bị xóa.',
    '5. Hạn hoàn thành: công việc mới lấy làm hạn gốc. Công việc đã có mà đổi hạn thì phần mềm ghi thành một lần điều chỉnh tiến độ, hạn gốc giữ nguyên.',
    '6. Trạng thái "Hoàn thành" cần Ngày hoàn thành (để trống thì lấy ngày nhập).',
    '7. Nhà thầu chưa có trong danh bạ sẽ được thêm mới theo tên.',
    '8. Nên tải file mẫu từ phần mềm mỗi lần cập nhật: file đã có sẵn dữ liệu hiện tại, chỉ cần sửa rồi nhập lại.',
  ].forEach((t, i) => { const c = hd.getCell(i + 1, 1); c.value = t; c.alignment = { wrapText: true }; if (i === 0) c.font = { bold: true, size: 13 }; });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

A['xl-tpl'] = async el => {
  const sc = el.dataset.scope || ''; const scope = sc.startsWith('da:') ? { da: sc.slice(3) } : sc.startsWith('gt:') ? { gt: sc.slice(3) } : sc === 'empty' ? { empty: 1 } : {};
  const name = scope.gt ? gtById(scope.gt).ma : scope.da ? daById(scope.da).ten : scope.empty ? 'Trong' : 'TatCa';
  const safe = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 40);
  try { const p = await saveBytes(await buildTemplate(scope), `MauNhap_${safe}_${today()}.xlsx`, 'xlsx', 'Excel'); if (p) toast('Đã lưu file mẫu ' + String(p).split(/[\\/]/).pop()); }
  catch (e) { toast('Lỗi tạo file mẫu: ' + e); }
};

/* ---------- đọc file ---------- */
function cellVal(v) {
  if (v && typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}
function parseDate(v) {
  v = cellVal(v); if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') { const x = new Date(Math.round((v - 25569) * 864e5)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; }
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return valid(`${m[3]}-${pad(m[2])}-${pad(m[1])}`);
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valid(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  return null;
}
const valid = s => { const x = new Date(s + 'T00:00:00Z'); return isNaN(x) || x.toISOString().slice(0, 10) !== s ? null : s; };
function parseNum(v) {
  v = cellVal(v); if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[đ\s%]/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(s); return isNaN(n) ? null : n;
}
function readSheet(wb, k) {
  const ws = wb.worksheets.find(w => norm(w.name) === norm(SHEET[k])); if (!ws) return [];
  const map = {}; ws.getRow(1).eachCell((c, i) => { const h = keyOf(cellVal(c.value)); const col = COLS[k].find(x => norm(x[1]) === h); if (col) map[i] = col; });
  const out = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const o = { _r: r }, errs = []; let any = false;
    Object.entries(map).forEach(([i, c]) => {
      const raw = cellVal(row.getCell(+i).value); if (raw === null || raw === undefined || String(raw).trim() === '') return; any = true;
      let v;
      if (c[4] === 'date') { v = parseDate(raw); if (v === null) errs.push(`${c[1]} "${raw}" không phải ngày`); }
      else if (['money', 'int'].includes(c[4])) { v = parseNum(raw); if (v === null) errs.push(`${c[1]} "${raw}" không phải số`); }
      else if (c[4] === 'pct') { v = parseNum(raw); if (v === null) errs.push(`${c[1]} "${raw}" không phải số`); else v = v > 1 ? v / 100 : v; }
      else if (c[4] === 'list') { v = c[5].find(x => norm(x) === norm(raw)); if (!v) errs.push(`${c[1]} "${raw}" phải là: ${c[5].join(', ')}`); }
      else v = String(raw).trim();
      if (v !== null) o[c[0]] = v;
    });
    if (!any) return;
    COLS[k].filter(c => c[3] && Object.values(map).includes(c) && !o[c[0]] && !errs.some(e => e.startsWith(c[1]))).forEach(c => errs.push(`thiếu ${c[1]}`));
    COLS[k].filter(c => c[3] && !Object.values(map).includes(c)).forEach(c => errs.push(`file thiếu cột ${c[1]}`));
    o._err = errs; out.push(o);
  });
  return out;
}

/* ---------- lập kế hoạch nhập (chưa ghi gì) ---------- */
function plan(wb) {
  const P = { da: [], gt: [], cv: [], nt: [], err: [], note: [], dx: {} };
  const err = (k, r, m) => P.err.push(`${SHEET[k]} dòng ${r._r}: ${m}`);
  const daByName = new Map(S.duAnList.map(a => [norm(a.ten), a]));
  const newDa = new Map();
  for (const r of readSheet(wb, 'da')) {
    if (r._err.length) { err('da', r, r._err.join('; ')); continue; }
    const cur = daByName.get(norm(r.ten)) || newDa.get(norm(r.ten));
    if (newDa.has(norm(r.ten))) { err('da', r, 'tên dự án bị trùng trong file'); continue; }
    if (cur) {
      if (followed(cur.id)) { err('da', r, 'dự án đang ở chế độ Chỉ theo dõi'); continue; }
      if (!can('suaDA', cur.id)) { err('da', r, 'vai trò của bạn không sửa dự án'); continue; }
      const ch = diff(cur, r, ['cdt', 'cdtDc', 'diaDiem', 'nhom', 'tn', 'bd', 'kt', 'tt', 'ghiChu']);
      if (Object.keys(ch).length) P.da.push({ cur, ch }); newDa.set(norm(r.ten), cur);
    } else {
      if (!can('taoDA')) { err('da', r, 'vai trò của bạn không tạo dự án'); continue; }
      const x = { id: uid('DA'), tt: 'Đang hoạt động', bd: today(), ten: r.ten, ...strip(r) }; P.da.push({ nu: x }); newDa.set(norm(r.ten), x);
    }
  }
  const findDa = name => daByName.get(norm(name)) || newDa.get(norm(name));
  const ntByName = new Map(S.nhaThau.map(n => [norm(n.ten), n]));
  const gtKey = (daId, ma) => daId + '|' + norm(ma);
  const gtMap = new Map(S.goiThau.map(g => [gtKey(g.da, g.ma), g]));
  const seenGt = new Set();
  for (const r of readSheet(wb, 'gt')) {
    if (r._err.length) { err('gt', r, r._err.join('; ')); continue; }
    const a = findDa(r.da); if (!a) { err('gt', r, `chưa có dự án "${r.da}" (thêm ở trang Dự án)`); continue; }
    if (followed(a.id)) { err('gt', r, 'dự án đang ở chế độ Chỉ theo dõi'); continue; }
    if (!can('suaGT', a.id)) { err('gt', r, 'vai trò của bạn không sửa gói thầu'); continue; }
    const k = gtKey(a.id, r.ma); if (seenGt.has(k)) { err('gt', r, 'mã gói bị trùng trong file'); continue; } seenGt.add(k);
    const v = strip(r); delete v.da;
    if (r.nt) {
      let n = ntByName.get(norm(r.nt));
      if (!n) { if (!can('nhaThau')) { err('gt', r, `chưa có nhà thầu "${r.nt}" và vai trò của bạn không thêm nhà thầu`); continue; } n = { id: uid('NT'), ten: r.nt, nguoi: [] }; ntByName.set(norm(r.nt), n); P.nt.push(n); }
      v.nt = n.id;
    }
    const { bhht, bhtl, ...rest } = v;
    const cur = gtMap.get(k);
    if (cur) {
      const ch = diff(cur, rest, ['ten', 'nt', 'hd', 'ngayKy', 'gt', 'tlThuHoi', 'soNgayTT']);
      const bh = { ...(cur.bh || {}) }; if (bhht && bhht !== bh.ht) bh.ht = bhht; if (bhtl !== undefined && bhtl !== bh.tl) bh.tl = bhtl;
      if (JSON.stringify(bh) !== JSON.stringify(cur.bh || {})) ch.bh = bh;
      if (Object.keys(ch).length) P.gt.push({ cur, ch });
    } else {
      const x = { id: uid('GT'), da: a.id, tamUng: [], gt: 0, tlThuHoi: 0, soNgayTT: 30, ...rest, bh: { ht: bhht || 'Giữ tiền', tl: bhtl ?? 0.05 } };
      P.gt.push({ nu: x }); gtMap.set(k, x);
    }
  }
  const cvKey = (gid, nhom, ten) => gid + '|' + norm(nhom) + '|' + norm(ten);
  const cvMap = new Map(); S.congViec.forEach(c => { const k = cvKey(c.gt, c.nhom, c.ten); cvMap.set(k, cvMap.has(k) ? 'dup' : c); });
  const seenCv = new Set();
  for (const r of readSheet(wb, 'cv')) {
    if (r._err.length) { err('cv', r, r._err.join('; ')); continue; }
    const a = findDa(r.da); if (!a) { err('cv', r, `chưa có dự án "${r.da}"`); continue; }
    const g = gtMap.get(gtKey(a.id, r.gt)); if (!g) { err('cv', r, `dự án "${a.ten}" chưa có gói "${r.gt}" (thêm ở trang Gói thầu)`); continue; }
    if (followed(a.id)) { err('cv', r, 'dự án đang ở chế độ Chỉ theo dõi'); continue; }
    if (!can('themCV', a.id)) { err('cv', r, 'vai trò của bạn không thêm, sửa công việc'); continue; }
    const k = cvKey(g.id, r.nhom, r.ten); if (seenCv.has(k)) { err('cv', r, 'công việc bị trùng trong file (cùng gói, hạng mục, tên)'); continue; } seenCv.add(k);
    const cur = cvMap.get(k);
    if (cur === 'dup') { err('cv', r, 'trong phần mềm có 2 việc trùng tên ở gói này, sửa tay việc này'); continue; }
    if (r.tt === 'Hoàn thành' && r.xong && r.xong > today()) { err('cv', r, 'ngày hoàn thành ở tương lai'); continue; }
    const xong = r.tt === 'Hoàn thành' ? (r.xong || cur?.xong || today()) : undefined;
    if (cur) {
      const ch = diff(cur, { nguoi: r.nguoi, bd: r.bd, nhom: r.nhom, stt: r.stt }, ['nguoi', 'bd', 'nhom', 'stt']);
      if (r.hh && r.hh !== cur.hh) {
        if (!can('dcHan', a.id)) { err('cv', r, 'vai trò của bạn không điều chỉnh hạn'); continue; }
        if (cur.tt !== 'Hoàn thành') { ch.hh = r.hh; (P.dx[g.id] = P.dx[g.id] || []).push({ cv: cur.id, cu: cur.hh, moi: r.hh }); }
      }
      if (r.tt && r.tt !== cur.tt) {
        if (!can('done', a.id)) { err('cv', r, 'vai trò của bạn không đổi trạng thái'); continue; }
        ch.tt = r.tt; ch.xong = r.tt === 'Hoàn thành' ? xong : '';
      } else if (r.tt === 'Hoàn thành' && r.xong && r.xong !== cur.xong) ch.xong = r.xong;
      if (Object.keys(ch).length) P.cv.push({ cur, ch, g });
    } else {
      const x = { id: uid('CV'), gt: g.id, mau: '', ten: r.ten, nhom: r.nhom || '', stt: r.stt ?? '', nguoi: r.nguoi || '', bd: r.bd || '', goc: r.hh, hh: r.hh, pb: 0,
        tt: r.tt || 'Chưa làm', xong: xong || '', notes: [] };
      if (x.tt === 'Hoàn thành' && !can('done', a.id)) x.tt = 'Đang làm';
      P.cv.push({ nu: x, g });
    }
  }
  if (!wb.worksheets.some(w => Object.values(SHEET).some(n => norm(n) === norm(w.name)))) P.err.push('File không có trang "Dự án", "Gói thầu" hay "Công việc". Hãy dùng file mẫu tải từ phần mềm.');
  return P;
}
function strip(r) { const o = {}; Object.keys(r).forEach(k => { if (!k.startsWith('_')) o[k] = r[k]; }); return o; }
function diff(cur, r, keys) { const ch = {}; keys.forEach(k => { if (r[k] !== undefined && r[k] !== '' && r[k] !== cur[k]) ch[k] = r[k]; }); return ch; }

/* ---------- xem trước và ghi ---------- */
let PLAN = null, FNAME = '';
A['xl-imp'] = async () => {
  const p = await openDlg({ multiple: false, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (!p) return;
  FNAME = String(p).split(/[\\/]/).pop();
  try {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(new Uint8Array(await api('read_file', { path: String(p) })).buffer);
    PLAN = plan(wb);
  } catch (e) { toast('Không đọc được file Excel: ' + e); return; }
  const c = (list) => [list.filter(x => x.nu).length, list.filter(x => x.cur).length];
  const [daN, daU] = c(PLAN.da), [gtN, gtU] = c(PLAN.gt), [cvN, cvU] = c(PLAN.cv);
  const ndx = Object.values(PLAN.dx).reduce((s, x) => s + x.length, 0);
  const total = PLAN.da.length + PLAN.gt.length + PLAN.cv.length + PLAN.nt.length;
  modal('Nhập từ Excel · ' + FNAME, `<div class="tbl-wrap"><table><thead><tr><th></th><th class="r">Thêm mới</th><th class="r">Cập nhật</th></tr></thead><tbody>
    <tr><td>Dự án</td><td class="r num">${daN}</td><td class="r num">${daU}</td></tr>
    <tr><td>Gói thầu</td><td class="r num">${gtN}</td><td class="r num">${gtU}</td></tr>
    <tr><td>Công việc</td><td class="r num">${cvN}</td><td class="r num">${cvU}</td></tr>
    ${PLAN.nt.length ? `<tr><td>Nhà thầu mới</td><td class="r num">${PLAN.nt.length}</td><td class="r">—</td></tr>` : ''}</tbody></table></div>
    ${ndx ? `<div class="note">${ndx} công việc đổi hạn hoàn thành. Phần mềm ghi thành điều chỉnh tiến độ với lý do bên dưới; hạn gốc giữ nguyên.</div>
      <div class="field"><label for="xl-lydo">Lý do điều chỉnh</label><input id="xl-lydo" value="Cập nhật tiến độ theo file ${esc(FNAME)}"></div>` : ''}
    ${PLAN.err.length ? `<div class="err" style="max-height:30vh;overflow:auto"><b>${PLAN.err.length} dòng bị bỏ qua:</b><br>${PLAN.err.slice(0, 200).map(esc).join('<br>')}</div>` : ''}
    ${!total && !PLAN.err.length ? '<p class="muted">Dữ liệu trong file giống hệt phần mềm, không có gì để cập nhật.</p>' : ''}`,
    `<button class="btn" data-close="1">Hủy</button>${total ? `<button class="btn pri" data-act="xl-ok">Nhập ${total} mục</button>` : ''}`, 'wide');
};
A['xl-ok'] = async () => {
  const P = PLAN; if (!P) return;
  const lyDo = document.getElementById('xl-lydo')?.value.trim() || 'Cập nhật tiến độ từ Excel';
  P.nt.forEach(n => S.nhaThau.push(n));
  P.da.forEach(x => x.nu ? S.duAnList.push(x.nu) : Object.assign(x.cur, x.ch));
  P.gt.forEach(x => x.nu ? S.goiThau.push(x.nu) : Object.assign(x.cur, x.ch));
  P.cv.forEach(x => { if (x.nu) S.congViec.push(x.nu); else { if (x.ch.hh) x.cur.pb = (x.cur.pb || 0) + 1; Object.assign(x.cur, x.ch); } });
  Object.entries(P.dx).forEach(([gid, dong]) => S.deXuat.push({ id: uid('DX'), gt: gid, nguoi: S.lic.name, ngay: today(), vb: '', lyDo, tt: 'Đã áp dụng', dong }));
  PLAN = null; closeModal();
  const n = await flush(); window.dispatchEvent(new Event('sda-render'));
  toast(n ? `Đã nhập từ ${FNAME}: ${P.da.length} dự án, ${P.gt.length} gói thầu, ${P.cv.length} công việc` : 'Không có thay đổi');
};

export { buildTemplate, plan, parseDate, parseNum };
