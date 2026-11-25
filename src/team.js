// Làm việc nhóm qua thư mục dùng chung (Google Drive): cài đặt lần đầu, hướng dẫn,
// duyệt thay đổi, nhật ký sửa, bảng quyền, nhân viên, khóa máy, tài liệu và AI quét.
import { open as openDlg } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { S, $, api, esc, vnd, d, today, uid, gtById, daById, ROLE_NAME, flush, load, kvSet, can, modeOf } from './core.js';
import { modal, closeModal, formModal, toast, confirmBox, pill, readForm } from './ui.js';
import { V, T, HOOK } from './views.js';
import { A } from './actions.js';
import { printHtml } from './report.js';

const rerender = () => window.dispatchEvent(new Event('sda-render'));
const isGD = () => S.lic?.role === 'GD';
const joined = () => !!S.share?.joined;
const fmtT = t => { if (!t) return '—'; const x = new Date(+t); return x.toLocaleDateString('vi-VN') + ' ' + x.toTimeString().slice(0, 5); };
const fname = f => String(f || '').split(/[\\/]/).pop().replace(/^[0-9a-f]{8}-/, '');
const LV = { n: 'Sửa ngay', d: 'Gửi duyệt', x: 'Chỉ xem', h: 'Ẩn' };
const LVC = { n: 'good', d: 'warn', x: '', h: 'bad' };
const CN = { duAnList: 'Dự án', goiThau: 'Gói thầu', congViec: 'Công việc', nghiemThu: 'Nghiệm thu', thanhToan: 'Thanh toán', nhaThau: 'Nhà thầu', danhBa: 'Đơn vị', thuVien: 'Thư viện', deXuat: 'Điều chỉnh hạn', bienBanMau: 'Mẫu biên bản', keys: 'Key', revoked: 'Thu hồi key', hop: 'Cuộc họp', caiDat: 'Cài đặt', banGiao: 'Bàn giao', taiLieu: 'Tài liệu', phieu: 'Phiếu duyệt' };
const FL = { ten: 'Tên', ma: 'Mã', tt: 'Trạng thái', hh: 'Hạn hoàn thành', goc: 'Hạn gốc', xong: 'Ngày xong', notes: 'Ghi chú', ghiChu: 'Ghi chú', nguoi: 'Người thực hiện', gt: 'Giá trị / gói', hd: 'Số hợp đồng', ngayKy: 'Ngày ký', nt: 'Nhà thầu / đợt', tamUng: 'Tạm ứng', tlThuHoi: 'Tỷ lệ thu hồi', soNgayTT: 'Số ngày thanh toán', bh: 'Bảo hành', qt: 'Quyết toán',
  dot: 'Đợt', ngay: 'Ngày', gtri: 'Giá trị', tien: 'Số tiền', ct: 'Chứng từ', tep: 'Tệp', bb: 'Biên bản', lyDo: 'Lý do', luc: 'Thời gian', diaDiem: 'Địa điểm', nd: 'Nội dung', giao: 'Bên giao', nhan: 'Bên nhận', muc: 'Mục', da: 'Dự án', _del: 'Xóa bản ghi', file: 'Tệp mẫu', ls: 'Phiên bản cũ', ver: 'Phiên bản' };
const showV = (v, f) => {
  if (f === '_del') return v === true || v === 'true' ? 'Xóa' : 'Còn';
  if (v === null || v === undefined || v === '') return '<span class="muted">(trống)</span>';
  if (typeof v === 'string' && v.startsWith('files/')) return `<button class="btn sm" data-act="openfile" data-f="${esc(v)}">${esc(fname(v))}</button>`;
  if (typeof v === 'number' && Math.abs(v) >= 1000) return vnd(v);
  if (typeof v === 'object') { const s = JSON.stringify(v); return `<span class="muted" title="${esc(s)}">${esc(s.length > 80 ? s.slice(0, 80) + '…' : s)}</span>`; }
  return esc(String(v).length > 140 ? String(v).slice(0, 140) + '…' : v);
};
const lvSel = (name, v, opts = 'ndxh') => `<select data-q="${name}">${[...opts].map(k => `<option value="${k}" ${v === k ? 'selected' : ''}>${LV[k]}</option>`).join('')}</select>`;

/* ================= Thanh bên: mục nhóm ================= */
export function teamNav() {
  if (!joined()) return [];
  const sh = S.share;
  if (isGD()) return [
    ['duyet', 'task', 'Duyệt thay đổi', true, S.phieu.filter(p => p.status === 'cho').length, 'Nhóm'],
    ['quyen', 'key', 'Bảng quyền', true, 0, 'Nhóm'],
    ['nhatky', 'log', 'Nhật ký sửa', true, 0, 'Nhóm'],
  ];
  return [['dexuatcuatoi', 'task', 'Đề xuất của tôi', true, S.phieu.filter(p => p.status === 'cho' && p.by === S.lic.serial).length, 'Nhóm']];
}
export function syncFoot() {
  const sh = S.share; if (!joined()) return '';
  const lp = sh.lastPull ? fmtT(sh.lastPull) : 'chưa';
  return `<button class="linkbtn" data-act="sync-now" style="color:inherit;padding:0;font-size:inherit;text-align:left">Đồng bộ: ${esc(lp)}${sh.pending ? ` · ${sh.pending} chờ gửi` : ''} ↻</button>`;
}

HOOK.nav = teamNav; HOOK.foot = syncFoot;

/* ================= Cài đặt lần đầu ================= */
export function maybeWizard() {
  if (joined() || S.kv.shareAsked || !S.lic?.activated) return;
  wizard();
}
function wizard() {
  const gd = isGD();
  modal('Làm việc nhóm qua Google Drive', `<div class="note">Sổ Dự Án đồng bộ dữ liệu giữa các máy qua <b>một thư mục dùng chung trên Google Drive</b>. Mỗi máy vẫn có dữ liệu riêng để làm việc khi mất mạng; khi có mạng, phần mềm tự gửi và nhận thay đổi.</div>
    ${gd ? `<h3>Máy Giám đốc</h3><ol class="steps-ol"><li>Cài Google Drive cho máy tính, đăng nhập tài khoản công ty.</li><li>Trong Drive của tôi, tạo thư mục <b>SoDuAn_DungChung</b>.</li><li>Bấm <b>Tạo thư mục nhóm</b> dưới đây và chọn thư mục đó.</li><li>Chia sẻ thư mục cho Gmail của từng nhân viên với quyền <b>Người chỉnh sửa</b>.</li></ol>`
      : `<h3>Máy nhân viên</h3><ol class="steps-ol"><li>Cài Google Drive, đăng nhập Gmail đã được Giám đốc chia sẻ.</li><li>Trên drive.google.com, mục Được chia sẻ với tôi: chuột phải <b>SoDuAn_DungChung</b> > Sắp xếp > <b>Thêm lối tắt vào Drive</b>.</li><li>Bấm <b>Kết nối thư mục nhóm</b> dưới đây và chọn thư mục đó trong ổ Google Drive.</li><li>Chờ máy Giám đốc nhận máy này vào nhóm (tự động khi máy Giám đốc mở phần mềm).</li></ol>
      <div class="note warn">Khi kết nối, dữ liệu đang có trên máy này được sao lưu rồi thay bằng dữ liệu của nhóm.</div>`}`,
    `<button class="btn" data-act="wz-skip" style="margin-right:auto">Để sau, dùng một mình</button><button class="btn" data-act="drive-guide">Xem hướng dẫn chi tiết</button><button class="btn pri" data-act="${gd ? 'share-create' : 'share-join'}">${gd ? 'Tạo thư mục nhóm' : 'Kết nối thư mục nhóm'}</button>`, 'wide');
}
A['wz-skip'] = async () => { await kvSet('shareAsked', true); closeModal(); toast('Có thể kết nối sau ở mục Chia sẻ & đồng bộ'); };
A['wizard'] = () => wizard();

