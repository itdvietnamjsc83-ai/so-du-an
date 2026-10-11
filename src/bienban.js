// Biên bản mẫu: thư viện mẫu Word, tạo biên bản tự điền, tạo khung mẫu mới, nạp thay thế theo tên.
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { save as saveDlg, open as openDlg } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { S, api, esc, d, vnd, today, uid, gtById, daById, ntById, donVi, ntRows, tc, cat, days, bbNorm, flush, kvSet } from './core.js';
import { modal, closeModal, toast, ic, confirmBox } from './ui.js';

const ASSETS = import.meta.glob('./templates/*.docx', { query: '?url', import: 'default', eager: true });
const asset = n => ASSETS[`./templates/${n}.docx`];

export const BUILTIN = [
  ['BM01', 'Họp', 'Giấy mời họp', 'Mời các bên dự họp: thời gian, địa điểm, nội dung, thành phần'],
  ['BM02', 'Họp', 'Biên bản họp', 'Ghi nội dung họp, ý kiến các bên, kết luận và phân công'],
  ['BM03', 'Làm việc', 'Biên bản làm việc', 'Làm việc với nhà thầu, tư vấn về một nội dung cụ thể'],
  ['BM04', 'Làm việc', 'Biên bản kiểm tra hiện trường', 'Ghi hiện trạng, tồn tại và yêu cầu khắc phục'],
  ['BM05', 'Nghiệm thu', 'Biên bản nghiệm thu công việc xây dựng', 'Nghiệm thu từng công việc trước khi chuyển bước'],
  ['BM06', 'Nghiệm thu', 'Biên bản nghiệm thu giai đoạn, bộ phận', 'Nghiệm thu hoàn thành giai đoạn hoặc bộ phận công trình'],
  ['BM07', 'Nghiệm thu', 'Biên bản nghiệm thu khối lượng để thanh toán', 'Lấy số liệu từ đợt nghiệm thu đã ghi trong phần Tài chính'],
  ['BM08', 'Nghiệm thu', 'Biên bản nghiệm thu hoàn thành đưa vào sử dụng', 'Nghiệm thu hạng mục hoặc công trình hoàn thành'],
  ['BM09', 'Bàn giao', 'Biên bản bàn giao mặt bằng', 'Bàn giao mặt bằng thi công cho nhà thầu'],
  ['BM10', 'Bàn giao', 'Biên bản bàn giao công trình', 'Bàn giao công trình, hồ sơ cho chủ đầu tư'],
  ['BM11', 'Văn bản', 'Công văn đôn đốc tiến độ', 'Gửi nhà thầu khi gói thầu có việc quá hạn; tự liệt kê việc trễ'],
  ['BM12', 'Văn bản', 'Tờ trình', 'Trình chủ đầu tư xem xét, phê duyệt'],
];
export const BUILTIN_NHOM = ['Họp', 'Làm việc', 'Nghiệm thu', 'Bàn giao', 'Văn bản'];