async function pickRoot() {
  const p = await openDlg({ directory: true, multiple: false, title: 'Chọn thư mục SoDuAn_DungChung trong Google Drive' });
  return p ? String(p) : null;
}
A['share-create'] = async () => {
  const p = await pickRoot(); if (!p) return;
  let info; try { info = await api('share_probe', { path: p }); } catch (e) { toast(String(e)); return; }
  if (!info.writable) { toast('Không ghi được vào thư mục này', 4000); return; }
  if (info.exists && !info.same_team) { toast('Thư mục này thuộc nhóm của Giám đốc khác', 4000); return; }
  const go = async company => {
    try { const r = await api('share_create', { path: p, company }); await kvSet('shareAsked', true); closeModal(); await load(); rerender();
      toast(r === 'reconnect' ? 'Đã kết nối lại thư mục nhóm và lấy lại dữ liệu' : 'Đã tạo thư mục nhóm. Hãy chia sẻ thư mục cho nhân viên.', 5000); }
    catch (e) { toast(String(e), 5000); }
  };
  if (info.exists) return confirmBox('Kết nối lại thư mục nhóm?', `Thư mục này đã có dữ liệu nhóm của bạn${info.company ? ' (' + esc(info.company) + ')' : ''}. Phần mềm sẽ đọc lại toàn bộ thay đổi trong thư mục và gộp với dữ liệu trên máy.`, 'Kết nối lại', () => go(info.company || ''), false);
  const dv = S.caiDat.find(x => x.id === 'donVi');
  confirmBox('Tạo thư mục nhóm?', `Thư mục: <b class="num">${esc(p)}</b><br><br>Toàn bộ dữ liệu hiện có trên máy này được đưa lên làm dữ liệu gốc của nhóm (đã mã hóa). Phần mềm tự sao lưu trước khi làm.`, 'Tạo', () => go(dv?.ten || ''), false);
};
A['share-join'] = async () => {
  const p = await pickRoot(); if (!p) return;
  let info; try { info = await api('share_probe', { path: p }); } catch (e) { toast(String(e)); return; }
  if (!info.exists) { toast('Chưa thấy dữ liệu nhóm trong thư mục này. Chọn đúng thư mục SoDuAn_DungChung hoặc chờ Google Drive tải xong.', 6000); return; }
  if (!info.same_team) { toast('Thư mục này không phải của Giám đốc đã cấp key cho máy này', 5000); return; }
  if (!info.writable) { toast('Không ghi được. Giám đốc cần chia sẻ với quyền Người chỉnh sửa.', 5000); return; }
  confirmBox('Kết nối thư mục nhóm?', `Nhóm: <b>${esc(info.company || '')}</b><br>Thư mục: <span class="num">${esc(p)}</span><br><br>Dữ liệu đang có trên máy này sẽ được <b>sao lưu rồi thay bằng dữ liệu của nhóm</b>. Sau đó máy chờ Giám đốc nhận vào nhóm.`, 'Kết nối', async () => {
    try { await api('share_join', { path: p }); await kvSet('shareAsked', true); await load(); rerender(); api('sync_kick'); toast('Đã gửi yêu cầu vào nhóm. Chờ máy Giám đốc nhận.', 5000); }
    catch (e) { toast(String(e), 5000); } }, false);
};
A['share-disconnect'] = () => confirmBox('Ngắt kết nối thư mục nhóm?', 'Máy này thôi gửi và nhận thay đổi. Dữ liệu trên máy và trong thư mục giữ nguyên; có thể kết nối lại sau.', 'Ngắt kết nối', async () => { try { await api('share_disconnect'); await load(); rerender(); } catch (e) { toast(String(e)); } });
A['sync-now'] = async el => {
  if (el) el.disabled = true;
  try { const r = await api('share_sync_now'); await afterSync(r, true); } catch (e) { toast('Không đồng bộ được: ' + e, 5000); }
  if (el) el.disabled = false;
};
A['sync-every'] = async () => { const v = +($('#sync-every')?.value || 2); await api('share_settings', { every: v }); toast('Đã lưu'); };

/** Sau mỗi lượt đồng bộ (nền hoặc bấm tay): nạp lại dữ liệu, báo tin, khóa máy nếu cần. */
export async function afterSync(r, manual) {
  if (!r) { if (manual) toast('Chưa kết nối thư mục nhóm'); return; }
  if (r.error) { if (manual) toast('Không đồng bộ được: ' + r.error, 5000); return; }
  const p = r.pull || {};
  const changed = (p.changed || 0) + (p.late || 0) + (p.accepted || []).length + (p.team_changed ? 1 : 0);
  const before = S.lic?.role;
  if (changed || manual || r.lock) {
    const info = await api('app_info'); S.lic = info.license;
    await load();
    if (lockGate()) return;
    rerender();
  }
  if ((p.accepted || []).length) toast('Đã nhận vào nhóm: ' + p.accepted.join(', '), 5000);
  if (p.late) toast(`Có ${p.late} thay đổi sửa muộn cần duyệt`, 5000);
  if (before && S.lic?.role && before !== S.lic.role) toast('Giám đốc đã đổi vai trò của bạn thành ' + ROLE_NAME[S.lic.role], 6000);
  if (manual) toast(`Đã đồng bộ${r.sent ? `, gửi ${r.sent}` : ''}${p.changed ? `, nhận ${p.changed}` : ''} thay đổi`);
  if ((p.errors || []).length) console.warn(p.errors);
}

/* ================= Màn hình khóa ================= */
export function lockGate() {
  const lk = S.share?.lock;
  if (!lk || lk === 'wait') { if (!$('#app').hidden || !$('#gate').dataset.lock) return false; $('#gate').innerHTML = ''; delete $('#gate').dataset.lock; $('#app').hidden = false; return false; }
  const T = {
    lock: ['Máy đã bị tạm khóa', 'Giám đốc đã tạm khóa máy này. Dữ liệu vẫn còn trên máy nhưng không xem được cho đến khi Giám đốc mở khóa.'],
    off: ['Máy đã bị xóa khỏi nhóm', 'Giám đốc đã xóa máy này khỏi nhóm. Dữ liệu dự án trên máy đã được xóa. Liên hệ Giám đốc nếu cần dùng lại.'],
    lease: [`Đã lâu chưa đồng bộ`, `Máy chưa nhận được dữ liệu nhóm quá ${S.share?.team?.lease_days || 7} ngày nên tạm khóa. Bật mạng và Google Drive, chờ Drive tải xong rồi bấm Đồng bộ ngay.`],
  }[lk] || ['Máy đang khóa', ''];
  $('#app').hidden = true; $('#gate').dataset.lock = lk; closeModal();
  $('#gate').innerHTML = `<div class="gate"><div class="act-card"><div class="brand-mark" style="width:44px;height:44px;font-size:20px;background:var(--bad)">!</div>
    <h1>${esc(T[0])}</h1><p>${esc(T[1])}</p>
    <div class="calc"><span>Người dùng</span><b>${esc(S.lic?.name || '')}</b><span>Mã key</span><span class="num">${esc(S.lic?.serial || '')}</span></div>
    ${lk === 'off' ? '' : `<button class="btn pri" data-act="sync-now" style="width:100%;justify-content:center">Đồng bộ ngay</button>`}</div></div>`;
  return true;
}
export const waitBanner = () => S.share?.lock === 'wait' ? `<div class="ro-banner">Máy này đang <b>chờ Giám đốc nhận vào nhóm</b>. Khi máy Giám đốc mở phần mềm, máy này được nhận tự động và tải dữ liệu nhóm về. <button class="btn sm" data-act="sync-now">Đồng bộ ngay</button></div>` : '';

/* ================= Hướng dẫn Google Drive ================= */
function guideHtml() {
  return `<div class="guide">
  <h3>Cách hoạt động</h3>
  <p>Mỗi máy có dữ liệu riêng. Khi sửa, phần mềm ghi một gói thay đổi nhỏ (đã mã hóa, có chữ ký của máy) vào thư mục <b>SoDuAn_DungChung</b> trên Google Drive. Các máy khác đọc gói đó và cập nhật. Không ai sửa trực tiếp một tệp dữ liệu chung, nên không bị ghi đè lẫn nhau.</p>
  <p>Thư mục có hai phần: <b>1_DongBo</b> (phần mềm tự quản lý, không mở, không sửa) và <b>2_DuLieu</b> (tài liệu theo dự án, gói thầu, mở xem bình thường).</p>
  <h3>A. Máy Giám đốc (làm một lần)</h3>
  <ol class="steps-ol">
    <li>Tải và cài <b>Google Drive cho máy tính</b> (google.com/drive/download), đăng nhập <b>tài khoản Google của công ty</b>.</li>
    <li>Mở ổ Google Drive trên máy (Windows: ổ <b>G:</b> > Drive của tôi; macOS: Finder > Google Drive > Drive của tôi). Tạo thư mục <b>SoDuAn_DungChung</b>.</li>
    <li>Trong Sổ Dự Án: <b>Chia sẻ & đồng bộ</b> > <b>Tạo thư mục nhóm</b> > chọn thư mục vừa tạo.</li>
    <li>Mở drive.google.com, chuột phải <b>SoDuAn_DungChung</b> > <b>Chia sẻ</b> > nhập Gmail từng nhân viên > chọn quyền <b>Người chỉnh sửa</b> > Gửi.</li>
    <li>Cấp key cho từng nhân viên ở mục <b>Quản lý key</b> (cần mã máy của họ).</li>
  </ol>
  <h3>B. Máy nhân viên</h3>
  <ol class="steps-ol">
    <li>Cài Google Drive cho máy tính, đăng nhập <b>đúng Gmail đã được chia sẻ</b>.</li>
    <li>Trên drive.google.com > <b>Được chia sẻ với tôi</b> > chuột phải <b>SoDuAn_DungChung</b> > <b>Sắp xếp</b> > <b>Thêm lối tắt vào Drive</b> > Drive của tôi. Có lối tắt thì thư mục mới hiện trên ổ Google Drive của máy.</li>
    <li>Để làm việc khi mất mạng: trên ổ Google Drive, chuột phải thư mục > <b>Truy cập ngoại tuyến</b> > <b>Có thể dùng khi không có mạng</b> (hoặc trong cài đặt Google Drive chọn <b>Phản chiếu tệp</b>).</li>
    <li>Kích hoạt key, rồi <b>Chia sẻ & đồng bộ</b> > <b>Kết nối thư mục nhóm</b> > chọn SoDuAn_DungChung trong ổ Google Drive.</li>
    <li>Máy Giám đốc mở phần mềm là tự nhận máy mới vào nhóm. Bấm <b>Đồng bộ ngay</b> để tải dữ liệu.</li>
  </ol>
  <h3>C. Quyền và duyệt</h3>
  <p>Mặc định mọi sửa của Trưởng nhóm, Nhân viên gửi về Giám đốc duyệt (mục <b>Duyệt thay đổi</b>). Giám đốc cho sửa ngay theo người, dự án, thời hạn ở mục <b>Bảng quyền</b>. Phần nào đặt "Ẩn" thì máy nhân viên không thấy.</p>
  <h3>D. Lỗi thường gặp</h3>
  <table><tbody>
    <tr><td><b>Chưa thấy dữ liệu nhóm trong thư mục</b></td><td>Google Drive chưa tải xong, hoặc chưa thêm lối tắt (bước B2). Chờ vài phút rồi thử lại.</td></tr>
    <tr><td><b>Không ghi được vào thư mục</b></td><td>Được chia sẻ quyền Người xem. Giám đốc đổi sang Người chỉnh sửa.</td></tr>
    <tr><td><b>Thư mục thuộc Giám đốc khác</b></td><td>Chọn nhầm thư mục, hoặc key do Giám đốc khác cấp.</td></tr>
    <tr><td><b>Máy nhân viên chờ mãi</b></td><td>Máy Giám đốc chưa mở phần mềm hoặc chưa có mạng. Mở phần mềm trên máy Giám đốc, bấm Đồng bộ ngay.</td></tr>
    <tr><td><b>Máy tự khóa vì lâu chưa đồng bộ</b></td><td>Bật mạng, kiểm tra Google Drive đang chạy và đã đăng nhập, bấm Đồng bộ ngay.</td></tr>
    <tr><td><b>Thấy tệp tên có "(1)" trong 1_DongBo</b></td><td>Không sao, phần mềm bỏ qua. Không sửa, không xóa tệp trong 1_DongBo.</td></tr>
    <tr><td><b>Nhân viên nghỉ việc</b></td><td>Quản lý key > Xóa khỏi nhóm (dữ liệu trên máy đó tự xóa khi máy nhận lệnh), rồi vào Drive <b>bỏ chia sẻ</b> Gmail của người đó.</td></tr>
  </tbody></table>
  <p class="muted">Không di chuyển, đổi tên hay xóa thư mục SoDuAn_DungChung và 1_DongBo. Tài liệu trong 2_DuLieu do máy Giám đốc tự sắp xếp; phần mềm không bao giờ xóa tệp ở đây (gói thầu bị xóa thì chuyển vào _ThungRac).</p></div>`;
}
A['drive-guide'] = () => modal('Hướng dẫn cài đặt chia sẻ Google Drive', guideHtml(), `<button class="btn" data-act="guide-print">In / lưu PDF</button><button class="btn pri" data-close="1">Đóng</button>`, 'wide');
A['guide-print'] = () => printHtml(`<div class="paper"><h1>Sổ Dự Án: hướng dẫn chia sẻ qua Google Drive</h1>${guideHtml()}</div>`);

/* ================= Trang Chia sẻ & đồng bộ ================= */
const oldDongbo = V.dongbo;
V.dongbo = () => {
  const sh = S.share || {};
  const every = (S.kv.share?.every) || 2;
  if (!joined()) return `<div class="head"><div><h1>Chia sẻ & đồng bộ</h1><p class="sub">Làm việc nhóm qua Google Drive, hoặc chuyển dữ liệu bằng tệp .sodaan.</p></div><div class="row"><button class="btn" data-act="drive-guide">Hướng dẫn Google Drive</button></div></div>
    <section class="panel"><div class="panel-h"><h2>Làm việc nhóm qua thư mục dùng chung</h2></div><div class="panel-b">
      <p>Các máy tự gửi và nhận thay đổi qua một thư mục Google Drive. Giám đốc duyệt thay đổi của nhân viên, phân quyền, khóa hoặc xóa máy.</p>
      <div class="row">${isGD() ? '<button class="btn pri" data-act="share-create">Tạo thư mục nhóm</button>' : '<button class="btn pri" data-act="share-join">Kết nối thư mục nhóm</button>'}<button class="btn" data-act="wizard">Xem các bước</button></div></div></section>
    ${oldDongbo()}`;
  return `<div class="head"><div><h1>Chia sẻ & đồng bộ</h1><p class="sub">Đang làm việc nhóm qua thư mục dùng chung. Thay đổi được gửi và nhận tự động.</p></div><div class="row"><button class="btn" data-act="drive-guide">Hướng dẫn Google Drive</button><button class="btn pri" data-act="sync-now">Đồng bộ ngay</button></div></div>
  ${waitBanner()}
  <div class="kv"><div><span>Nhận gần nhất</span><b>${fmtT(sh.lastPull)}</b></div><div><span>Gửi gần nhất</span><b>${fmtT(sh.lastPush)}</b></div><div><span>Chờ gửi</span><b>${sh.pending || 0} thay đổi</b></div><div><span>Vai trò hiện tại</span><b>${ROLE_NAME[sh.role] || ''}</b></div></div>
  <div class="grid2">
  <section class="panel"><div class="panel-h"><h2>Kết nối</h2></div><div class="panel-b"><div class="calc">
    <span>Thư mục</span><span class="num" style="word-break:break-all">${esc(sh.root || '')}</span>
    <span>Nhóm</span><span>${esc(sh.team?.company || '')} · bản ${sh.team?.ver || ''}</span>
    <span>Tệp đính kèm chưa tải</span><span>${(sh.needFiles || []).length || 'Không'}</span>
    ${isGD() ? `<span>Máy phải đồng bộ ít nhất</span><span>${sh.team?.lease_days || 7} ngày một lần (đặt ở Bảng quyền)</span>` : ''}</div>
    <div class="row" style="margin-top:12px;flex-wrap:wrap"><label class="row" style="gap:6px">Tự đồng bộ mỗi <input id="sync-every" type="number" min="1" max="120" value="${every}" style="width:70px"> phút</label><button class="btn sm" data-act="sync-every">Lưu</button>
    <button class="btn sm" data-act="docs-open-root">Mở thư mục tài liệu</button>${isGD() ? '<button class="btn sm ghost-bad" data-act="share-disconnect">Ngắt kết nối</button>' : ''}</div></div></section>
  <section class="panel"><div class="panel-h"><h2>Điện thoại</h2></div><div class="panel-b">
    <p class="muted" style="margin-top:0">Điện thoại chỉ xem, cập nhật bằng tệp .sodaan xuất từ máy tính.</p>
    <div class="row"><button class="btn pri" data-act="sync-export">Xuất tệp cho điện thoại</button></div></div></section>
  </div>
  ${isGD() ? membersPanel() : ''}`;
};