/** Trường lấy từ dữ liệu phần mềm. Gõ {Mã trường} vào file Word, khi tạo biên bản phần mềm tự điền. */
export const TPF = [
  ['Dự án', [['DuAn.Ten', 'Tên dự án'], ['DuAn.DiaDiem', 'Địa điểm xây dựng'], ['DuAn.NhomDuAn', 'Nhóm dự án'], ['DuAn.NgayBatDau', 'Ngày bắt đầu'], ['DuAn.NgayKetThuc', 'Ngày kết thúc'], ['DuAn.TruongNhom', 'Trưởng nhóm phụ trách'], ['DuAn.TrangThai', 'Trạng thái dự án']]],
  ['Chủ đầu tư', [['ChuDauTu.Ten', 'Tên chủ đầu tư'], ['ChuDauTu.DiaChi', 'Địa chỉ'], ['ChuDauTu.DaiDien', 'Người đại diện'], ['ChuDauTu.ChucVu', 'Chức vụ'], ['ChuDauTu.DanhSachNguoi', 'Danh sách người của chủ đầu tư']]],
  ['Tư vấn QLDA (đơn vị mình)', [['TuVanQLDA.Ten', 'Tên đơn vị'], ['TuVanQLDA.DiaChi', 'Địa chỉ'], ['TuVanQLDA.DaiDien', 'Người đại diện'], ['TuVanQLDA.ChucVu', 'Chức vụ người đại diện'], ['TuVanQLDA.DanhSachNguoi', 'Danh sách cán bộ']]],
  ['Gói thầu, hợp đồng', [['GoiThau.Ma', 'Mã gói'], ['GoiThau.Ten', 'Tên gói thầu'], ['HopDong.So', 'Số hợp đồng'], ['HopDong.Ngay', 'Ngày ký'], ['HopDong.GiaTri', 'Giá trị hợp đồng'], ['HopDong.GiaTriBangChu', 'Giá trị hợp đồng bằng chữ'],
    ['HopDong.TamUng', 'Tổng tạm ứng'], ['HopDong.TyLeThuHoiTamUng', 'Tỷ lệ thu hồi tạm ứng mỗi đợt'], ['HopDong.TamUngConLai', 'Tạm ứng còn phải thu hồi'], ['HopDong.SoNgayThanhToan', 'Số ngày phải thanh toán sau nghiệm thu'],
    ['HopDong.DaNghiemThu', 'Lũy kế đã nghiệm thu'], ['HopDong.DaThanhToan', 'Lũy kế đã thanh toán'], ['HopDong.CongNo', 'Công nợ còn phải trả'], ['HopDong.ConLai', 'Giá trị hợp đồng chưa nghiệm thu']]],
  ['Nhà thầu', [['NhaThau.Ten', 'Tên nhà thầu'], ['NhaThau.DiaChi', 'Địa chỉ'], ['NhaThau.DaiDien', 'Người đại diện'], ['NhaThau.ChucVu', 'Chức vụ'], ['NhaThau.DienThoai', 'Điện thoại'], ['NhaThau.Email', 'Email'], ['NhaThau.DanhSachNguoi', 'Danh sách người của nhà thầu']]],
  ['Nghiệm thu, thanh toán (đợt chọn khi tạo biên bản)', [['DotNghiemThu.So', 'Đợt số'], ['DotNghiemThu.Ngay', 'Ngày nghiệm thu'], ['DotNghiemThu.GiaTri', 'Giá trị nghiệm thu'], ['DotNghiemThu.GiaTriBangChu', 'Giá trị nghiệm thu bằng chữ'], ['DotNghiemThu.LuyKe', 'Lũy kế nghiệm thu đến đợt này'],
    ['DotNghiemThu.KhauTruTamUng', 'Khấu trừ tạm ứng'], ['DotNghiemThu.GiuBaoHanh', 'Giữ bảo hành'], ['DotNghiemThu.DeNghiThanhToan', 'Đề nghị thanh toán'], ['DotNghiemThu.DeNghiBangChu', 'Đề nghị thanh toán bằng chữ'],
    ['DotNghiemThu.DaTra', 'Đã trả cho đợt'], ['DotNghiemThu.ConPhaiTra', 'Còn phải trả của đợt'], ['DotNghiemThu.HanThanhToan', 'Hạn thanh toán']]],
  ['Bảo hành', [['BaoHanh.HinhThuc', 'Hình thức bảo hành'], ['BaoHanh.TyLe', 'Tỷ lệ bảo hành'], ['BaoHanh.HetHan', 'Ngày hết thời gian bảo hành'], ['BaoHanh.TienDangGiu', 'Tiền đang giữ bảo hành'],
    ['BaoHanh.SoThu', 'Số thư bảo lãnh'], ['BaoHanh.NganHang', 'Ngân hàng bảo lãnh'], ['BaoHanh.GiaTriThu', 'Giá trị thư bảo lãnh'], ['BaoHanh.ThuHetHan', 'Ngày thư bảo lãnh hết hạn']]],
  ['Quyết toán', [['QuyetToan.GiaTri', 'Giá trị quyết toán'], ['QuyetToan.GiaTriBangChu', 'Giá trị quyết toán bằng chữ'], ['QuyetToan.NgayPheDuyet', 'Ngày phê duyệt'], ['QuyetToan.ConPhaiTra', 'Còn phải trả nhà thầu']]],
  ['Tiến độ gói thầu', [['TienDo.TongViec', 'Tổng số công việc'], ['TienDo.DaXong', 'Số việc đã xong'], ['TienDo.PhanTram', 'Phần trăm hoàn thành'], ['TienDo.SoViecQuaHan', 'Số việc quá hạn'], ['ViecQuaHan', 'Danh sách việc quá hạn'], ['TienDo.ViecSapDenHan', 'Danh sách việc sắp đến hạn (7 ngày)'], ['TienDo.ViecDangLam', 'Danh sách việc đang làm'], ['TienDo.ViecDaXong', 'Danh sách việc đã xong']]],
  ['Chung', [['SoVanBan', 'Số văn bản'], ['Ngay', 'Ngày lập (ngày ... tháng ... năm ...)'], ['NgaySo', 'Ngày lập dạng dd/mm/yyyy'], ['Nam', 'Năm lập'], ['DiaDiem', 'Địa danh'], ['ThanhPhan', 'Thành phần tham gia (chọn khi tạo)']]],
];
const KNOWN = new Set(TPF.flatMap(([, f]) => f.map(x => x[0])));
const FLABEL = Object.fromEntries(TPF.flatMap(([, f]) => f));
const LABEL2K = Object.fromEntries(TPF.flatMap(([, f]) => f.map(([k, l]) => [l, k])));
const RIENG_LABEL = { ThoiGianHop: 'Thời gian họp', DiaDiemHop: 'Địa điểm họp', NoiDungHop: 'Nội dung họp', ChuTri: 'Chủ trì', YKien: 'Ý kiến các bên', KetLuan: 'Kết luận', DiaDiemLamViec: 'Địa điểm làm việc', NoiDungLamViec: 'Nội dung làm việc', HienTrang: 'Hiện trạng', YeuCau: 'Tồn tại, yêu cầu khắc phục', ThoiHanKhacPhuc: 'Thời hạn khắc phục', CongViecNghiemThu: 'Công việc nghiệm thu', ViTri: 'Vị trí', CanCu: 'Căn cứ', DanhGia: 'Đánh giá', BoPhan: 'Giai đoạn, bộ phận', HangMuc: 'Hạng mục, công trình', NoiDungBanGiao: 'Nội dung bàn giao', HoSoKemTheo: 'Hồ sơ kèm theo', HanBaoCao: 'Hạn báo cáo', NoiDungTrinh: 'Nội dung trình', DeXuat: 'Đề xuất' };
const LONG = new Set(['NoiDungHop', 'YKien', 'KetLuan', 'NoiDungLamViec', 'HienTrang', 'YeuCau', 'DanhGia', 'NoiDungBanGiao', 'HoSoKemTheo', 'NoiDungTrinh', 'DeXuat', 'CanCu']);
const rLabel = k => RIENG_LABEL[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2');

/* ---------- tệp ---------- */
const toBytes = v => v instanceof Uint8Array ? v : new Uint8Array(v);
export const readStored = async rel => toBytes(await api('file_read', { rel }));
async function store(bytes, name) { return api('file_store', { src: null, name, bytes: Array.from(bytes) }); }
export async function saveBytes(bytes, defName, ext, label) {
  const path = await saveDlg({ defaultPath: defName, filters: [{ name: label, extensions: [ext] }] });
  if (!path) return null;
  await api('save_file', { path, bytes: Array.from(bytes) });
  return path;
}
async function saveAndOpen(bytes, name) {
  const p = await saveBytes(bytes, name, 'docx', 'Word'); if (!p) return;
  toast('Đã lưu ' + p.split(/[\\/]/).pop());
  try { await openPath(p); } catch { /* không có Word thì thôi */ }
}

/** Đọc các trường {…} trong file Word. */
export function scanTags(bytes) {
  const zip = new PizZip(bytes); const out = new Set();
  Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).forEach(n => {
    const txt = zip.file(n).asText().replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => p.replace(/<[^>]+>/g, '') + '\n');
    for (const m of txt.matchAll(/\{([^{}\n]{1,60})\}/g)) out.add(m[1].trim());
  });
  return [...out];
}
const lev = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
function classify(tags) {
  const known = [], rieng = [], typo = [];
  tags.forEach(t => { if (KNOWN.has(t)) known.push(t); else if (/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)?$/.test(t)) { const near = [...KNOWN].find(k => lev(k, t) <= 2); if (near && t.includes('.')) typo.push([t, near]); else if (t.includes('.')) typo.push([t, null]); else rieng.push(t); } else typo.push([t, null]); });
  return { known, rieng, typo };
}

/* ---------- nạp mẫu có sẵn lần đầu ---------- */
export async function seedBuiltins() {
  if (S.kv.bbSeeded || !S.lic?.activated) return;
  for (const [id, nhom, ten, mt] of BUILTIN) {
    if (S.bienBanMau.some(b => b.id === id)) continue;
    const bytes = new Uint8Array(await (await fetch(asset(id))).arrayBuffer());
    const file = await store(bytes, ten + '.docx');
    S.bienBanMau.push({ id, nhom, ten, mt, file, ver: 1, ngay: today(), ls: [], builtin: true, rieng: classify(scanTags(bytes)).rieng });
  }
  await flush(); await kvSet('bbSeeded', true);
}

/* ---------- dữ liệu điền vào mẫu ---------- */
const CS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function ba(n, full) { const tr = Math.floor(n / 100), ch = Math.floor(n / 10) % 10, dv = n % 10; const o = [];
  if (full || tr) o.push(CS[tr] + ' trăm');
  if (ch > 1) o.push(CS[ch] + ' mươi'); else if (ch === 1) o.push('mười'); else if ((full || tr) && dv) o.push('lẻ');
  if (dv) o.push(dv === 1 && ch > 1 ? 'mốt' : dv === 5 && ch > 0 ? 'lăm' : dv === 4 && ch > 1 ? 'tư' : CS[dv]);
  return o.join(' '); }