/* ================= Nhân viên & vai trò (máy Giám đốc) ================= */
function membersPanel() {
  const ms = S.share?.members || [];
  return `<section class="panel"><div class="panel-h"><h2>Nhân viên trong nhóm</h2><span class="muted">Máy mới kết nối thư mục được nhận tự động nếu key do bạn cấp</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Người dùng</th><th>Mã key</th><th>Vai trò</th><th>Trạng thái</th><th>Gửi gần nhất</th><th></th></tr></thead><tbody>
  ${ms.map(m => `<tr><td><b>${esc(m.name)}</b><div class="muted num">${esc(m.machine || '')}</div></td><td class="num">${esc(m.serial)}</td>
    <td>${m.status === 'off' ? ROLE_NAME[m.role] : `<select data-mrole="${m.serial}"><option value="TN" ${m.role === 'TN' ? 'selected' : ''}>Trưởng nhóm</option><option value="NV" ${m.role === 'NV' ? 'selected' : ''}>Nhân viên</option></select>`}</td>
    <td>${pill(m.status === 'active' ? 'Đang dùng' : m.status === 'lock' ? 'Tạm khóa' : 'Đã xóa', m.status === 'active' ? 'good' : m.status === 'lock' ? 'warn' : 'bad')}</td>
    <td class="date">${esc(m.lastSeen || '—')}</td>
    <td class="nowrap">${m.status === 'off' ? '' : m.status === 'lock' ? `<button class="btn sm" data-act="m-unlock" data-id="${m.serial}">Mở khóa</button>` : `<button class="btn sm" data-act="m-lock" data-id="${m.serial}">Khóa tạm</button>`}${m.status !== 'off' ? `<button class="btn sm ghost-bad" data-act="m-del" data-id="${m.serial}">Xóa khỏi nhóm</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có máy nhân viên nào kết nối.</td></tr>'}
  </tbody></table></div></section>`;
}
const oldKeys = V.keys;
V.keys = () => oldKeys() + (joined() && isGD() ? membersPanel() : '');
const member = s => (S.share?.members || []).find(m => m.serial === s);
async function saveMember(m, patch, msg) {
  try { await api('team_save', { edits: [{ serial: m.serial, role: patch.role || m.role, status: patch.status || m.status, eff_date: '' }], rights: null, leaseDays: null });
    await load(); rerender(); toast(msg, 4000); } catch (e) { toast(String(e), 5000); }
}
A['m-lock'] = el => { const m = member(el.dataset.id); confirmBox('Khóa tạm máy này?', `Máy của <b>${esc(m.name)}</b> sẽ hiện màn hình khóa khi nhận lệnh (lần đồng bộ tiếp theo). Dữ liệu trên máy giữ nguyên, mở khóa lại được. Sửa đổi máy đó làm sau thời điểm khóa sẽ về đây thành phiếu để bạn quyết định.`, 'Khóa tạm', () => saveMember(m, { status: 'lock' }, 'Đã khóa. Lệnh có hiệu lực khi máy đó đồng bộ.')); };
A['m-unlock'] = el => { const m = member(el.dataset.id); saveMember(m, { status: 'active' }, 'Đã mở khóa'); };
A['m-del'] = el => { const m = member(el.dataset.id); confirmBox('Xóa khỏi nhóm?', `Khi máy của <b>${esc(m.name)}</b> nhận lệnh, phần mềm trên máy đó <b>xóa toàn bộ dữ liệu dự án và tệp đính kèm</b>, rồi khóa hẳn. Key của người này bị thu hồi. Khóa mã hóa của nhóm được thay để máy đó không đọc được thay đổi mới.<br><br><b>Sau đó</b> hãy vào Google Drive bỏ chia sẻ thư mục với Gmail của người này. Không hoàn tác được.`, 'Xóa khỏi nhóm', async () => {
  S.revoked.push({ id: uid('RV'), serial: m.serial, ten: m.name, ngay: today() }); await flush();
  await saveMember(m, { status: 'off' }, 'Đã xóa khỏi nhóm. Nhớ bỏ chia sẻ Google Drive với người này.'); }); };
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.mrole) { const m = member(t.dataset.mrole); if (m && t.value !== m.role) await saveMember(m, { role: t.value }, `Đã đổi ${m.name} thành ${ROLE_NAME[t.value]}. Máy đó tự đổi giao diện khi đồng bộ.`); }
});

/* ================= Bảng quyền (máy Giám đốc) ================= */
let RQ = null; // bản nháp bảng quyền đang sửa
const rightsDraft = () => RQ || (RQ = structuredClone({ ...(S.share?.team?.rights || { rules: {}, grants: [], locks: [] }), lease: S.share?.team?.lease_days || 7 }));
V.quyen = () => {
  if (!isGD() || !joined()) return '<div class="empty">Chỉ máy Giám đốc.</div>';
  const R = rightsDraft(); const groups = S.share.groups || []; const ms = (S.share.members || []).filter(m => m.status !== 'off');
  const whoName = w => w === 'TN' ? 'Mọi Trưởng nhóm' : w === 'NV' ? 'Mọi Nhân viên' : (member(w)?.name || w);
  const scName = s => !s || s === 'all' ? 'Mọi dự án' : (daById(s)?.ten || gtById(s)?.ma || s);
  const dataName = k => k === 'all' ? 'Mọi dữ liệu' : (groups.find(g => g[0] === k)?.[1] || k);
  return `<div class="head"><div><h1>Bảng quyền</h1><p class="sub">Quyết định mỗi vai trò, mỗi người được sửa gì. Bảng này đi kèm gói đồng bộ; máy nhân viên đổi theo ở lần đồng bộ sau.</p></div><div class="row"><button class="btn" data-act="q-reset">Bỏ thay đổi</button><button class="btn pri" data-act="q-save">Lưu và gửi đi</button></div></div>
  <section class="panel"><div class="panel-h"><h2>Quyền mặc định theo vai trò</h2></div><div class="tbl-wrap"><table><thead><tr><th>Dữ liệu</th><th>Trưởng nhóm</th><th>Nhân viên</th></tr></thead><tbody>
  ${groups.map(([k, l]) => `<tr><td>${esc(l)}</td><td>${lvSel(`r.${k}.TN`, R.rules?.[k]?.TN || 'x')}</td><td>${lvSel(`r.${k}.NV`, R.rules?.[k]?.NV || 'x')}</td></tr>`).join('')}
  </tbody></table></div><div class="panel-b muted">Sửa ngay: vào dữ liệu luôn, gửi các máy. Gửi duyệt: thành phiếu ở mục Duyệt thay đổi. Chỉ xem: thấy nhưng không có nút sửa. Ẩn: máy đó không thấy phần dữ liệu này.</div></section>
  <section class="panel"><div class="panel-h"><h2>Cấp quyền riêng</h2><button class="btn sm pri" data-act="q-grant">+ Cấp quyền</button></div><div class="tbl-wrap"><table><thead><tr><th>Cho ai</th><th>Phạm vi</th><th>Dữ liệu</th><th>Mức</th><th>Thời hạn</th><th>Bật</th><th></th></tr></thead><tbody>
  ${(R.grants || []).map((g, i) => `<tr><td>${esc(whoName(g.who))}</td><td>${esc(scName(g.scope))}</td><td>${esc(dataName(g.data))}</td><td>${pill(LV[g.lv] || g.lv, LVC[g.lv])}</td><td class="date">${g.from ? d(g.from) : '…'} → ${g.to ? d(g.to) : 'không hạn'}</td><td><input type="checkbox" class="check" data-q="g.${i}.on" ${g.on !== false ? 'checked' : ''}></td><td><button class="btn sm ghost-bad" data-act="q-gdel" data-i="${i}">Bỏ</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa cấp quyền riêng. Ví dụ: cho Hùng sửa ngay tiến độ dự án A đến hết tháng.</td></tr>'}
  </tbody></table></div><div class="panel-b muted">Quyền riêng của một người thắng quyền theo vai trò; quyền trong một dự án thắng quyền mọi dự án.</div></section>
  <section class="panel"><div class="panel-h"><h2>Khóa sổ</h2><button class="btn sm pri" data-act="q-lock">+ Khóa sổ</button></div><div class="tbl-wrap"><table><thead><tr><th>Phạm vi</th><th>Ghi chú</th><th>Từ lúc</th><th></th></tr></thead><tbody>
  ${(R.locks || []).map((l, i) => `<tr><td>${esc(scName(l.scope))}</td><td>${esc(l.ten || '')}</td><td class="date">${fmtT(l.at)}</td><td><button class="btn sm" data-act="q-ldel" data-i="${i}">Mở khóa</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa khóa sổ dự án, gói thầu nào.</td></tr>'}
  </tbody></table></div><div class="panel-b muted">Sau thời điểm khóa sổ, nhân viên chỉ xem được. Máy nào sửa khi chưa nhận lệnh khóa (mất mạng) thì thay đổi về đây thành phiếu "sửa muộn" để bạn nhận hoặc hủy.</div></section>
  <section class="panel"><div class="panel-h"><h2>Bảo vệ máy nhân viên</h2></div><div class="panel-b"><label class="row" style="gap:8px">Máy nhân viên tự khóa nếu không đồng bộ quá <input type="number" min="1" max="365" data-q="lease" value="${R.lease}" style="width:80px"> ngày</label></div></section>`;
};
document.addEventListener('change', e => {
  const q = e.target.dataset.q; if (!q || !RQ) return;
  const R = RQ, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  const [a, b, c] = q.split('.');
  if (a === 'r') { R.rules[b] = R.rules[b] || {}; R.rules[b][c] = v; }
  else if (a === 'g') R.grants[+b][c] = v;
  else if (a === 'lease') R.lease = Math.max(1, +v || 7);
});
A['q-reset'] = () => { RQ = null; rerender(); };
A['q-save'] = async () => { const R = rightsDraft();
  try { await api('team_save', { edits: [], rights: { rules: R.rules, grants: R.grants, locks: R.locks }, leaseDays: R.lease }); RQ = null; await load(); rerender(); toast('Đã lưu bảng quyền. Các máy nhận ở lần đồng bộ sau.', 4000); }
  catch (e) { toast(String(e), 5000); } };
A['q-gdel'] = el => { rightsDraft().grants.splice(+el.dataset.i, 1); rerender(); };
A['q-ldel'] = el => { rightsDraft().locks.splice(+el.dataset.i, 1); rerender(); };
A['q-grant'] = () => {
  const ms = (S.share.members || []).filter(m => m.status !== 'off');
  formModal({ title: 'Cấp quyền riêng', fields: [
    { k: 'who', label: 'Cho ai', type: 'select', opts: [...ms.map(m => [m.serial, m.name + ' (' + ROLE_NAME[m.role] + ')']), ['TN', 'Mọi Trưởng nhóm'], ['NV', 'Mọi Nhân viên']], half: 1 },
    { k: 'scope', label: 'Phạm vi', type: 'select', opts: [['all', 'Mọi dự án'], ...S.duAnList.map(a => [a.id, a.ten])], half: 1 },
    { k: 'data', label: 'Dữ liệu', type: 'select', opts: [['all', 'Mọi dữ liệu (toàn quyền)'], ...(S.share.groups || [])], half: 1 },
    { k: 'lv', label: 'Mức', type: 'select', opts: Object.entries(LV), value: 'n', half: 1 },
    { k: 'from', label: 'Từ ngày (để trống: ngay)', type: 'date', half: 1 }, { k: 'to', label: 'Đến ngày (để trống: không hạn)', type: 'date', half: 1 }],
    ok: 'Thêm', onSave: v => { rightsDraft().grants.push({ ...v, on: true }); rerender(); toast('Đã thêm. Bấm Lưu và gửi đi để áp dụng.'); } });
};
A['q-lock'] = () => {
  formModal({ title: 'Khóa sổ', fields: [
    { k: 'scope', label: 'Dự án hoặc gói thầu', type: 'select', opts: [...S.duAnList.map(a => [a.id, 'Dự án: ' + a.ten]), ...S.goiThau.map(g => [g.id, 'Gói: ' + g.ma + ' · ' + g.ten])] },
    { k: 'ten', label: 'Ghi chú', ph: 'VD: Đã quyết toán' }],
    ok: 'Khóa từ bây giờ', onSave: v => { rightsDraft().locks.push({ ...v, at: Date.now() }); rerender(); toast('Đã thêm. Bấm Lưu và gửi đi để áp dụng.'); } });
};

/* ================= Duyệt thay đổi (máy Giám đốc) ================= */
V.duyet = () => {
  if (!isGD()) return '<div class="empty">Chỉ máy Giám đốc.</div>';
  const f = S.duyetF || 'cho';
  const ls = S.phieu.filter(p => f === 'all' || (f === 'cho' ? p.status === 'cho' : p.status !== 'cho')).sort((a, b) => (b.at || 0) - (a.at || 0));
  const n = S.phieu.filter(p => p.status === 'cho').length;
  return `<div class="head"><div><h1>Duyệt thay đổi</h1><p class="sub">Đề xuất của Trưởng nhóm, Nhân viên và các thay đổi sửa muộn (sau khi khóa máy, khóa sổ, hoặc vượt quyền). Chọn từng mục để đồng ý.</p></div></div>
  <div class="chips">${[['cho', 'Chờ duyệt', n], ['xong', 'Đã xử lý'], ['all', 'Tất cả']].map(([k, l, c]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="duyet-f" data-f="${k}">${l}${c !== undefined ? ` <b>${c}</b>` : ''}</button>`).join('')}</div>
  ${ls.map(phieuCard).join('') || '<div class="empty">Không có phiếu.</div>'}`;
};
A['duyet-f'] = el => { S.duyetF = el.dataset.f; rerender(); };
function phieuCard(p, mine) {
  const st = { cho: ['Chờ duyệt', 'warn'], dongy: ['Đã đồng ý', 'good'], tuchoi: ['Đã từ chối', 'bad'], motphan: ['Đồng ý một phần', 'info'] }[p.status] || [p.status, ''];
  const items = p.items || []; const open = p.status === 'cho' && !mine;
  const picks = new Set(p.xuLy?.picks || []);
  return `<section class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>${esc(p.ten || p.by)} <span class="muted" style="font-weight:400">${esc(ROLE_NAME[p.role] || '')} · ${fmtT(p.at)}</span></h2>
    <div class="row">${p.kind === 'late' ? pill('Sửa muộn', 'bad') : pill('Đề xuất', 'info')}${pill(st[0], st[1])}</div></div>
    ${p.lyDo ? `<div class="panel-b note">${esc(p.lyDo)}</div>` : ''}
    <div class="tbl-wrap"><table><thead><tr>${open ? `<th><input type="checkbox" class="check" data-allof="pk-${p.id}" checked></th>` : '<th></th>'}<th>Mục</th><th>Trường</th><th>Hiện tại</th><th>Đề xuất</th></tr></thead><tbody>
    ${items.map((it, i) => `<tr><td>${open ? `<input type="checkbox" class="check" data-pk-${p.id}="${i}" checked>` : (p.status === 'cho' ? '' : (picks.has(i) ? '✓' : '✗'))}</td><td>${esc(CN[it.coll] || it.coll)}${it.moi ? ' <span class="pill info">mới</span>' : ''}<div class="muted">${esc(it.label)}</div></td><td>${esc(FL[it.f] || it.f)}</td><td>${showV(it.old, it.f)}</td><td><b>${showV(it.new, it.f)}</b></td></tr>`).join('')}
    </tbody></table></div>
    ${open ? `<div class="panel-b row" style="flex-wrap:wrap"><input id="pn-${p.id}" class="grow" placeholder="Ghi chú cho người đề xuất (không bắt buộc)"><button class="btn ghost-bad" data-act="ph-no" data-id="${p.id}">${p.kind === 'late' ? 'Hủy tất cả (quay về như cũ)' : 'Từ chối tất cả'}</button><button class="btn pri" data-act="ph-ok" data-id="${p.id}">Đồng ý mục đã chọn</button></div>`
      : p.xuLy ? `<div class="panel-b muted">${esc(p.xuLy.by || '')} xử lý ${fmtT(p.xuLy.at)}${p.xuLy.note ? ': ' + esc(p.xuLy.note) : ''}</div>` : ''}</section>`;
}
A['ph-ok'] = async el => { const id = el.dataset.id; const picks = [...document.querySelectorAll(`[data-pk-${id}]`)].filter(x => x.checked).map(x => +x.getAttribute(`data-pk-${id}`));
  if (!picks.length) { toast('Chưa chọn mục nào'); return; }
  try { const n = await api('phieu_decide', { id, picks, approve: true, note: $('#pn-' + id)?.value || '' }); await load(); rerender(); toast(`Đã đồng ý ${n} mục, gửi tới các máy`); } catch (e) { toast(String(e), 5000); } };
A['ph-no'] = async el => { const id = el.dataset.id;
  try { await api('phieu_decide', { id, picks: [], approve: false, note: $('#pn-' + id)?.value || '' }); await load(); rerender(); toast('Đã từ chối'); } catch (e) { toast(String(e), 5000); } };

V.dexuatcuatoi = () => {
  const ls = S.phieu.filter(p => p.by === S.lic.serial).sort((a, b) => (b.at || 0) - (a.at || 0));
  return `<div class="head"><div><h1>Đề xuất của tôi</h1><p class="sub">Thay đổi đã gửi Giám đốc duyệt. Khi được đồng ý, dữ liệu tự cập nhật ở lần đồng bộ sau.</p></div><button class="btn pri" data-act="sync-now">Đồng bộ ngay</button></div>
  ${ls.map(p => phieuCard(p, true)).join('') || '<div class="empty">Chưa gửi đề xuất nào.</div>'}`;
};

/* ================= Nhật ký sửa theo trường (máy Giám đốc) ================= */
V.nhatky = () => {
  setTimeout(loadFlog, 0);
  return `<div class="head"><div><h1>Nhật ký sửa</h1><p class="sub">Mọi thay đổi theo từng trường, trên mọi máy: ai sửa, lúc nào, giá trị cũ và mới.</p></div>
    <label class="row" style="gap:6px"><input type="checkbox" class="check" id="fl-ow" ${S.flOw ? 'checked' : ''}> Chỉ những lần ghi đè sửa của người khác</label></div>
  <section class="panel tbl-wrap" id="flog"><div class="empty">Đang tải...</div></section>`;
};
async function loadFlog() {
  const el = $('#flog'); if (!el) return;
  try { const rows = await api('field_log', { limit: 500, overw: !!S.flOw });
    el.innerHTML = `<table><thead><tr><th>Thời điểm</th><th>Người</th><th>Mục</th><th>Trường</th><th>Cũ</th><th>Mới</th><th>Kiểu</th></tr></thead><tbody>${rows.map(r => `<tr><td class="date">${fmtT(r.t)}</td><td>${esc(r.by)} <span class="muted">${esc(ROLE_NAME[r.role] || '')}</span></td><td>${esc(CN[r.coll] || r.coll)}<div class="muted">${esc(r.label)}</div></td><td>${esc(FL[r.f] || r.f)}</td><td>${showV(r.old, r.f)}</td><td>${showV(r.new, r.f)}</td><td>${esc(r.kind)}${r.overw ? ' ' + pill('ghi đè', 'warn') : ''}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có.</td></tr>'}</tbody></table>`;
  } catch (e) { el.innerHTML = `<div class="empty">${esc(String(e))}</div>`; }
}
document.addEventListener('change', e => { if (e.target.id === 'fl-ow') { S.flOw = e.target.checked; loadFlog(); } });

/* ================= Tài liệu của gói thầu ================= */
const SUBS = [['00_HopDong-PhuLuc', 'Hợp đồng, phụ lục'], ['TU_TamUng', 'Tạm ứng'], ['NT_NghiemThu', 'Nghiệm thu'], ['TT_ThanhToan', 'Thanh toán'], ['BBH_BienBanHop', 'Biên bản họp'], ['CV_CongVan', 'Công văn'], ['TD_TienDo', 'Ảnh, tệp tiến độ'], ['BH-QT_BaoHanh-QuyetToan', 'Bảo hành, quyết toán'], ['BG_BanGiao', 'Bàn giao'], ['KH_Khac', 'Khác']];
const subName = k => (SUBS.find(s => s[0] === k) || [k, k])[1];
function walk(v, out, path) {
  if (typeof v === 'string') { if (v.startsWith('files/')) out.push([path, v]); return; }
  if (Array.isArray(v)) v.forEach(x => walk(x, out, path)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, out, path || k));
}
/** Mọi tệp đính kèm của một gói (từ dữ liệu, có trên mọi máy). */
function gtFiles(g) {
  const out = []; const add = (sub, label, rec, coll) => { const f = []; walk(rec, f, ''); f.forEach(([p, rel]) => out.push({ sub: typeof sub === 'function' ? sub(p) : sub, label, rel, coll, id: rec.id })); };
  add(p => p === 'tamUng' ? 'TU_TamUng' : (p === 'bh' || p === 'qt') ? 'BH-QT_BaoHanh-QuyetToan' : '00_HopDong-PhuLuc', 'Hợp đồng ' + (g.hd || g.ma), g, 'goiThau');
  S.nghiemThu.filter(n => n.gt === g.id).forEach(n => { add('NT_NghiemThu', `Nghiệm thu đợt ${n.dot} (${d(n.ngay)})`, n, 'nghiemThu');
    S.thanhToan.filter(t => t.nt === n.id).forEach(t => add('TT_ThanhToan', `Thanh toán ${d(t.ngay)} ${t.ct || ''}`, t, 'thanhToan')); });
  S.hop.filter(h => h.gt === g.id).forEach(h => add('BBH_BienBanHop', h.ten, h, 'hop'));
  S.banGiao.filter(x => x.gt === g.id).forEach(x => add('BG_BanGiao', x.nd, x, 'banGiao'));
  S.congViec.filter(c => c.gt === g.id).forEach(c => add('TD_TienDo', c.ten, c, 'congViec'));
  S.taiLieu.filter(t => t.gt === g.id).forEach(t => add(t.muc || 'KH_Khac', t.ten, t, 'taiLieu'));
  return out;
}
T.tailieu = g => {
  const files = gtFiles(g); const canAdd = can('taiLieu', g.da);
  const by = {}; files.forEach(f => (by[f.sub] = by[f.sub] || []).push(f));
  if (joined() && S.docsFor !== g.id) { S.docsFor = g.id; S.docsList = null; api('docs_list', { gt: g.id }).then(r => { S.docsList = r; rerender(); }).catch(() => {}); }
  const dl = S.docsFor === g.id ? S.docsList : null;
  const known = new Set(files.map(f => fname(f.rel)));
  const extra = (dl?.files || []).filter(f => !known.has(f.name) && !known.has(f.name.replace(/ \(\d+\)(\.\w+)$/, '$1')));
  return `<section class="panel"><div class="panel-h"><h2>Tài liệu của gói</h2><div class="row">${dl?.exists ? `<button class="btn sm" data-act="docs-open" data-p="${esc(dl.dir)}">Mở thư mục trên Drive</button>` : ''}${canAdd ? `<button class="btn sm pri" data-act="tl-new" data-id="${g.id}">+ Thêm tài liệu</button>` : ''}</div></div>
    ${SUBS.filter(s => by[s[0]]).map(([k, l]) => `<div class="panel-b"><h3 style="margin:0 0 6px">${esc(l)}</h3><div class="list">${by[k].map(f => `<div class="li"><div class="grow"><div class="t">${esc(fname(f.rel))}</div><div class="muted">${esc(f.label || '')}</div></div><button class="btn sm" data-act="openfile" data-f="${esc(f.rel)}">Mở</button>${f.coll === 'taiLieu' && canAdd ? `<button class="btn sm" data-act="tl-edit" data-id="${f.id}">Sửa</button>` : ''}</div>`).join('')}</div></div>`).join('') || '<div class="empty">Chưa có tài liệu. Tệp đính kèm ở hợp đồng, nghiệm thu, thanh toán, biên bản họp, bàn giao tự hiện ở đây.</div>'}
  </section>
  ${extra.length ? `<section class="panel"><div class="panel-h"><h2>Tệp trong thư mục chưa gắn vào dữ liệu</h2><span class="muted">Do người dùng tự chép vào thư mục trên Drive</span></div><div class="list">${extra.map(f => `<div class="li"><div class="grow"><div class="t">${esc(f.name)}</div><div class="muted">${esc(subName(f.sub.split('/')[0]))} · ${esc(f.mtime)}</div></div><button class="btn sm" data-act="docs-open" data-p="${esc(f.path)}">Mở</button><button class="btn sm" data-act="ai-scan" data-p="${esc(f.path)}" data-gt="${g.id}">Quét AI</button></div>`).join('')}</div></section>` : ''}`;
};
function tlForm(t, gtId) {
  const isNew = !t; const g = gtById(gtId || t?.gt); t = t || { ngay: today(), muc: 'CV_CongVan' };
  formModal({ title: (isNew ? 'Thêm tài liệu · ' : 'Sửa tài liệu · ') + (g?.ma || ''), fields: [
    { k: 'ten', label: 'Tên tài liệu', req: 1, value: t.ten }, { k: 'muc', label: 'Mục', type: 'select', opts: SUBS, value: t.muc, half: 1 }, { k: 'ngay', label: 'Ngày', type: 'date', value: t.ngay, half: 1 },
    { k: 'so', label: 'Số văn bản', value: t.so, half: 1 }, { k: 'nd', label: 'Trích yếu, ghi chú', value: t.nd, half: 1 }, { k: 'tep', label: 'Tệp', type: 'file', value: t.tep, req: 1 }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { S.taiLieu = S.taiLieu.filter(x => x.id !== t.id); await flush(); rerender(); } } : null,
    onSave: async v => { if (isNew) S.taiLieu.push({ id: uid('TL'), gt: g.id, da: g.da, nguoi: S.lic.name, ...v }); else Object.assign(t, v); await flush(); rerender(); toast('Đã lưu tài liệu'); } });
}
A['tl-new'] = el => tlForm(null, el.dataset.id);
A['tl-edit'] = el => tlForm(S.taiLieu.find(x => x.id === el.dataset.id));
A['docs-open'] = async el => { try { await openPath(el.dataset.p); } catch (e) { toast('Không mở được: ' + e); } };
A['docs-open-root'] = async () => { try { await openPath(await api('docs_root')); } catch (e) { toast(String(e)); } };