/** Đọc số tiền thành chữ: 1250000 → "Một triệu hai trăm năm mươi nghìn đồng". */
export function docTien(x) {
  let n = Math.round(Math.abs(+x || 0)); if (!n) return 'Không đồng';
  const U = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']; const g = []; while (n > 0) { g.push(n % 1000); n = Math.floor(n / 1000); }
  const out = []; for (let i = g.length - 1; i >= 0; i--) if (g[i]) out.push(ba(g[i], i < g.length - 1), U[i]);
  const s = out.join(' ').replace(/\s+/g, ' ').trim(); return (x < 0 ? 'Âm ' : '') + s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

const ngayVN = s => `ngày ${s.slice(8)} tháng ${s.slice(5, 7)} năm ${s.slice(0, 4)}`;
function orgsOf(b) {
  const a = daById(b.da); if (!a) return [];
  const dv = donVi(); const gts = S.goiThau.filter(g => g.da === b.da && (!b.gt || g.id === b.gt));
  const o = [{ k: 'cdt', loai: 'Chủ đầu tư', ten: a.cdt, dc: a.cdtDc || '', nguoi: a.cdtNguoi || [] }, { k: 'qlda', loai: 'Tư vấn quản lý dự án', ten: dv.ten || '(chưa nhập tên đơn vị)', dc: dv.dc, nguoi: dv.nguoi || [] }];
  (a.donViKhac || []).forEach(id => { const x = S.danhBa.find(n => n.id === id); if (x) o.push({ k: 'db-' + id, loai: x.loai || 'Đơn vị', ten: x.ten, dc: x.dc, nguoi: x.nguoi || [] }); });
  const seen = new Set(); gts.forEach(g => { const n = S.nhaThau.find(x => x.id === g.nt); if (!n || seen.has(n.id)) return; seen.add(n.id); o.push({ k: 'nt-' + n.id, loai: 'Nhà thầu', ten: n.ten, dc: n.dc, nguoi: n.nguoi || [] }); });
  return o;
}
export function dataFor(b, tpl) {
  const a = daById(b.da) || {}; const g = b.gt ? gtById(b.gt) : null; const n = g ? ntById(g.nt) : {}; const dv = donVi();
  const nt = g && b.dot ? ntRows(g.id).find(x => x.id === b.dot) : null;
  const orgs = orgsOf(b).filter(o => b.org[o.k]);
  const moi = tpl.nhom === 'Họp' && /mời/i.test(tpl.ten);
  const lines = [];
  orgs.forEach(o => { const ps = o.nguoi.filter((_, i) => b.pick[o.k + ':' + i]);
    if (moi) lines.push(`- ${o.loai}: ${o.ten}`);
    else { lines.push(`Đại diện ${o.loai}: ${o.ten}`); ps.forEach(p => lines.push(`   - ${p.ten}${p.cv ? ' – ' + p.cv : ''}`)); } });
  const ex = b.extra.filter(x => x.ten || x.dv);
  if (ex.length) { if (!moi) lines.push('Thành phần khác:'); ex.forEach(x => lines.push(`${moi ? '- ' : '   - '}${x.ten}${x.cv ? ' – ' + x.cv : ''}${x.dv ? ' (' + x.dv + ')' : ''}`)); }
  const dd0 = (a.cdtNguoi || [])[0] || {}, nd0 = (n.nguoi || [])[0] || {};
  const qh = g ? S.congViec.filter(c => c.gt === g.id && cat(c) === 'quahan').map((c, i) => `${i + 1}. ${c.ten}: hạn ${d(c.hh)}, đã quá ${-days(c.hh)} ngày`).join('\n') : '';
  const v = {
    'DuAn.Ten': a.ten, 'DuAn.DiaDiem': a.diaDiem, 'DuAn.NhomDuAn': a.nhom,
    'ChuDauTu.Ten': a.cdt, 'ChuDauTu.DiaChi': a.cdtDc, 'ChuDauTu.DaiDien': dd0.ten, 'ChuDauTu.ChucVu': dd0.cv,
    'TuVanQLDA.Ten': dv.ten, 'TuVanQLDA.DiaChi': dv.dc, 'TuVanQLDA.DaiDien': (dv.nguoi || [])[0]?.ten,
    'GoiThau.Ma': g?.ma, 'GoiThau.Ten': g?.ten, 'HopDong.So': g?.hd, 'HopDong.Ngay': g?.ngayKy ? d(g.ngayKy) : '', 'HopDong.GiaTri': g ? vnd(g.gt) : '',
    'NhaThau.Ten': n.ten, 'NhaThau.DiaChi': n.dc, 'NhaThau.DaiDien': nd0.ten, 'NhaThau.ChucVu': nd0.cv,
    'DotNghiemThu.So': nt?.dot, 'DotNghiemThu.GiaTri': nt ? vnd(nt.gtri) : '', 'DotNghiemThu.KhauTruTamUng': nt ? vnd(nt.khauTru) : '', 'DotNghiemThu.GiuBaoHanh': nt ? vnd(nt.giu) : '', 'DotNghiemThu.DeNghiThanhToan': nt ? vnd(nt.deNghi) : '',
    SoVanBan: b.so || '....../' + (moi ? 'GM' : 'BB'), Ngay: ngayVN(b.ngay || today()), DiaDiem: dv.tinh || '', ThanhPhan: lines.join('\n'), ViecQuaHan: qh || '(không có việc quá hạn)',
  };
  const t = g ? tc(g.id) : null; const bh = g?.bh || {}; const qt = g?.qt || null; const cvG = g ? S.congViec.filter(c => c.gt === g.id).sort((x, y) => (x.hh || '').localeCompare(y.hh || '')) : [];
  const ds = arr => arr.map((c, i) => `${i + 1}. ${c.ten}: hạn ${d(c.hh)}${c.nguoi ? ', ' + c.nguoi : ''}`).join('\n');
  const people = ps => (ps || []).map(p => `- ${p.ten}${p.cv ? ' – ' + p.cv : ''}`).join('\n');
  const pc = x => ((x || 0) * 100).toLocaleString('vi-VN') + '%';
  const luyKe = nt ? ntRows(g.id).filter(x => x.dot <= nt.dot).reduce((s, x) => s + x.gtri, 0) : 0;
  const gtq = qt?.gt ?? t?.daNT ?? 0;
  Object.assign(v, {
    'DuAn.NgayBatDau': d(a.bd || ''), 'DuAn.NgayKetThuc': d(a.kt || ''), 'DuAn.TruongNhom': a.tn, 'DuAn.TrangThai': a.tt,
    'ChuDauTu.DanhSachNguoi': people(a.cdtNguoi), 'TuVanQLDA.ChucVu': (dv.nguoi || [])[0]?.cv, 'TuVanQLDA.DanhSachNguoi': people(dv.nguoi),
    'HopDong.GiaTriBangChu': g ? docTien(g.gt) : '', 'HopDong.TamUng': t ? vnd(t.tu) : '', 'HopDong.TyLeThuHoiTamUng': g ? pc(g.tlThuHoi) : '', 'HopDong.TamUngConLai': t ? vnd(t.tuCon) : '', 'HopDong.SoNgayThanhToan': g ? String(g.soNgayTT || 30) : '',
    'HopDong.DaNghiemThu': t ? vnd(t.daNT) : '', 'HopDong.DaThanhToan': t ? vnd(t.daTT) : '', 'HopDong.CongNo': t ? vnd(t.congNo) : '', 'HopDong.ConLai': t ? vnd(t.conLaiHD) : '',
    'NhaThau.DienThoai': n.sdt, 'NhaThau.Email': n.email, 'NhaThau.DanhSachNguoi': people(n.nguoi),
    'DotNghiemThu.Ngay': nt ? d(nt.ngay) : '', 'DotNghiemThu.GiaTriBangChu': nt ? docTien(nt.gtri) : '', 'DotNghiemThu.LuyKe': nt ? vnd(luyKe) : '', 'DotNghiemThu.DeNghiBangChu': nt ? docTien(nt.deNghi) : '',
    'DotNghiemThu.DaTra': nt ? vnd(nt.daTra) : '', 'DotNghiemThu.ConPhaiTra': nt ? vnd(Math.max(nt.con, 0)) : '', 'DotNghiemThu.HanThanhToan': nt ? d(nt.han) : '',
    'BaoHanh.HinhThuc': g ? (bh.ht || 'Không có') : '', 'BaoHanh.TyLe': g ? pc(bh.tl) : '', 'BaoHanh.HetHan': bh.hhBH ? d(bh.hhBH) : '', 'BaoHanh.TienDangGiu': t ? vnd(t.giu) : '',
    'BaoHanh.SoThu': bh.so, 'BaoHanh.NganHang': bh.nh, 'BaoHanh.GiaTriThu': bh.gt ? vnd(bh.gt) : '', 'BaoHanh.ThuHetHan': bh.hh ? d(bh.hh) : '',
    'QuyetToan.GiaTri': g ? vnd(gtq) : '', 'QuyetToan.GiaTriBangChu': g ? docTien(gtq) : '', 'QuyetToan.NgayPheDuyet': qt?.ngay ? d(qt.ngay) : '', 'QuyetToan.ConPhaiTra': t ? vnd(gtq - t.tu - t.daTT) : '',
    'TienDo.TongViec': g ? String(cvG.length) : '', 'TienDo.DaXong': g ? String(cvG.filter(c => c.tt === 'Hoàn thành').length) : '', 'TienDo.PhanTram': g ? (cvG.length ? Math.round(cvG.filter(c => c.tt === 'Hoàn thành').length / cvG.length * 100) : 0) + '%' : '',
    'TienDo.SoViecQuaHan': g ? String(cvG.filter(c => cat(c) === 'quahan').length) : '', 'TienDo.ViecSapDenHan': ds(cvG.filter(c => c.tt !== 'Hoàn thành' && days(c.hh) >= 0 && days(c.hh) <= 7)),
    'TienDo.ViecDangLam': ds(cvG.filter(c => c.tt === 'Đang làm')), 'TienDo.ViecDaXong': cvG.filter(c => c.tt === 'Hoàn thành').map((c, i) => `${i + 1}. ${c.ten}: xong ${d(c.xong)}`).join('\n'),
    NgaySo: d(b.ngay || today()), Nam: (b.ngay || today()).slice(0, 4),
  });
  b.fields.forEach(f => { if (f.k) v[f.k] = f.v; });
  Object.entries(b.ov || {}).forEach(([k, x]) => { v[k] = x; });
  Object.keys(v).forEach(k => { if (v[k] === undefined || v[k] === null) v[k] = ''; v[k] = String(v[k]); });
  return v;
}
function render(bytes, data, extraParas) {
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: p => p.module ? '' : '{' + p.value + '}' });
  doc.render(data);
  const out = doc.getZip();
  if (extraParas.length) {
    let xml = out.file('word/document.xml').asText();
    const p = extraParas.map(([k, v]) => `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xe(k)}: </w:t></w:r><w:r><w:t xml:space="preserve">${xe(v)}</w:t></w:r></w:p>`).join('');
    const i = xml.lastIndexOf('<w:tbl>'); const j = xml.lastIndexOf('<w:sectPr');
    const at = i > xml.indexOf('<w:body>') + 200 ? i : j; xml = xml.slice(0, at) + p + xml.slice(at);
    out.file('word/document.xml', xml);
  }
  return out.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- tạo biên bản từ mẫu ---------- */