/* ================= Tài liệu & AI quét ================= */
const PROV = { claude: 'Claude (Anthropic)', gemini: 'Gemini (Google)', openai: 'ChatGPT (OpenAI)' };
const DEF_MODEL = { claude: 'claude-opus-5-5', gemini: 'gemini-2.5-pro', openai: 'gpt-4.1' };
const aiCfg = () => S.kv.ai || { provider: 'claude', key: '', model: '' };
V.tailieu = () => {
  const ai = aiCfg();
  if (joined() && !S.inbox) { S.inbox = { files: [] }; api('docs_inbox').then(r => { S.inbox = r; rerender(); }).catch(() => {}); }
  const ib = S.inbox || { files: [] };
  return `<div class="head"><div><h1>Tài liệu & AI quét</h1><p class="sub">Quét bản scan hợp đồng, biên bản, chứng từ bằng AI để điền sẵn thông tin. AI chỉ gợi ý: bạn xem, sửa rồi bấm xác nhận mới vào dữ liệu.</p></div><div class="row"><button class="btn" data-act="ai-set">Cài đặt AI</button><button class="btn pri" data-act="ai-pick">Chọn tệp để quét</button></div></div>
  ${ai.key ? '' : `<div class="ro-banner">Chưa cài khóa API. Bấm <b>Cài đặt AI</b>, chọn Claude, Gemini hoặc ChatGPT và dán khóa API.</div>`}
  ${joined() ? `<section class="panel"><div class="panel-h"><h2>Tệp chờ phân loại</h2><div class="row"><button class="btn sm" data-act="docs-open" data-p="${esc(ib.dir || '')}">Mở thư mục chờ</button><button class="btn sm" data-act="inbox-reload">Tải lại</button></div></div>
    <div class="panel-b muted" style="padding-bottom:0">Chép bản scan vào thư mục <b>2_DuLieu/_ChuaPhanLoai</b> trên Google Drive (từ máy nào cũng được), rồi quét ở đây. Tệp đã nhập được chuyển vào _ChuaPhanLoai/_DaNhap.</div>
    <div class="list">${(ib.files || []).map(f => `<div class="li"><div class="grow"><div class="t">${esc(f.name)}</div><div class="muted">${esc(f.mtime)} · ${Math.round(f.size / 1024)} KB</div></div><button class="btn sm" data-act="docs-open" data-p="${esc(f.path)}">Mở</button><button class="btn sm pri" data-act="ai-scan" data-p="${esc(f.path)}">Quét AI</button><button class="btn sm" data-act="ai-manual" data-p="${esc(f.path)}">Nhập tay</button></div>`).join('') || '<div class="empty">Không có tệp chờ.</div>'}</div></section>` : ''}
  <section class="panel"><div class="panel-h"><h2>AI đang dùng</h2></div><div class="panel-b"><div class="calc"><span>Hãng</span><b>${esc(PROV[ai.provider] || ai.provider)}</b><span>Mô hình</span><span class="num">${esc(ai.model || DEF_MODEL[ai.provider])}</span><span>Khóa API</span><span>${ai.key ? 'Đã nhập (••••' + esc(ai.key.slice(-4)) + ')' : 'Chưa nhập'}</span></div>
  <p class="muted">Tệp được gửi thẳng từ máy này tới hãng AI đã chọn để đọc, theo tài khoản và khóa API của anh/chị. Phí tính theo bảng giá của hãng.</p></div></section>`;
};
A['inbox-reload'] = () => { S.inbox = null; rerender(); };
A['ai-set'] = () => { const a = aiCfg();
  formModal({ title: 'Cài đặt AI quét tài liệu', fields: [
    { k: 'provider', label: 'Hãng AI', type: 'select', opts: Object.entries(PROV), value: a.provider, half: 1 },
    { k: 'model', label: 'Tên mô hình (để trống: mặc định)', value: a.model, ph: DEF_MODEL[a.provider], half: 1, hint: 'Mặc định: Claude ' + DEF_MODEL.claude + ', Gemini ' + DEF_MODEL.gemini + ', ChatGPT ' + DEF_MODEL.openai + '. Đổi khi hãng ra mô hình mới.' },
    { k: 'key', label: 'Khóa API', type: 'password', value: a.key, hint: 'Claude: console.anthropic.com > API keys. Gemini: aistudio.google.com > Get API key. ChatGPT: platform.openai.com > API keys. Khóa chỉ lưu trên máy này.' }],
    extra: '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="ai-test">Kiểm tra kết nối</button><span class="muted" id="ai-test-r"></span></div>',
    onSave: async v => { await kvSet('ai', v); rerender(); toast('Đã lưu cài đặt AI'); } }); };
A['ai-test'] = async () => { const v = readForm(); const r = $('#ai-test-r'); r.textContent = 'Đang thử...';
  try { r.textContent = await api('ai_test', { provider: v.provider, key: v.key, model: v.model }); r.style.color = 'var(--good)'; } catch (e) { r.textContent = String(e); r.style.color = 'var(--bad)'; } };
A['ai-pick'] = async () => { const p = await openDlg({ multiple: false, filters: [{ name: 'PDF, ảnh', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] }] }); if (p) scan(String(p)); };
A['ai-scan'] = el => scan(el.dataset.p, el.dataset.gt);
A['ai-manual'] = el => suggestForm({ loai: 'khac', truong: {} }, el.dataset.p);

function ctxText() {
  return S.goiThau.map(g => `- id ${g.id}: dự án "${daById(g.da)?.ten || ''}", gói ${g.ma} "${g.ten}"${g.hd ? ', HĐ số ' + g.hd : ''}`).join('\n') || '(chưa có gói thầu)';
}
async function scan(path, gt) {
  if (!aiCfg().key) { A['ai-set'](); toast('Nhập khóa API trước'); return; }
  modal('Đang đọc tài liệu', `<div class="note">AI đang đọc <b>${esc(fname(path))}</b>. Tệp nhiều trang có thể mất 30 giây đến vài phút.</div>`, '<button class="btn" data-close="1">Ẩn</button>');
  try { const r = await api('ai_scan', { path, rel: null, ctx: ctxText() }); if (gt && !r.gt) r.gt = gt; suggestForm(r, path); }
  catch (e) { closeModal(); toast('AI không đọc được: ' + e, 7000); }
}
const LOAI = [['hopdong', 'Hợp đồng'], ['phuluc', 'Phụ lục hợp đồng'], ['tamung', 'Tạm ứng'], ['nghiemthu', 'Biên bản nghiệm thu'], ['thanhtoan', 'Chứng từ thanh toán'], ['bienbanhop', 'Biên bản họp'], ['congvan', 'Công văn'], ['bangiao', 'Biên bản bàn giao'], ['baohanh', 'Bảo hành'], ['quyettoan', 'Quyết toán'], ['khac', 'Khác']];
let SG = null;
function suggestForm(r, path) {
  const t = r.truong || {}; SG = { path, r };
  const gtOpts = S.goiThau.map(g => [g.id, `${g.ma} · ${g.ten} (${daById(g.da)?.ten || ''})`]);
  const conf = r.doTinCay !== undefined ? Math.round(r.doTinCay * 100) : null;
  formModal({ title: 'Xác nhận thông tin từ tài liệu', cls: 'wide', fields: [
    { k: 'loai', label: 'Loại văn bản', type: 'select', opts: LOAI, value: r.loai || 'khac', half: 1 },
    { k: 'gt', label: 'Gói thầu', type: 'select', opts: [['', '(chọn gói thầu)'], ...gtOpts], value: r.gt || '', half: 1, req: 1 },
    { k: 'ten', label: 'Tên tài liệu', value: r.tieuDe || fname(path) },
    { k: 'so', label: 'Số văn bản / số HĐ', value: t.so, half: 1 }, { k: 'ngay', label: 'Ngày', type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(t.ngay || '') ? t.ngay : today(), half: 1 },
    { k: 'giaTri', label: 'Giá trị / số tiền (đ)', type: 'money', value: t.giaTri || 0, half: 1 }, { k: 'dot', label: 'Đợt (nghiệm thu)', type: 'number', value: t.dot || '', half: 1 },
    { k: 'nhaThau', label: 'Nhà thầu', value: t.nhaThau, half: 1 }, { k: 'chungTu', label: 'Số chứng từ', value: t.chungTu, half: 1 },
    { k: 'diaDiem', label: 'Địa điểm (họp)', value: t.diaDiem, half: 1 }, { k: 'benGiao', label: 'Bên giao', value: t.benGiao, half: 1 }, { k: 'benNhan', label: 'Bên nhận', value: t.benNhan, half: 1 },
    { k: 'noiDung', label: 'Nội dung, trích yếu', type: 'textarea', rows: 2, value: t.noiDung || r.tomTat }],
    extra: `<div class="note" style="margin-top:10px">${r.tomTat ? '<b>AI tóm tắt:</b> ' + esc(r.tomTat) + '<br>' : ''}${conf !== null ? `Mức chắc chắn của AI: <b>${conf}%</b>. ` : ''}Kiểm tra lại từng ô trước khi xác nhận. <button class="btn sm" data-act="docs-open" data-p="${esc(path)}">Mở tệp để đối chiếu</button></div>`,
    ok: 'Xác nhận, đưa vào dữ liệu', onSave: v => applySuggestion(v) });
}
async function applySuggestion(v) {
  const g = gtById(v.gt); if (!g) return 'Chọn gói thầu';
  const name = fname(SG.path); const rel = await api('file_store', { src: SG.path, name, bytes: null });
  const tl = muc => S.taiLieu.push({ id: uid('TL'), gt: g.id, da: g.da, ten: v.ten, muc, ngay: v.ngay, so: v.so, nd: v.noiDung, tep: rel, nguoi: S.lic.name, ai: 1 });
  switch (v.loai) {
    case 'hopdong': { const p = {}; if (v.so && !g.hd) p.hd = v.so; if (v.ngay && !g.ngayKy) p.ngayKy = v.ngay; if (v.giaTri && !g.gt) p.gt = v.giaTri; Object.assign(g, p); tl('00_HopDong-PhuLuc'); break; }
    case 'phuluc': tl('00_HopDong-PhuLuc'); break;
    case 'tamung': g.tamUng = [...(g.tamUng || []), { lan: (g.tamUng || []).length + 1, ngay: v.ngay, tien: v.giaTri, tep: rel }]; break;
    case 'nghiemthu': { const dot = v.dot || (S.nghiemThu.filter(n => n.gt === g.id).length + 1); S.nghiemThu.push({ id: uid('NT'), gt: g.id, dot, ngay: v.ngay, gtri: v.giaTri, bb: rel }); break; }
    case 'thanhtoan': { const nts = S.nghiemThu.filter(n => n.gt === g.id).sort((a, b) => b.dot - a.dot); if (!nts.length) return 'Gói này chưa có đợt nghiệm thu để ghi thanh toán';
      const nt = (v.dot && nts.find(n => n.dot === v.dot)) || nts[0]; S.thanhToan.push({ id: uid('TT'), nt: nt.id, ngay: v.ngay, tien: v.giaTri, ct: v.chungTu || v.so, tep: rel }); break; }
    case 'bienbanhop': S.hop.push({ id: uid('H'), da: g.da, gt: g.id, ten: v.ten, luc: v.ngay + 'T08:30', diaDiem: v.diaDiem, tep: rel }); break;
    case 'bangiao': S.banGiao.push({ id: uid('BG'), gt: g.id, ngay: v.ngay, nd: v.noiDung || v.ten, giao: v.benGiao, nhan: v.benNhan, tep: rel }); break;
    case 'congvan': tl('CV_CongVan'); break;
    case 'baohanh': case 'quyettoan': tl('BH-QT_BaoHanh-QuyetToan'); break;
    default: tl('KH_Khac');
  }
  await flush();
  if (joined()) { try { await api('docs_inbox_done', { path: SG.path }); } catch (e) { console.warn(e); } S.inbox = null; }
  rerender(); toast('Đã đưa vào dữ liệu');
}