export async function bbNew(id) {
  const tpl = S.bienBanMau.find(x => x.id === id); if (!tpl) return;
  let used = []; try { used = classify(scanTags(await readStored(tpl.file))).known; } catch { /* mẫu hỏng: vẫn cho tạo */ }
  const g0 = gtById(S.gtSel) || null; const da = g0?.da || S.duAn || S.duAnList[0]?.id;
  if (!da) { toast('Cần tạo dự án trước'); return; }
  S.bb = { id, da, gt: g0 && g0.da === da ? g0.id : '', org: {}, pick: {}, extra: [], so: '', ngay: today(), dot: '', hop: tpl.nhom === 'Họp', hopLuc: '', used, ov: {},
    fields: (tpl.rieng || []).map(k => ({ k, v: '', fix: 1 })) };
  bbDefaults(); bbModal();
}
function bbDefaults(keep) { const b = S.bb; if (!keep) { b.org = {}; b.pick = {}; } orgsOf(b).forEach(o => { if (o.k in b.org) return; b.org[o.k] = true; if (o.nguoi[0]) b.pick[o.k + ':0'] = true; }); }
export function bbModal() {
  const b = S.bb, tpl = S.bienBanMau.find(x => x.id === b.id), orgs = orgsOf(b);
  const gopts = S.goiThau.filter(x => x.da === b.da); const g = b.gt ? gtById(b.gt) : null;
  const nts = g ? ntRows(g.id) : [];
  const left = `<div class="grid-f">
    <div class="field"><label for="bb-da">Dự án</label><select id="bb-da">${S.duAnList.map(x => `<option value="${x.id}" ${x.id === b.da ? 'selected' : ''}>${esc(x.ten)}</option>`).join('')}</select></div>
    <div class="field"><label for="bb-gt">Gói thầu</label><select id="bb-gt"><option value="">Cả dự án (không theo gói)</option>${gopts.map(x => `<option value="${x.id}" ${x.id === b.gt ? 'selected' : ''}>${esc(x.ma)} · ${esc(x.ten)}</option>`).join('')}</select></div>
    <div class="field"><label for="bb-so">Số văn bản</label><input id="bb-so" data-bbv="so" value="${esc(b.so)}" placeholder="Để trống: ....../BB"></div>
    <div class="field"><label for="bb-ngay">Ngày lập</label><input id="bb-ngay" type="date" data-bbv="ngay" value="${b.ngay}"></div>
    ${nts.length ? `<div class="field full"><label for="bb-dot">Đợt nghiệm thu (điền số liệu thanh toán)</label><select id="bb-dot" data-bbv="dot"><option value="">Không dùng</option>${nts.map(x => `<option value="${x.id}" ${x.id === b.dot ? 'selected' : ''}>Đợt ${x.dot} · ${d(x.ngay)} · ${vnd(x.gtri)}</option>`).join('')}</select></div>` : ''}</div>
    <div class="bbsec"><h3>Thành phần</h3><p class="muted">Lấy từ dữ liệu dự án: chủ đầu tư, đơn vị mình, đơn vị khác gắn với dự án, nhà thầu của gói. Tích đơn vị và người cụ thể.</p>
    ${orgs.map(o => `<div class="bborg ${b.org[o.k] ? '' : 'off'}"><label class="rp-l"><input type="checkbox" class="check" data-bbo="${o.k}" ${b.org[o.k] ? 'checked' : ''}><b>${esc(o.loai)}:</b> ${esc(o.ten)}</label>
      ${o.nguoi.map((n, i) => `<label class="rp-l rp-gt"><input type="checkbox" class="check" data-bbp="${o.k}:${i}" ${b.pick[o.k + ':' + i] ? 'checked' : ''} ${b.org[o.k] ? '' : 'disabled'}>${esc(n.ten)} <span class="muted" style="margin-left:0">· ${esc(n.cv)}</span></label>`).join('') || '<span class="muted rp-gt" style="font-size:12px">Chưa có người. Thêm người ở mục Nhà thầu & đơn vị hoặc thông tin dự án.</span>'}</div>`).join('')}
    ${b.extra.map((x, i) => `<div class="bbrow"><input placeholder="Họ tên" value="${esc(x.ten)}" data-bbx="${i},ten" aria-label="Họ tên"><input placeholder="Chức vụ" value="${esc(x.cv)}" data-bbx="${i},cv" aria-label="Chức vụ"><input placeholder="Đơn vị, bộ phận" value="${esc(x.dv)}" data-bbx="${i},dv" aria-label="Đơn vị"><button class="btn sm ghost-bad" data-act="bb-delx" data-kind="extra" data-i="${i}" aria-label="Xóa">×</button></div>`).join('')}
    <button class="btn sm" data-act="bb-addp">+ Thêm người, bộ phận khác</button></div>
    ${autoSec(b, tpl)}
    <div class="bbsec"><h3>Trường riêng, trường thêm</h3><p class="muted">Trường riêng của mẫu và trường bạn tự thêm. Trường tự thêm được ghi cuối văn bản; ô tên trường chọn được cả trường dữ liệu có sẵn.</p>
    ${b.fields.map((f, i) => f.fix ? `<div class="field"><label>${esc(rLabel(f.k))}</label>${LONG.has(f.k) ? `<textarea rows="3" data-bbf="${i},v">${esc(f.v)}</textarea>` : `<input value="${esc(f.v)}" data-bbf="${i},v">`}</div>`
      : `<div class="bbrow f2"><input value="${esc(f.k)}" data-bbf="${i},k" placeholder="Tên trường" aria-label="Tên trường" list="bb-fl"><input value="${esc(f.v)}" data-bbf="${i},v" placeholder="Nội dung" aria-label="Nội dung"><button class="btn sm ghost-bad" data-act="bb-delx" data-kind="fields" data-i="${i}" aria-label="Xóa">×</button></div>`).join('')}
    <button class="btn sm" data-act="bb-addf">+ Thêm trường</button><datalist id="bb-fl">${TPF.flatMap(([, fs]) => fs).map(([, l]) => `<option value="${esc(l)}">`).join('')}</datalist></div>
    ${b.hop ? `<div class="bbsec"><h3>Lịch họp</h3><label class="rp-l"><input type="checkbox" class="check" data-bbhop="1" ${b.hopLuc ? 'checked' : ''}>Thêm vào lịch họp của dự án để nhắc</label>${b.hopLuc ? `<input type="datetime-local" data-bbv="hopLuc" value="${b.hopLuc}" class="cell-in" style="margin-top:6px">` : ''}</div>` : ''}`;
  modal(tpl.ten, `<div class="bbwrap"><div class="bbform">${left}</div><div class="bbprev"><div class="muted" style="margin-bottom:6px">Xem trước · phần tô vàng là phần mềm tự điền</div><div id="bb-prev">${bbPreview()}</div></div></div>`,
    `<span class="muted" style="margin-right:auto">Xuất file Word theo mẫu, rồi mở bằng Word để sửa tiếp</span><button class="btn" data-close="1">Hủy</button><button class="btn pri" data-act="bb-ok">Xuất file Word</button>`, 'wide');
}
/** Trường dữ liệu có trong mẫu: hiện giá trị phần mềm điền, cho sửa từng trường. */
function autoSec(b, tpl) {
  const used = (b.used || []).filter(k => k !== 'ThanhPhan'); if (!used.length) return '';
  const auto = dataFor({ ...b, ov: {} }, tpl);
  return `<div class="bbsec"><h3>Dữ liệu tự điền (sửa được)</h3><p class="muted">Các trường dữ liệu có trong mẫu này. Sửa ô nào thì biên bản dùng nội dung đã sửa; bấm "Lấy lại" để về dữ liệu của phần mềm.</p>
    ${used.map(k => { const ed = k in b.ov; const val = ed ? b.ov[k] : auto[k]; const long = /\n/.test(auto[k] || '') || /DanhSach|^Viec|TienDo\.Viec/.test(k);
      return `<div class="field bbovf"><label><span>${esc(FLABEL[k] || k)} <span class="code muted">{${esc(k)}}</span></span>${ed ? `<button class="linkbtn" data-act="bb-reset" data-k="${esc(k)}">Lấy lại dữ liệu gốc</button>` : ''}</label>
      ${long ? `<textarea rows="3" data-bbov="${esc(k)}" class="${ed ? 'ed' : ''}">${esc(val)}</textarea>` : `<input value="${esc(val)}" data-bbov="${esc(k)}" class="${ed ? 'ed' : ''}" placeholder="(phần mềm chưa có dữ liệu, gõ để điền)">`}</div>`; }).join('')}</div>`;
}
export function bbPreview() {
  const b = S.bb, tpl = S.bienBanMau.find(x => x.id === b.id); const v = dataFor(b, tpl);
  const m = s => `<mark>${esc(s)}</mark>`;
  const auto = [['Dự án', 'DuAn.Ten'], ['Chủ đầu tư', 'ChuDauTu.Ten'], ['Gói thầu', 'GoiThau.Ten'], ['Hợp đồng số', 'HopDong.So'], ['Nhà thầu', 'NhaThau.Ten']].filter(([, k]) => v[k]);
  return `<div class="paper bbpaper"><div class="pp-h"><span>${m((v['TuVanQLDA.Ten'] || '').toUpperCase())}<br><b>Số: ${m(v.SoVanBan)}</b></span><span><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br>Độc lập - Tự do - Hạnh phúc<br><i>${v.DiaDiem ? m(v.DiaDiem) + ', ' : ''}${m(v.Ngay)}</i></span></div>
    <div class="pp-t">${esc(tpl.ten.toUpperCase())}</div>
    <p>${auto.map(([l, k]) => `${l}: ${m(v[k])}`).join('<br>')}</p>
    <p><b>Thành phần</b><br>${v.ThanhPhan ? v.ThanhPhan.split('\n').map(m).join('<br>') : '<span class="muted">Chưa chọn thành phần.</span>'}</p>
    ${b.fields.filter(f => f.k).map(f => `<p><b>${esc(f.fix ? rLabel(f.k) : f.k)}:</b> ${f.v ? m(f.v) : '<span style="color:#999">..........</span>'}</p>`).join('')}
    <p style="color:#999">... (bố cục đầy đủ theo file Word của mẫu)</p></div>`;
}
export const bbRefresh = () => { const e = document.getElementById('bb-prev'); if (e) e.innerHTML = bbPreview(); };
export function bbChange(t) {
  const b = S.bb; if (!b) return false;
  if (t.id === 'bb-da') { b.da = t.value; b.gt = ''; b.dot = ''; b.ov = {}; bbDefaults(); bbModal(); return true; }
  if (t.id === 'bb-gt') { b.gt = t.value; b.dot = ''; b.ov = {}; bbDefaults(true); bbModal(); return true; }
  if (t.id === 'bb-dot') { b.dot = t.value; bbModal(); return true; }
  if (t.dataset.bbov !== undefined) return true;
  if (t.dataset.bbf?.endsWith(',k')) { const f = b.fields[+t.dataset.bbf.split(',')[0]]; const k = LABEL2K[t.value]; if (k && !f.v) { f.v = dataFor({ ...b, ov: {} }, S.bienBanMau.find(x => x.id === b.id))[k]; bbModal(); return true; } }
  if (t.dataset.bbo) { b.org[t.dataset.bbo] = t.checked; bbModal(); return true; }
  if (t.dataset.bbp) { b.pick[t.dataset.bbp] = t.checked; bbRefresh(); return true; }
  if (t.dataset.bbhop) { b.hopLuc = t.checked ? (today() + 'T08:00') : ''; bbModal(); return true; }
  if (t.dataset.bbv) { b[t.dataset.bbv] = t.value; bbRefresh(); return true; }
  return false;
}
export function bbInput(t) {
  const b = S.bb; if (!b) return false;
  const bx = t.dataset.bbx, bf = t.dataset.bbf;
  if (t.dataset.bbov !== undefined) { const k = t.dataset.bbov; b.ov[k] = t.value; t.classList.add('ed');
    const lab = t.previousElementSibling; if (lab && !lab.querySelector('[data-act="bb-reset"]')) lab.insertAdjacentHTML('beforeend', `<button class="linkbtn" data-act="bb-reset" data-k="${esc(k)}">Lấy lại dữ liệu gốc</button>`);
    bbRefresh(); return true; }
  if (bx || bf) { const [i, k] = (bx || bf).split(','); b[bx ? 'extra' : 'fields'][+i][k] = t.value; bbRefresh(); return true; }
  if (t.dataset.bbv) { b[t.dataset.bbv] = t.value; bbRefresh(); return true; }
  return false;
}
export async function bbOk() {
  const b = S.bb, tpl = S.bienBanMau.find(x => x.id === b.id);
  try {
    const bytes = await readStored(tpl.file);
    const extra = b.fields.filter(f => !f.fix && f.k && f.v).map(f => [f.k, f.v]);
    const data = dataFor(b, tpl);
    if (b.hopLuc && !data.ThoiGianHop) data.ThoiGianHop = `${b.hopLuc.slice(11, 16)} ${ngayVN(b.hopLuc.slice(0, 10))}`;
    const out = render(bytes, data, extra);
    const a = daById(b.da); const g = b.gt ? gtById(b.gt) : null;
    if (b.hopLuc) { S.hop.push({ id: uid('H'), da: b.da, gt: b.gt || '', ten: data.NoiDungHop || tpl.ten, luc: b.hopLuc, diaDiem: data.DiaDiemHop || '' }); await flush(); }
    closeModal(); S.bb = null;
    await saveAndOpen(out, `${tpl.ten}${g ? ' - ' + g.ma : a ? ' - ' + a.ten.slice(0, 40) : ''} - ${today()}.docx`.replace(/[\\/:*?"<>|]/g, '-'));
  } catch (e) { console.error(e); toast('Không tạo được biên bản: ' + (e.properties?.errors?.[0]?.properties?.explanation || e.message || e)); }
}

/* ---------- tải về, quản lý, phiên bản ---------- */
export async function bbDownload(id, file) {
  const tpl = S.bienBanMau.find(x => x.id === id);
  const bytes = await readStored(file || tpl.file);
  const p = await saveBytes(bytes, tpl.ten + '.docx', 'docx', 'Word'); if (p) { toast('Đã lưu. Sửa xong giữ nguyên tên file rồi bấm Nạp file mẫu.'); try { await openPath(p); } catch { } }
}
export function bbMenu(id) {
  const b = S.bienBanMau.find(x => x.id === id);
  modal('Quản lý mẫu', `<div class="field"><label for="bb-ten">Tên mẫu (cũng là tên file để nạp thay thế)</label><div class="row"><input id="bb-ten" value="${esc(b.ten)}" style="flex:1"><button class="btn" data-act="bb-ren" data-id="${b.id}">Đổi tên</button></div></div>
    <div class="field"><label for="bb-nhom">Nhóm</label><div class="row"><input id="bb-nhom" list="bb-nhom-dl" value="${esc(b.nhom)}" style="flex:1"><datalist id="bb-nhom-dl">${[...new Set([...BUILTIN_NHOM, ...S.bienBanMau.map(x => x.nhom)])].map(x => `<option value="${esc(x)}">`).join('')}</datalist><button class="btn" data-act="bb-nhom" data-id="${b.id}">Đổi nhóm</button></div></div>
    <div class="bbsec"><h3>Phiên bản</h3>
      <div class="li"><div class="grow"><b>v${b.ver}</b> · hiện hành</div><span class="muted">${d(b.ngay)}</span></div>
      ${(b.ls || []).map((x, i) => `<div class="li"><div class="grow">v${x.v}</div><span class="muted">${d(x.ngay)}</span><button class="btn sm" data-act="bb-dlv" data-id="${b.id}" data-i="${i}">Tải về</button><button class="btn sm" data-act="bb-restore" data-id="${b.id}" data-i="${i}">Khôi phục</button></div>`).join('') || '<p class="muted">Chưa có phiên bản cũ.</p>'}</div>
    <div class="note">Cập nhật mẫu: tải về, sửa trong Word, lưu với đúng tên <b>${esc(b.ten)}.docx</b> rồi bấm "Nạp file mẫu". Phần mềm tự thay bản này.</div>`,
    `<button class="btn ghost-bad" style="margin-right:auto" data-act="bb-del" data-id="${b.id}">Xóa mẫu</button><button class="btn" data-close="1">Đóng</button>`);
}
export async function bbRename(id) {
  const b = S.bienBanMau.find(x => x.id === id); const v = document.getElementById('bb-ten').value.trim(); if (!v) return;
  const dup = S.bienBanMau.find(x => x.id !== id && bbNorm(x.ten) === bbNorm(v)); if (dup) { toast('Đã có mẫu tên này'); return; }
  b.ten = v; await flush(); bbMenu(id); toast('Đã đổi tên');
}
export async function bbSetNhom(id) { const b = S.bienBanMau.find(x => x.id === id); const v = document.getElementById('bb-nhom').value.trim(); if (!v) return; b.nhom = v; await flush(); bbMenu(id); toast('Đã đổi nhóm'); }
export function bbDelete(id) {
  const b = S.bienBanMau.find(x => x.id === id);
  confirmBox('Xóa mẫu?', `Xóa <b>${esc(b.ten)}</b> và mọi phiên bản cũ khỏi thư viện. Biên bản đã xuất trước đây không bị ảnh hưởng.`, 'Xóa mẫu', async () => { S.bienBanMau = S.bienBanMau.filter(x => x.id !== id); await flush(); window.dispatchEvent(new Event('sda-render')); toast('Đã xóa mẫu'); });
}
export async function bbRestore(id, i) {
  const b = S.bienBanMau.find(x => x.id === id); const old = b.ls[i];
  b.ls.splice(i, 1); b.ls.unshift({ v: b.ver, ngay: b.ngay, file: b.file });
  b.file = old.file; b.ver = Math.max(b.ver, ...b.ls.map(x => x.v)) + 1; b.ngay = today();
  b.rieng = classify(scanTags(await readStored(b.file))).rieng;
  await flush(); bbMenu(id); toast(`Đã khôi phục bản v${old.v} thành v${b.ver}`);
}

/** Lưu một file Word vào thư viện: trùng tên thì thay mẫu cũ (giữ bản cũ trong lịch sử). */
async function bbSave(ten, nhom, bytes, rieng) {
  const file = await store(bytes, ten + '.docx');
  const old = S.bienBanMau.find(b => bbNorm(b.ten) === bbNorm(ten));
  if (old) { old.ls = [{ v: old.ver, ngay: old.ngay, file: old.file }, ...(old.ls || [])].slice(0, 20); old.ver++; old.ngay = today(); old.file = file; old.rieng = rieng; return { b: old, moi: false }; }
  const b = { id: uid('BM'), nhom, ten, mt: 'Mẫu của bạn', file, ver: 1, ngay: today(), ls: [], rieng };
  S.bienBanMau.push(b); return { b, moi: true };
}

/* ---------- nạp file mẫu (nhiều file) ---------- */
export async function bbImport() {
  const ps = await openDlg({ multiple: true, filters: [{ name: 'Word', extensions: ['docx'] }] });
  const list = (Array.isArray(ps) ? ps : ps ? [ps] : []).map(String); if (!list.length) return;
  const items = [];
  for (const p of list) {
    const name = p.split(/[\\/]/).pop().replace(/\.docx$/i, '');
    try { const bytes = toBytes(await api('read_file', { path: p })); const c = classify(scanTags(bytes)); items.push({ name, bytes, c, old: S.bienBanMau.find(b => bbNorm(b.ten) === bbNorm(name)) }); }
    catch (e) { items.push({ name, err: String(e) }); }
  }
  S.bbImp = items;
  modal('Nạp file mẫu vào thư viện', `<table class="pp" style="min-width:0"><thead><tr><th>File</th><th>Kết quả</th><th>Trường</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(x.name)}.docx</td><td>${x.err ? '<b style="color:var(--bad)">Không đọc được</b>' : x.old ? `Thay mẫu <b>${esc(x.old.ten)}</b> · v${x.old.ver} → v${x.old.ver + 1}` : '<b style="color:var(--good)">Mẫu mới</b>'}</td><td>${x.c ? `${x.c.known.length} dữ liệu, ${x.c.rieng.length} riêng${x.c.typo.length ? `<br><span style="color:var(--warn)">Không nhận ra: ${x.c.typo.map(([t, n]) => esc('{' + t + '}') + (n ? ' (có phải {' + n + '}?)' : '')).join(', ')}</span>` : ''}` : ''}</td></tr>`).join('')}</tbody></table>
    <div class="field" style="margin-top:10px"><label for="imp-nhom">Nhóm cho mẫu mới</label><input id="imp-nhom" list="imp-nhom-dl" value="Văn bản"><datalist id="imp-nhom-dl">${BUILTIN_NHOM.map(x => `<option value="${x}">`).join('')}</datalist></div>
    <p class="muted" style="margin:0">File trùng tên mẫu đã có (không phân biệt hoa thường, dấu, gạch dưới) sẽ thay mẫu cũ; bản cũ vẫn giữ trong lịch sử. Trường không nhận ra vẫn giữ nguyên chữ trong văn bản.</p>`,
    `<button class="btn" data-close="1">Hủy</button><button class="btn pri" data-act="bb-impok">Nạp ${items.filter(x => !x.err).length} file</button>`);
}
export async function bbImportOk() {
  const nhom = document.getElementById('imp-nhom')?.value.trim() || 'Văn bản'; let n = 0, r = 0;
  for (const x of S.bbImp || []) { if (x.err) continue; const res = await bbSave(x.name, nhom, x.bytes, x.c.rieng); res.moi ? n++ : r++; }
  S.bbImp = null; await flush(); closeModal(); window.dispatchEvent(new Event('sda-render'));
  toast(`Đã nạp: ${n} mẫu mới, ${r} mẫu được thay`);
}

/* ---------- tạo mẫu mới: chọn trường → xuất khung Word → sửa → nạp lại ---------- */
export function tpStart() { S.tp = { step: 1, ten: '', nhom: 'Họp', tu: 'trong', chon: { 'DuAn.Ten': 1, 'ChuDauTu.Ten': 1, 'TuVanQLDA.Ten': 1, 'GoiThau.Ten': 1, 'NhaThau.Ten': 1, SoVanBan: 1, Ngay: 1, DiaDiem: 1, ThanhPhan: 1 }, rieng: ['NoiDung'], file: null }; tpModal(); }
export function tpModal() {
  const t = S.tp, n = Object.values(t.chon).filter(Boolean).length;
  const stepper = `<div class="tpstep">${['Chọn trường, tải file khung', 'Chỉnh trong Word', 'Nạp lại vào phần mềm'].map((x, i) => `<span class="${i + 1 === t.step ? 'on' : i + 1 < t.step ? 'done' : ''}"><b>${i + 1 < t.step ? '✓' : i + 1}</b>${x}</span>`).join('')}</div>`;
  let body = '', foot = '';
  if (t.step === 1) {
    body = `<div class="grid-f"><div class="field"><label for="tp-ten">Tên mẫu</label><input id="tp-ten" value="${esc(t.ten)}" placeholder="Ví dụ: Giấy mời họp giao ban"></div>
      <div class="field"><label for="tp-nh">Nhóm</label><input id="tp-nh" list="tp-nh-dl" value="${esc(t.nhom)}"><datalist id="tp-nh-dl">${[...new Set([...BUILTIN_NHOM, ...S.bienBanMau.map(x => x.nhom)])].map(x => `<option value="${esc(x)}">`).join('')}</datalist></div></div>
    <div class="field"><label for="tp-tu">Bắt đầu từ</label><select id="tp-tu"><option value="trong">Khung trống (quốc hiệu, tiêu đề, các trường đã chọn)</option>${S.bienBanMau.map(x => `<option value="${x.id}" ${x.id === t.tu ? 'selected' : ''}>Sao từ mẫu có sẵn: ${esc(x.ten)}</option>`).join('')}</select></div>
    ${t.tu === 'trong' ? `<div class="bbsec"><h3>Trường lấy từ dữ liệu phần mềm · đã chọn ${n}</h3><p class="muted">Tích trường nào thì file khung có sẵn trường đó. Sau này vẫn gõ thêm được trong Word.</p>
      <div class="tpgrid">${TPF.map(([g, fs]) => `<div class="tpg"><b>${g}</b>${fs.map(([k, l]) => `<label class="rp-l"><input type="checkbox" class="check" data-tpf="${k}" ${t.chon[k] ? 'checked' : ''}>${l} <span class="code muted">{${k}}</span></label>`).join('')}</div>`).join('')}</div></div>
    <div class="bbsec"><h3>Trường riêng của mẫu</h3><p class="muted">Nội dung không có trong dữ liệu, phần mềm sẽ hỏi khi tạo biên bản. Viết liền, không dấu.</p>
      ${t.rieng.map((r, i) => `<div class="bbrow f2"><input value="${esc(r)}" data-tpr="${i}" placeholder="VD: ThoiGianHop" aria-label="Tên trường riêng"><span class="code muted">{${esc(r) || '...'}}</span><button class="btn sm ghost-bad" data-act="tp-rdel" data-i="${i}" aria-label="Xóa">×</button></div>`).join('')}
      <button class="btn sm" data-act="tp-radd">+ Thêm trường riêng</button></div>` : '<div class="note">File tải về là bản sao của mẫu đã chọn, giữ nguyên các trường. Sửa trong Word rồi nạp lại với tên mới.</div>'}`;
    foot = `<button class="btn" data-close="1">Hủy</button><button class="btn pri" data-act="tp-dl">Tải file Word khung</button>`;
  } else if (t.step === 2) {
    body = `<div class="note">Đã lưu <b>${esc(t.ten)}.docx</b>. Mở bằng Word và chỉnh tùy ý: lề, phông, cỡ chữ, logo, bảng, đoạn văn cố định...</div>
    <ul class="steps-ol"><li>Giữ nguyên các chữ trong ngoặc nhọn như <span class="code">{NhaThau.Ten}</span>. Có thể di chuyển, đổi định dạng cho cả cụm.</li><li>Muốn thêm trường thì gõ đúng tên trong ngoặc nhọn. Tên lạ, viết liền không dấu, sẽ thành trường riêng.</li><li><span class="code">{ThanhPhan}</span> nên đứng riêng một dòng; phần mềm thay bằng danh sách thành phần.</li><li>Lưu file (giữ định dạng .docx), rồi bấm nút bên dưới.</li></ul>`;
    foot = `<button class="btn" data-act="tp-back">Quay lại</button><button class="btn" data-act="tp-dl">Tải lại file khung</button><button class="btn pri" data-act="tp-next">Đã chỉnh xong, nạp file</button>`;
  } else {
    const f = t.file; const dup = S.bienBanMau.find(b => bbNorm(b.ten) === bbNorm(t.ten));
    body = f ? `<div class="note"><b>${esc(f.name)}.docx</b> · đã đọc file, giữ nguyên định dạng của bạn.</div>
      <div class="field"><label for="tp-ten3">Tên mẫu trong thư viện</label><input id="tp-ten3" value="${esc(t.ten)}"></div>
      ${dup ? `<div class="conflict"><div class="conflict-h">Trùng tên mẫu đã có: ${esc(dup.ten)} (v${dup.ver})</div><div style="padding:10px 14px;font-size:13px">Khi lưu, mẫu cũ được thay bằng file này thành <b>v${dup.ver + 1}</b>. Bản v${dup.ver} vẫn nằm trong lịch sử. Muốn giữ cả hai thì đổi tên ở trên.</div></div>` : '<div style="color:var(--good);font-weight:600;font-size:13px">✓ Tên chưa có trong thư viện, sẽ thêm thành mẫu mới</div>'}
      <div class="tpchk"><div class="ok">✓ ${f.c.known.length} trường dữ liệu nhận ra</div><div class="muted">${f.c.known.map(k => `<span class="code">{${esc(k)}}</span>`).join(' ')}</div>
      <div class="ok">✓ ${f.c.rieng.length} trường riêng, sẽ hỏi khi tạo biên bản</div><div class="muted">${f.c.rieng.map(r => `<span class="code">{${esc(r)}}</span>`).join(' ')}</div>
      ${f.c.typo.map(([x, near]) => `<div class="wn">⚠ Trường không nhận ra: <span class="code">{${esc(x)}}</span>${near ? ` · có phải <span class="code">{${esc(near)}}</span>? Sửa trong Word rồi nạp lại.` : ' · sẽ giữ nguyên chữ trong văn bản.'}</div>`).join('')}</div>`
      : `<button class="drop" data-act="tp-load">${ic('doc')}<b>Chọn file Word đã chỉnh</b><span class="muted">.docx · phần mềm kiểm tra các trường trước khi lưu</span></button>`;
    foot = `<button class="btn" data-act="tp-back">Quay lại</button><button class="btn pri" data-act="tp-ok" ${f ? '' : 'disabled'}>${f && dup ? 'Thay mẫu cũ' : 'Lưu vào thư viện'}</button>`;
  }
  modal('Tạo mẫu biên bản', stepper + body, foot, 'wide');
}
export async function tpDownload() {
  const t = S.tp; t.ten = (document.getElementById('tp-ten')?.value ?? t.ten).trim(); t.nhom = (document.getElementById('tp-nh')?.value ?? t.nhom).trim() || 'Văn bản';
  if (!t.ten) { toast('Nhập tên mẫu'); return; }
  let bytes;
  if (t.tu !== 'trong') bytes = await readStored(S.bienBanMau.find(x => x.id === t.tu).file);
  else {
    const base = new Uint8Array(await (await fetch(asset('khung'))).arrayBuffer());
    const keys = TPF.flatMap(([, fs]) => fs).filter(([k]) => t.chon[k] && !['TuVanQLDA.Ten', 'SoVanBan', 'Ngay', 'DiaDiem'].includes(k));
    const P = (txt, b) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xe(txt)}</w:t></w:r></w:p>`;
    const body = keys.filter(([k]) => k !== 'ThanhPhan').map(([k, l]) => P(`${l}: {${k}}`)).join('')
      + (t.chon.ThanhPhan ? P('Thành phần:', true) + P('{ThanhPhan}') : '')
      + t.rieng.filter(Boolean).map(r => P(`${r}: {${r}}`)).join('');
    const doc = new Docxtemplater(new PizZip(base), { delimiters: { start: '[[', end: ']]' }, paragraphLoop: true });
    doc.render({ Tieu: t.ten.toUpperCase(), body });
    bytes = doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
  }
  const p = await saveBytes(bytes, t.ten + '.docx', 'docx', 'Word'); if (!p) return;
  t.path = p; t.step = 2; tpModal(); try { await openPath(p); } catch { }
}
export async function tpLoad() {
  const t = S.tp; const p = await openDlg({ multiple: false, defaultPath: t.path, filters: [{ name: 'Word', extensions: ['docx'] }] }); if (!p) return;
  const bytes = toBytes(await api('read_file', { path: String(p) }));
  const name = String(p).split(/[\\/]/).pop().replace(/\.docx$/i, '');
  t.file = { name, bytes, c: classify(scanTags(bytes)) }; if (!t.ten) t.ten = name; tpModal();
}
export async function tpOk() {
  const t = S.tp; const ten = (document.getElementById('tp-ten3')?.value || t.ten).trim(); if (!ten) { toast('Nhập tên mẫu'); return; }
  const r = await bbSave(ten, t.nhom, t.file.bytes, t.file.c.rieng); await flush(); S.tp = null; closeModal(); window.dispatchEvent(new Event('sda-render'));
  toast(r.moi ? 'Đã thêm mẫu vào thư viện' : `Đã thay mẫu ${r.b.ten} thành v${r.b.ver}`);
}
