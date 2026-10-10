// Nhập liệu và thao tác: mỗi khóa trong A ứng với data-act trên nút.
import { save as saveDlg, open as openDlg } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { S, api, esc, vnd, d, today, uid, addDays, gtById, daById, ntById, cvById, tc, ntRows, can, followed, flush, kvSet, ROLE_NAME, staff, fmtNow, gtOf, donVi, num } from './core.js';
import { modal, closeModal, formModal, toast, confirmBox, pill } from './ui.js';
import { saveBytes } from './bienban.js';
import { buildXlsx, buildFinanceXlsx, rpScope, rpPreview, printHtml } from './report.js';
import { tick, testRule, nhAlerts } from './notify.js';

export const A = {};
const rerender = () => window.dispatchEvent(new Event('sda-render'));
async function commit(msg) { const n = await flush(); rerender(); if (msg && n) toast(msg); }
const TT_DA = ['Chuẩn bị', 'Đang hoạt động', 'Tạm dừng', 'Đã đóng'];
const g0 = () => gtById(S.gtSel);

/* ---------- Dự án ---------- */
function daForm(a) {
  const isNew = !a; a = a || { tt: 'Đang hoạt động', bd: today(), tn: S.lic.role === 'TN' ? S.lic.name : '' };
  const f = [
    { k: 'ten', label: 'Tên dự án', req: 1, value: a.ten },
    { k: 'cdt', label: 'Chủ đầu tư', req: 1, value: a.cdt, half: 1 }, { k: 'cdtDc', label: 'Địa chỉ chủ đầu tư', value: a.cdtDc, half: 1 },
    { k: 'cdtNguoi', label: 'Người của chủ đầu tư (dùng khi lập biên bản)', type: 'people', value: a.cdtNguoi, rows: 3 },
    { k: 'diaDiem', label: 'Địa điểm xây dựng', value: a.diaDiem, half: 1 }, { k: 'nhom', label: 'Nhóm dự án', value: a.nhom, half: 1, type: 'list', opts: ['Nhóm A', 'Nhóm B', 'Nhóm C'] },
    { k: 'tn', label: 'Trưởng nhóm phụ trách', value: a.tn, half: 1, type: 'list', opts: staff() }, { k: 'tt', label: 'Trạng thái', type: 'select', opts: TT_DA, value: a.tt, half: 1 },
    { k: 'bd', label: 'Bắt đầu', type: 'date', value: a.bd, half: 1 }, { k: 'kt', label: 'Kết thúc dự kiến', type: 'date', value: a.kt, half: 1 },
    { k: 'donViKhac', label: 'Đơn vị khác tham gia (tư vấn giám sát, thiết kế...)', type: 'checks', opts: S.danhBa.map(x => [x.id, x.ten + (x.loai ? ' · ' + x.loai : '')]), value: a.donViKhac || [], hint: 'Thêm đơn vị ở mục Nhà thầu & đơn vị' },
    { k: 'ghiChu', label: 'Ghi chú', type: 'textarea', value: a.ghiChu, rows: 2 },
  ];
  if (!isNew && can('dongDA', a.id)) f.push({ k: 'luuTru', label: 'Lưu trữ (ẩn khỏi danh sách và tổng quan)', type: 'check', value: a.luuTru });
  formModal({ title: isNew ? 'Tạo dự án' : 'Sửa thông tin dự án', fields: f,
    danger: !isNew && can('xoaDA', a.id) ? { label: 'Xóa dự án', onDelete: () => delDA(a.id) } : null,
    onSave: async v => {
      if (!isNew && !can('dongDA', a.id) && v.tt !== a.tt && ['Đã đóng', 'Tạm dừng'].includes(v.tt)) return 'Vai trò của bạn không đóng hoặc tạm dừng dự án';
      if (isNew) { const x = { id: uid('DA'), ...v }; S.duAnList.push(x); await commit('Đã tạo dự án'); S.duAn = x.id; S.daTab = 'goithau'; S.view = 'duandetail'; rerender(); }
      else { Object.assign(a, v); await commit('Đã lưu'); }
    } });
}
A['da-new'] = () => daForm();
A['da-edit'] = el => daForm(daById(el.dataset.id));
function delDA(id) {
  const a = daById(id); const gts = S.goiThau.filter(g => g.da === id);
  confirmBox('Xóa dự án?', `Xóa <b>${esc(a.ten)}</b> cùng ${gts.length} gói thầu, mọi công việc, nghiệm thu, thanh toán của dự án. Không hoàn tác được (vẫn còn bản sao lưu tự động).`, 'Xóa dự án', async () => {
    gts.forEach(g => dropGT(g.id)); S.duAnList = S.duAnList.filter(x => x.id !== id); S.hop = S.hop.filter(x => x.da !== id);
    await commit('Đã xóa dự án'); S.view = 'duan'; rerender(); });
}
function dropGT(gid) {
  const nts = new Set(S.nghiemThu.filter(n => n.gt === gid).map(n => n.id));
  S.thanhToan = S.thanhToan.filter(t => !nts.has(t.nt)); S.nghiemThu = S.nghiemThu.filter(n => n.gt !== gid);
  S.congViec = S.congViec.filter(c => c.gt !== gid); S.deXuat = S.deXuat.filter(x => x.gt !== gid); S.banGiao = S.banGiao.filter(x => x.gt !== gid);
  S.goiThau = S.goiThau.filter(g => g.id !== gid);
}
A['toggle-archived'] = () => { S.showArchived = !S.showArchived; rerender(); };

/* ---------- Gói thầu (hợp đồng) ---------- */
function gtForm(g) {
  const isNew = !g; const da = isNew ? S.duAn : g.da; g = g || { tlThuHoi: 0, soNgayTT: 30, bh: { ht: 'Giữ tiền', tl: 0.05 } };
  const nts = S.nhaThau.map(n => [n.id, n.ten]);
  const fin = can('xemTC');
  const f = [
    { k: 'ma', label: 'Mã gói', req: 1, value: g.ma, half: 1, ph: 'VD: XL-01' }, { k: 'ten', label: 'Tên gói thầu', req: 1, value: g.ten, half: 1 },
    { k: 'nt', label: 'Nhà thầu', type: 'select', opts: [['', nts.length ? '— Chọn nhà thầu —' : '— Chưa có nhà thầu, thêm ở mục Nhà thầu —'], ...nts], value: g.nt, half: 1 },
    { k: 'hd', label: 'Số hợp đồng', value: g.hd, half: 1 }, { k: 'ngayKy', label: 'Ngày ký hợp đồng', type: 'date', value: g.ngayKy, half: 1 },
  ];
  if (fin) f.push({ k: 'gt', label: 'Giá trị hợp đồng (đ)', type: 'money', value: g.gt, half: 1 }, { k: 'tlThuHoi', label: 'Tỷ lệ thu hồi tạm ứng mỗi đợt (%)', type: 'percent', value: g.tlThuHoi, half: 1 }, { k: 'soNgayTT', label: 'Số ngày phải thanh toán sau nghiệm thu', type: 'number', value: g.soNgayTT, half: 1 });
  if (isNew) f.push({ k: 'bhht', label: 'Hình thức bảo hành', type: 'select', opts: ['Giữ tiền', 'Nộp bảo lãnh', 'Không có'], value: g.bh.ht, half: 1 }, { k: 'bhtl', label: 'Tỷ lệ bảo hành (%)', type: 'percent', value: g.bh.tl, half: 1 });
  formModal({ title: isNew ? 'Thêm gói thầu' : 'Sửa gói thầu, hợp đồng', fields: f,
    danger: !isNew && can('xoaGT', da) ? { label: 'Xóa gói thầu', onDelete: () => confirmBox('Xóa gói thầu?', `Xóa <b>${esc(g.ma)}</b> cùng công việc, nghiệm thu, thanh toán của gói.`, 'Xóa gói thầu', async () => { dropGT(g.id); await commit('Đã xóa gói thầu'); S.view = 'duandetail'; S.daTab = 'goithau'; rerender(); }) } : null,
    onSave: async v => {
      if (S.goiThau.some(x => x.da === da && x.id !== g.id && x.ma.trim().toLowerCase() === v.ma.toLowerCase())) return 'Mã gói đã có trong dự án';
      if (isNew) { const { bhht, bhtl, ...rest } = v; const x = { id: uid('GT'), da, tamUng: [], gt: 0, tlThuHoi: 0, soNgayTT: 30, ...rest, soNgayTT: rest.soNgayTT ?? 30, bh: { ht: bhht, tl: bhtl } }; S.goiThau.push(x); await commit('Đã thêm gói thầu'); S.gtSel = x.id; S.view = 'goithau'; S.tab = 'congviec'; rerender(); }
      else { Object.assign(g, v); await commit('Đã lưu'); }
    } });
}
A['gt-new'] = () => gtForm();
A['gt-edit'] = el => gtForm(gtById(el.dataset.id));

/* ---------- Công việc ---------- */
A.quet = () => {
  const g = g0(); const co = new Set(S.congViec.filter(c => c.gt === g.id).map(c => c.mau));
  const con = S.thuVien.filter(m => !co.has(m.id)).sort((a, b) => (a.nhom + a.ten).localeCompare(b.nhom + b.ten));
  modal('Quét thư viện · ' + g.ma, `<p class="muted" style="margin:0">${co.size ? co.size + ' việc đã có trong gói nên không hiện ở đây. ' : ''}Hạn gợi ý = ngày bắt đầu + số ngày mặc định của mẫu.</p>
  <div class="grid-f"><div class="field"><label for="tv-bd">Ngày bắt đầu tính hạn</label><input id="tv-bd" type="date" value="${today()}"></div>
  <div class="field"><label for="tv-nguoi">Giao cho</label><input id="tv-nguoi" list="tv-nguoi-dl" value="${esc(S.lic.name)}"><datalist id="tv-nguoi-dl">${staff().map(p => `<option value="${esc(p)}">`).join('')}</datalist></div></div>
  <div class="tbl-wrap" style="max-height:46vh;overflow:auto"><table><thead><tr><th style="width:36px"><input type="checkbox" class="check" data-allof="tv" aria-label="Chọn tất cả"></th><th>Công việc</th><th>Nhóm</th><th class="r">Số ngày</th></tr></thead><tbody>
  ${con.map(m => `<tr><td><input type="checkbox" class="check" id="tv-${m.id}" data-tv="${m.id}"></td><td><label for="tv-${m.id}">${esc(m.ten)}</label></td><td>${esc(m.nhom)}</td><td class="r num">${m.ngay}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Thư viện không còn việc nào chưa dùng. Thêm mẫu ở mục Thư viện công việc.</td></tr>'}
  </tbody></table></div>`, `<button class="btn" data-close="1">Hủy</button><button class="btn pri" data-act="quet-ok">Thêm vào gói thầu</button>`, 'wide');
};
A['quet-ok'] = async () => {
  const g = g0(); const bd = document.getElementById('tv-bd').value || today(); const nguoi = document.getElementById('tv-nguoi').value.trim();
  const ids = [...document.querySelectorAll('[data-tv]:checked')].map(x => x.dataset.tv); if (!ids.length) { toast('Chưa chọn việc nào'); return; }
  ids.forEach(id => { const m = S.thuVien.find(x => x.id === id); const h = addDays(bd, +m.ngay || 0); S.congViec.push({ id: uid('CV'), gt: g.id, mau: m.id, ten: m.ten, nguoi, goc: h, hh: h, pb: 0, tt: 'Chưa làm', xong: '', notes: [] }); });
  closeModal(); await commit(`Đã thêm ${ids.length} việc`);
};
A['cv-new'] = () => { const g = g0();
  formModal({ title: 'Thêm việc ngoài thư viện · ' + g.ma, fields: [
    { k: 'ten', label: 'Tên công việc', req: 1 }, { k: 'nguoi', label: 'Người phụ trách', type: 'list', opts: staff(), value: S.lic.name, half: 1 },
    { k: 'goc', label: 'Hạn chót', type: 'date', req: 1, value: addDays(today(), 7), half: 1 }, { k: 'tt', label: 'Trạng thái', type: 'select', opts: ['Chưa làm', 'Đang làm'], half: 1 },
    { k: 'luu', label: 'Lưu thêm vào thư viện để dùng lại', type: 'check', half: 1 }],
    onSave: async v => { S.congViec.push({ id: uid('CV'), gt: g.id, mau: '', ten: v.ten, nguoi: v.nguoi, goc: v.goc, hh: v.goc, pb: 0, tt: v.tt, xong: '', notes: [] });
      if (v.luu && can('thuVien')) S.thuVien.push({ id: uid('M'), ten: v.ten, nhom: 'Khác', ngay: 7 }); await commit('Đã thêm việc'); } }); };

/** Chi tiết công việc: thông tin, ghi chú, ảnh hiện trường. */
A.cv = el => cvModal(el.dataset.cv || el.dataset.id);
function cvModal(id) {
  const c = cvById(id); if (!c) return; const g = gtOf(c); const a = daById(g.da) || {};
  const edit = can('themCV', g.da);
  const notes = (c.notes || []).slice().reverse();
  modal(c.ten, `<div class="note">${esc(a.ten || '')} · ${esc(g.ma)} · ${esc(g.ten)}</div>
    <div class="calc"><span>Người phụ trách</span><b>${esc(c.nguoi || '—')}</b><span>Hạn gốc</span><span class="date">${d(c.goc)}</span><span>Hạn hiện hành</span><span class="date">${d(c.hh)}${c.pb ? ` · đã điều chỉnh ${c.pb} lần` : ''}</span><span>Trạng thái</span><span>${pill(c.tt)}${c.xong ? ' ngày ' + d(c.xong) : ''}</span></div>
    ${edit ? `<div class="grid-f"><div class="field"><label for="cv-ten">Tên công việc</label><input id="cv-ten" value="${esc(c.ten)}"></div><div class="field"><label for="cv-nguoi">Người phụ trách</label><input id="cv-nguoi" list="cv-ng-dl" value="${esc(c.nguoi)}"><datalist id="cv-ng-dl">${staff().map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
      ${c.tt !== 'Hoàn thành' ? `<div class="field"><label for="cv-tt">Trạng thái</label><select id="cv-tt">${['Chưa làm', 'Đang làm'].map(x => `<option ${x === c.tt ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` : ''}</div>` : ''}
    <div class="bbsec"><h3>Ghi chú, ảnh hiện trường</h3>
    ${can('ghiChu', g.da) ? `<div class="field"><textarea id="cv-note" rows="2" placeholder="Ghi chú mới..."></textarea></div><div class="row"><span class="grow muted" id="f-cvimg-n">Không kèm ảnh</span><input type="hidden" id="f-cvimg"><button class="btn sm" data-pickfile="cvimg">Kèm ảnh, tệp</button><button class="btn sm pri" data-act="cv-note" data-id="${c.id}">Thêm ghi chú</button></div>` : ''}
    <div class="list">${notes.map(n => `<div class="li"><div class="grow"><div>${esc(n.t)}</div><div class="muted">${esc(n.ai)} · ${esc(n.luc)}</div></div>${n.tep ? `<button class="btn sm" data-act="openfile" data-f="${esc(n.tep)}">Mở tệp</button>` : ''}</div>`).join('') || '<div class="empty">Chưa có ghi chú.</div>'}</div></div>`,
    `${edit ? `<button class="btn ghost-bad" style="margin-right:auto" data-act="cv-del" data-id="${c.id}">Xóa việc</button>` : ''}<button class="btn" data-close="1">Đóng</button>${edit ? `<button class="btn pri" data-act="cv-save" data-id="${c.id}">Lưu</button>` : ''}`);
}
A['cv-note'] = async el => { const c = cvById(el.dataset.id); const t = document.getElementById('cv-note').value.trim(); const tep = document.getElementById('f-cvimg').value;
  if (!t && !tep) { toast('Nhập ghi chú hoặc kèm ảnh'); return; }
  c.notes = [...(c.notes || []), { luc: fmtNow(), ai: S.lic.name, t, tep }]; c.ghiChu = t || c.ghiChu; await flush(); cvModal(c.id); rerender(); };
A['cv-save'] = async el => { const c = cvById(el.dataset.id); const ten = document.getElementById('cv-ten').value.trim(); if (!ten) { toast('Tên công việc trống'); return; }
  c.ten = ten; c.nguoi = document.getElementById('cv-nguoi').value.trim(); const tt = document.getElementById('cv-tt'); if (tt) c.tt = tt.value; closeModal(); await commit('Đã lưu'); };
A['cv-del'] = el => { const c = cvById(el.dataset.id); confirmBox('Xóa công việc?', `Xóa <b>${esc(c.ten)}</b>.`, 'Xóa', async () => { S.congViec = S.congViec.filter(x => x.id !== c.id); await commit('Đã xóa'); }); };

A.done = el => { const c = cvById(el.dataset.id); const g = gtOf(c);
  modal('Xác nhận công việc đã xong?', `<div class="note"><b>${esc(c.ten)}</b><br>${esc(g.ma)} · ${esc(g.ten)} · ${esc(c.nguoi)}</div>
  <div class="calc"><span>Hạn gốc</span><span class="date">${d(c.goc)}</span><span>Hạn hiện hành</span><span class="date">${d(c.hh)}</span></div>
  <div class="field"><label for="done-ngay">Ngày hoàn thành thực tế</label><input id="done-ngay" type="date" value="${today()}" max="${today()}"></div>
  <div class="field"><label for="done-note">Ghi chú (không bắt buộc)</label><input id="done-note" placeholder="Ví dụ: đã có biên bản nghiệm thu số 15/BBNT"></div>
  <p class="muted" style="margin:0">Kiểm tra lại đúng công việc trước khi xác nhận. Nếu nhầm, có thể hoàn tác sau.</p>`,
  `<button class="btn" data-close="1">Không, quay lại</button><button class="btn good" data-act="done-ok" data-id="${c.id}">Đúng, đã xong</button>`); };
A['done-ok'] = async el => { const c = cvById(el.dataset.id); c.tt = 'Hoàn thành'; c.xong = document.getElementById('done-ngay').value || today();
  const n = document.getElementById('done-note').value.trim(); c.notes = [...(c.notes || []), { luc: fmtNow(), ai: S.lic.name, t: 'Đánh dấu xong ngày ' + d(c.xong) + (n ? ': ' + n : '') }];
  closeModal(); await commit('Đã ghi nhận hoàn thành'); };
A.undo = el => { const c = cvById(el.dataset.id);
  confirmBox('Hoàn tác trạng thái đã xong?', `<b>${esc(c.ten)}</b><br>Đang ghi nhận hoàn thành ngày ${d(c.xong)}. Sau khi hoàn tác: Đang làm, xóa ngày hoàn thành. Việc hoàn tác được ghi vào lịch sử công việc.`, 'Hoàn tác', async () => {
    c.notes = [...(c.notes || []), { luc: fmtNow(), ai: S.lic.name, t: 'Hoàn tác trạng thái xong (trước đó xong ngày ' + d(c.xong) + ')' }]; c.tt = 'Đang làm'; c.xong = ''; await commit('Đã hoàn tác'); }); };

A.dcsave = async () => {
  const g = g0(); const lyDo = document.getElementById('ly-do').value.trim(); const vb = document.getElementById('f-dxvb').value;
  const rows = [...document.querySelectorAll('[data-dx]:checked')].map(x => { const c = cvById(x.dataset.dx); return { c, moi: document.getElementById('dxd-' + c.id).value }; }).filter(r => r.moi && r.moi !== r.c.hh);
  if (!rows.length) { toast('Chọn công việc và nhập hạn mới khác hạn hiện hành'); return; }
  if (!lyDo) { toast('Nhập lý do điều chỉnh'); document.getElementById('ly-do').focus(); return; }
  S.deXuat.push({ id: uid('DX'), gt: g.id, nguoi: S.lic.name, ngay: today(), vb, lyDo, tt: 'Đã áp dụng', dong: rows.map(r => ({ cv: r.c.id, cu: r.c.hh, moi: r.moi })) });
  rows.forEach(r => { r.c.hh = r.moi; r.c.pb = (r.c.pb || 0) + 1; });
  await commit(`Đã điều chỉnh hạn ${rows.length} việc`);
};

/* ---------- Tài chính ---------- */
A['tu-new'] = () => tuForm(); A['tu-edit'] = el => tuForm(+el.dataset.i);
function tuForm(i) { const g = g0(); const x = i === undefined ? { lan: (g.tamUng || []).length + 1, ngay: today() } : g.tamUng[i];
  formModal({ title: (i === undefined ? 'Ghi tạm ứng lần ' : 'Sửa tạm ứng lần ') + x.lan + ' · ' + g.ma, fields: [
    { k: 'ngay', label: 'Ngày chi', type: 'date', req: 1, value: x.ngay, half: 1 }, { k: 'tien', label: 'Số tiền (đ)', type: 'money', req: 1, value: x.tien, half: 1 },
    { k: 'ct', label: 'Số chứng từ', value: x.ct, ph: 'VD: UNC 0318/KBNN' }, { k: 'tep', label: 'Tệp chứng từ', type: 'file', value: x.tep }],
    danger: i !== undefined ? { label: 'Xóa', onDelete: async () => { g.tamUng.splice(i, 1); g.tamUng.forEach((t, k) => t.lan = k + 1); await commit('Đã xóa'); } } : null,
    onSave: async v => { if (!v.tien) return 'Số tiền phải lớn hơn 0'; if (i === undefined) g.tamUng = [...(g.tamUng || []), { lan: x.lan, ...v }]; else Object.assign(g.tamUng[i], v); await commit('Đã lưu tạm ứng'); } }); }

A['nt-new'] = () => ntForm(); A['nt-edit'] = el => ntForm(S.nghiemThu.find(n => n.id === el.dataset.id));
function ntForm(n) { const g = g0(); const isNew = !n; n = n || { dot: S.nghiemThu.filter(x => x.gt === g.id).length + 1, ngay: today() };
  formModal({ title: `Đợt nghiệm thu ${n.dot} · ${g.ma}`, fields: [
    { k: 'ngay', label: 'Ngày nghiệm thu', type: 'date', req: 1, value: n.ngay, half: 1 }, { k: 'gtri', label: 'Giá trị nghiệm thu (đ)', type: 'money', req: 1, value: n.gtri, half: 1 },
    { k: 'bb', label: 'Biên bản nghiệm thu', type: 'file', value: n.bb }],
    extra: `<div class="calc" id="nt-calc" style="margin-top:12px"></div><p class="muted" style="margin:8px 0 0">Trừ tạm ứng ${Math.round((g.tlThuHoi || 0) * 100)}% (không vượt số tạm ứng còn lại)${g.bh?.ht === 'Giữ tiền' ? `, giữ bảo hành ${((g.bh.tl || 0) * 100).toLocaleString('vi-VN')}%` : ''}. Hạn thanh toán ${g.soNgayTT || 30} ngày.</p>`,
    danger: !isNew ? { label: 'Xóa đợt', onDelete: () => confirmBox('Xóa đợt nghiệm thu?', 'Xóa cả các lần thanh toán của đợt này.', 'Xóa', async () => { S.thanhToan = S.thanhToan.filter(t => t.nt !== n.id); S.nghiemThu = S.nghiemThu.filter(x => x.id !== n.id); S.nghiemThu.filter(x => x.gt === g.id).sort((a, b) => a.dot - b.dot).forEach((x, k) => x.dot = k + 1); await commit('Đã xóa'); }) } : null,
    onSave: async v => { if (!v.gtri) return 'Giá trị phải lớn hơn 0'; if (isNew) S.nghiemThu.push({ id: uid('NT'), gt: g.id, dot: n.dot, ...v }); else Object.assign(n, v); await commit('Đã lưu đợt nghiệm thu'); } });
  calcNT(n.id);
}
export function calcNT(skipId) {
  const el = document.getElementById('f-gtri'); const box = document.getElementById('nt-calc'); if (!el || !box) return;
  const g = g0(); const t = tc(g.id); const v = num(el.value);
  const before = skipId ? ntRows(g.id).find(r => r.id === skipId) : null;
  const tuCon = before ? before.tuConLai + before.khauTru : t.tuCon;
  const kt = Math.max(0, Math.min(v * (g.tlThuHoi || 0), tuCon)), giu = g.bh?.ht === 'Giữ tiền' ? v * (g.bh.tl || 0) : 0;
  box.innerHTML = `<span>Giá trị nghiệm thu</span><span class="num">${vnd(v)}</span><span>Trừ tạm ứng</span><span class="num">−${vnd(kt)}</span><span>Giữ lại bảo hành</span><span class="num">${giu ? '−' + vnd(giu) : '—'}</span><span class="tot">Đề nghị thanh toán</span><span class="num tot">${vnd(v - kt - giu)}</span>`;
}
A['tt-new'] = () => ttForm(); A['tt-edit'] = el => ttForm(S.thanhToan.find(t => t.id === el.dataset.id));
function ttForm(p) { const g = g0(); const rows = ntRows(g.id); const isNew = !p; const open = rows.find(r => r.con > 0) || rows[rows.length - 1];
  p = p || { nt: open?.id, ngay: today(), tien: open && open.con > 0 ? open.con : 0 };
  formModal({ title: 'Ghi thanh toán · ' + g.ma, fields: [
    { k: 'nt', label: 'Cho đợt nghiệm thu', type: 'select', opts: rows.map(r => [r.id, `Đợt ${r.dot} · đề nghị ${vnd(r.deNghi)} · còn ${vnd(r.con)}`]), value: p.nt },
    { k: 'ngay', label: 'Ngày chi', type: 'date', req: 1, value: p.ngay, half: 1 }, { k: 'tien', label: 'Số tiền (đ)', type: 'money', req: 1, value: p.tien, half: 1 },
    { k: 'ct', label: 'Số chứng từ', value: p.ct, ph: 'VD: UNC 0715/KBNN' }, { k: 'tep', label: 'Tệp chứng từ', type: 'file', value: p.tep }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { S.thanhToan = S.thanhToan.filter(x => x.id !== p.id); await commit('Đã xóa'); } } : null,
    onSave: async v => { if (!v.tien) return 'Số tiền phải lớn hơn 0'; if (isNew) S.thanhToan.push({ id: uid('TT'), ...v }); else Object.assign(p, v); await commit('Đã ghi thanh toán'); } }); }

A['bh-edit'] = () => { const g = g0(); const b = g.bh || { ht: 'Không có' };
  formModal({ title: 'Bảo hành · ' + g.ma, fields: [
    { k: 'ht', label: 'Hình thức', type: 'select', opts: ['Giữ tiền', 'Nộp bảo lãnh', 'Không có'], value: b.ht, half: 1 }, { k: 'tl', label: 'Tỷ lệ bảo hành (%)', type: 'percent', value: b.tl, half: 1 },
    { k: 'hhBH', label: 'Hết thời gian bảo hành', type: 'date', value: b.hhBH, half: 1 },
    { k: 'so', label: 'Số thư bảo lãnh', value: b.so, half: 1, hint: 'Khi nộp bảo lãnh' }, { k: 'nh', label: 'Ngân hàng phát hành', value: b.nh, half: 1 },
    { k: 'gt', label: 'Giá trị bảo lãnh (đ)', type: 'money', value: b.gt, half: 1 }, { k: 'hh', label: 'Ngày hết hạn thư', type: 'date', value: b.hh, half: 1 },
    { k: 'thu', label: 'Tệp thư bảo lãnh', type: 'file', value: b.thu },
    { k: 'traNgay', label: 'Ngày hoàn trả tiền giữ', type: 'date', value: b.traNgay, half: 1, hint: 'Khi giữ tiền' }, { k: 'traTep', label: 'Chứng từ hoàn trả', type: 'file', value: b.traTep }],
    onSave: async v => { if (v.ht === 'Nộp bảo lãnh' && !v.hh) return 'Nhập ngày hết hạn thư bảo lãnh để phần mềm nhắc'; g.bh = { ...b, ...v }; await commit('Đã lưu bảo hành'); } }); };

A['qt-edit'] = () => { const g = g0(); const t = tc(g.id); const q = g.qt || {};
  formModal({ title: 'Quyết toán hợp đồng · ' + g.ma, fields: [
    { k: 'gt', label: 'Giá trị quyết toán (đ)', type: 'money', req: 1, value: q.gt ?? t.daNT, half: 1 }, { k: 'ngay', label: 'Ngày phê duyệt quyết toán', type: 'date', value: q.ngay, half: 1 },
    { k: 'tep', label: 'Hồ sơ quyết toán', type: 'file', value: q.tep }],
    onSave: async v => { g.qt = { ...q, ...v, nguoi: S.lic.name, chot: false }; await commit('Đã lưu quyết toán'); } }); };
A['qt-chot'] = () => { const g = g0(); confirmBox('Chốt quyết toán?', `Chốt giá trị quyết toán <b>${vnd(g.qt.gt)}</b> cho ${esc(g.ma)}. Sau khi chốt, chỉ Giám đốc mở lại được để sửa.`, 'Chốt', async () => { g.qt.chot = true; g.qt.nguoiChot = S.lic.name; await commit('Đã chốt quyết toán'); }, false); };
A['qt-mo'] = async () => { const g = g0(); g.qt.chot = false; await commit('Đã mở lại quyết toán'); };

A['bg-new'] = () => bgForm(); A['bg-edit'] = el => bgForm(S.banGiao.find(x => x.id === el.dataset.id));
function bgForm(x) { const g = g0(); const isNew = !x; x = x || { ngay: today(), giao: donVi().ten || 'Ban QLDA', nhan: ntById(g.nt).ten };
  formModal({ title: 'Ghi bàn giao · ' + g.ma, fields: [{ k: 'ngay', label: 'Ngày', type: 'date', req: 1, value: x.ngay, half: 1 }, { k: 'nd', label: 'Nội dung', req: 1, value: x.nd, half: 1 },
    { k: 'giao', label: 'Bên giao', value: x.giao, half: 1 }, { k: 'nhan', label: 'Bên nhận', value: x.nhan, half: 1 }, { k: 'tep', label: 'Biên bản đã ký', type: 'file', value: x.tep }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { S.banGiao = S.banGiao.filter(y => y.id !== x.id); await commit('Đã xóa'); } } : null,
    onSave: async v => { if (isNew) S.banGiao.push({ id: uid('BG'), gt: g.id, ...v }); else Object.assign(x, v); await commit('Đã lưu'); } }); }

A['hop-new'] = () => hopForm(); A['hop-edit'] = el => hopForm(S.hop.find(h => h.id === el.dataset.id));
function hopForm(h) { const da = S.duAn; const isNew = !h; h = h || { luc: today() + 'T08:30' };
  formModal({ title: isNew ? 'Thêm cuộc họp' : 'Sửa cuộc họp', fields: [{ k: 'ten', label: 'Nội dung', req: 1, value: h.ten }, { k: 'luc', label: 'Thời gian', type: 'datetime-local', req: 1, value: h.luc, half: 1 },
    { k: 'diaDiem', label: 'Địa điểm', value: h.diaDiem, half: 1 }, { k: 'gt', label: 'Gói thầu', type: 'select', opts: [['', 'Cả dự án'], ...S.goiThau.filter(g => g.da === da).map(g => [g.id, g.ma + ' · ' + g.ten])], value: h.gt }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { S.hop = S.hop.filter(x => x.id !== h.id); await commit('Đã xóa'); } } : null,
    onSave: async v => { if (isNew) S.hop.push({ id: uid('H'), da, ...v }); else Object.assign(h, v); await commit('Đã lưu cuộc họp'); } }); }

/* ---------- Danh mục ---------- */
function ntcForm(n) { const isNew = !n; n = n || {};
  formModal({ title: isNew ? 'Thêm nhà thầu' : 'Sửa nhà thầu', fields: [{ k: 'ten', label: 'Tên nhà thầu', req: 1, value: n.ten }, { k: 'dc', label: 'Địa chỉ', value: n.dc },
    { k: 'email', label: 'Email', value: n.email, half: 1 }, { k: 'sdt', label: 'Điện thoại', value: n.sdt, half: 1 }, { k: 'nguoi', label: 'Người đại diện, liên hệ (người đầu tiên là đại diện)', type: 'people', value: n.nguoi }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { if (S.goiThau.some(g => g.nt === n.id)) { toast('Nhà thầu đang gắn với gói thầu, không xóa được'); return; } S.nhaThau = S.nhaThau.filter(x => x.id !== n.id); await commit('Đã xóa'); } } : null,
    onSave: async v => { v.lh = v.nguoi[0]?.ten || ''; if (isNew) S.nhaThau.push({ id: uid('NTC'), ...v }); else Object.assign(n, v); await commit('Đã lưu'); } }); }
A['ntc-new'] = () => ntcForm(); A['ntc-edit'] = el => ntcForm(S.nhaThau.find(x => x.id === el.dataset.id));
function dbForm(n) { const isNew = !n; n = n || {};
  formModal({ title: isNew ? 'Thêm đơn vị' : 'Sửa đơn vị', fields: [{ k: 'ten', label: 'Tên đơn vị', req: 1, value: n.ten }, { k: 'loai', label: 'Loại', type: 'list', opts: ['Tư vấn giám sát', 'Tư vấn thiết kế', 'Cơ quan quản lý', 'Đơn vị sử dụng', 'Khác'], value: n.loai, half: 1 },
    { k: 'dc', label: 'Địa chỉ', value: n.dc, half: 1 }, { k: 'nguoi', label: 'Người', type: 'people', value: n.nguoi }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { S.danhBa = S.danhBa.filter(x => x.id !== n.id); await commit('Đã xóa'); } } : null,
    onSave: async v => { if (isNew) S.danhBa.push({ id: uid('DV'), ...v }); else Object.assign(n, v); await commit('Đã lưu'); } }); }
A['db-new'] = () => dbForm(); A['db-edit'] = el => dbForm(S.danhBa.find(x => x.id === el.dataset.id));
function tvForm(m) { const isNew = !m; m = m || { ngay: 7 };
  formModal({ title: isNew ? 'Thêm mẫu công việc' : 'Sửa mẫu công việc', fields: [{ k: 'ten', label: 'Tên công việc', req: 1, value: m.ten }, { k: 'nhom', label: 'Nhóm', type: 'list', opts: [...new Set(['Hồ sơ', 'Thi công', 'Nghiệm thu', ...S.thuVien.map(x => x.nhom)])], value: m.nhom, half: 1 },
    { k: 'ngay', label: 'Số ngày mặc định', type: 'number', value: m.ngay, half: 1 }],
    danger: !isNew ? { label: 'Xóa', onDelete: async () => { S.thuVien = S.thuVien.filter(x => x.id !== m.id); await commit('Đã xóa'); } } : null,
    onSave: async v => { v.ngay = Math.max(0, Math.round(v.ngay || 0)); v.nhom = v.nhom || 'Khác'; if (isNew) S.thuVien.push({ id: uid('M'), ...v }); else Object.assign(m, v); await commit('Đã lưu'); } }); }
A['tv-new'] = () => tvForm(); A['tv-edit'] = el => tvForm(S.thuVien.find(x => x.id === el.dataset.id));
A['dv-edit'] = () => { const dv = donVi();
  formModal({ title: 'Thông tin đơn vị', fields: [{ k: 'ten', label: 'Tên đơn vị tư vấn QLDA', req: 1, value: dv.ten }, { k: 'dc', label: 'Địa chỉ', value: dv.dc },
    { k: 'tinh', label: 'Địa danh in trên văn bản', value: dv.tinh, ph: 'VD: Hà Nội', half: 1 }, { k: 'nguoi', label: 'Cán bộ (người đầu tiên là người đại diện ký văn bản)', type: 'people', value: dv.nguoi, rows: 6 }],
    onSave: async v => { const i = S.caiDat.findIndex(x => x.id === 'donVi'); const rec = { ...dv, ...v, id: 'donVi' }; if (i < 0) S.caiDat.push(rec); else S.caiDat[i] = rec; await commit('Đã lưu thông tin đơn vị'); } }); };

/* ---------- Tệp ---------- */
A.openfile = async el => { try { await openPath(await api('file_path', { rel: el.dataset.f })); } catch (e) { toast('Không mở được tệp: ' + e); } };
A.opendir = async () => { try { await openPath(S.info.dir); } catch (e) { toast(String(e)); } };
A.backup = async () => { try { const p = await api('backup_now'); toast('Đã sao lưu: ' + p.split(/[\\/]/).pop()); } catch (e) { toast('Lỗi sao lưu: ' + e); } };

/* ---------- Báo cáo ---------- */
A['rp-export'] = async () => {
  const scope = rpScope(); await kvSet('rp', S.rp);
  if (S.rp.fmt === 'pdf') { printHtml(rpPreview(scope)); return; }
  const bytes = await buildXlsx(scope);
  const p = await saveBytes(bytes, `Bao cao ${S.rp.loai === 'tiendo' ? 'tien do' : S.rp.loai === 'taichinh' ? 'tai chinh' : 'tien do va giai ngan'} ${today()}.xlsx`, 'xlsx', 'Excel');
  if (p) { toast('Đã xuất ' + p.split(/[\\/]/).pop()); try { await openPath(p); } catch { } }
};
A['tc-xlsx'] = async () => { const bytes = await buildFinanceXlsx(); const p = await saveBytes(bytes, `Tai chinh hop dong ${today()}.xlsx`, 'xlsx', 'Excel'); if (p) { toast('Đã xuất'); try { await openPath(p); } catch { } } };

/* ---------- Nhắc việc ---------- */
const saveNh = async () => { await kvSet('nh', S.nh); };
A['nh-add'] = async () => { S.nh.rules.push({ id: uid('r'), on: 1, su: 'cv', truoc: 2, dv: 'ngày', gio: '08:00', pham: 'all', kenh: { mh: 1, am: 1, mail: 0, tg: 0 }, lap: 'Một lần' }); await saveNh(); rerender(); };
A['nh-del'] = async el => { S.nh.rules.splice(+el.dataset.i, 1); await saveNh(); rerender(); };
A['nh-test'] = async el => { const u = await testRule(S.nh.rules[+el.dataset.i]); toast(u.length ? 'Đã gửi thử qua: ' + u.join(', ') : 'Chưa gửi được. Kiểm tra quyền thông báo của hệ điều hành.'); };
A['nh-now'] = async () => { await tick(true); toast('Đã kiểm tra và nhắc theo các quy tắc'); rerender(); };
A['nh-kenh'] = () => { const n = S.nh;
  formModal({ title: 'Cài đặt kênh gửi', fields: [
    { k: 'tgToken', label: 'Telegram: mã bot (bot token)', value: n.tg?.token, hint: 'Tạo bot bằng @BotFather trên Telegram, dán mã vào đây' }, { k: 'tgChat', label: 'Telegram: mã người nhận hoặc nhóm (chat id)', value: n.tg?.chat },
    { k: 'host', label: 'Email: máy chủ SMTP', value: n.mail?.host, half: 1, ph: 'VD: smtp.gmail.com' }, { k: 'port', label: 'Cổng', type: 'number', value: n.mail?.port || 465, half: 1 },
    { k: 'user', label: 'Tài khoản gửi', value: n.mail?.user, half: 1 }, { k: 'pass', label: 'Mật khẩu ứng dụng', type: 'password', value: n.mail?.pass, half: 1 }, { k: 'to', label: 'Gửi tới (nhiều địa chỉ cách nhau dấu phẩy)', value: n.mail?.to }],
    extra: '<p class="muted" style="margin:10px 0 0">Thông tin này chỉ lưu trên máy này, không đi kèm khi chia sẻ dữ liệu.</p>',
    onSave: async v => { n.tg = { token: v.tgToken, chat: v.tgChat }; n.mail = { host: v.host, port: v.port || 465, user: v.user, pass: v.pass, to: v.to }; await saveNh(); rerender(); toast('Đã lưu'); } }); };
A.bell = () => { const a = nhAlerts();
  modal('Cảnh báo', `<div class="list">${a.map(x => `<div class="li"><span class="sev ${x.k === 'bad' ? 'quahan' : 'saphan'}"></span><div class="grow"><div class="t">${esc(x.t)}</div><div class="muted">${esc(x.s)}</div></div><button class="btn sm" data-act="cv" data-id="${x.id}">Xem</button></div>`).join('') || '<div class="empty">Không có cảnh báo.</div>'}</div>`,
    `${a.length ? '<button class="btn" data-act="snooze" style="margin-right:auto">Tạm ẩn 1 giờ</button>' : ''}<button class="btn" data-go="nhacviec">Cài đặt nhắc</button><button class="btn pri" data-vf="quahan">Mở danh sách</button>`); };
A.snooze = async () => { const until = Date.now() + 36e5; await kvSet('snooze', [...(S.kv.snooze || []).filter(x => x.until > Date.now()), ...nhAlerts().map(x => ({ id: x.id, until }))]); closeModal(); rerender(); };

/* ---------- Chia sẻ & đồng bộ ---------- */
const logSync = async (loai, tep, kq) => kvSet('syncLog', [{ luc: fmtNow(), loai, tep, kq }, ...(S.kv.syncLog || [])].slice(0, 50));
A['sync-export'] = async () => {
  const ids = S.exSel.filter(id => daById(id)); if (!ids.length) return;
  const nm = `SoDuAn_${today()}_${(S.lic.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/\s+/g, '')}.sodaan`;
  const dest = await saveDlg({ defaultPath: nm, filters: [{ name: 'Dữ liệu Sổ Dự Án', extensions: ['sodaan'] }] }); if (!dest) return;
  try { const n = await api('sync_export', { dest, projects: ids }); await kvSet('lastShare', fmtNow()); await logSync('Xuất', dest.split(/[\\/]/).pop(), `${ids.length} dự án, ${n} bản ghi`); toast(`Đã xuất ${n} bản ghi`); rerender(); }
  catch (e) { toast('Lỗi xuất: ' + e); }
};
A['imp-pick'] = async () => {
  const p = await openDlg({ multiple: false, filters: [{ name: 'Dữ liệu Sổ Dự Án', extensions: ['sodaan', 'zip'] }] }); if (!p) return;
  try { const pv = await api('sync_preview', { path: String(p) });
    const picks = {}; pv.conflicts.forEach(c => { picks[c.key] = String(c.theirs.updated_at) > String(c.mine.updated_at) ? 'theirs' : 'mine'; });
    const mode = {}; (pv.manifest.projects || []).forEach(x => { if (!daById(x.id)) mode[x.id] = can('nhapGop') ? 'edit' : 'view'; });
    S.imp = { path: String(p), name: String(p).split(/[\\/]/).pop(), pv, picks, mode }; rerender(); }
  catch (e) { toast('Không đọc được tệp: ' + e); }
};
A['imp-reset'] = () => { S.imp = null; rerender(); };
A['imp-do'] = async () => {
  const imp = S.imp; const fl = new Set(S.kv.follow || []);
  imp.pv.conflicts.forEach(c => { const daId = c.theirs.data?.da || (c.coll === 'duAnList' ? c.id : ''); if (fl.has(daId)) imp.picks[c.key] = 'theirs'; });
  try { const n = await api('sync_apply', { path: imp.path, picks: imp.picks });
    Object.entries(imp.mode).forEach(([id, m]) => { if (m === 'view') fl.add(id); }); await kvSet('follow', [...fl]);
    window.dispatchEvent(new Event('sda-reload'));
    await logSync('Nhận', imp.name, `${n} bản ghi được thêm hoặc cập nhật`);
    imp.done = `Đã nhận ${n} bản ghi. Bản sao lưu trước khi nhận nằm trong thư mục dữ liệu (backups).`;
    if (S.lic && !S.lic.activated) location.reload();
  } catch (e) { toast('Lỗi nhận dữ liệu: ' + e); }
};
A.takeover = el => { const id = el.dataset.id; const a = daById(id);
  confirmBox('Chuyển sang cập nhật tiếp?', `Từ giờ bạn sửa được <b>${esc(a?.ten || '')}</b> trên máy này. Lần nhận sau, phần mềm gộp thay đổi thay vì thay thế; chỗ hai bên cùng sửa thì bạn chọn.`, 'Chuyển', async () => { await kvSet('follow', (S.kv.follow || []).filter(x => x !== id)); rerender(); toast('Đã chuyển'); }, false); };

/* ---------- Key ---------- */
A['key-new'] = () => {
  formModal({ title: 'Cấp key mới', fields: [
    { k: 'ten', label: 'Họ tên người dùng', req: 1, half: 1 }, { k: 'role', label: 'Vai trò', type: 'select', opts: [['NV', 'Nhân viên'], ['TN', 'Trưởng nhóm']], value: 'NV', half: 1 },
    { k: 'may', label: 'Mã máy của người dùng', req: 1, ph: 'XXXX-XXXX-XX', hint: 'Người dùng mở phần mềm trên máy của họ, màn hình kích hoạt hiện mã máy. Key chỉ dùng được trên máy đó.' },
    { k: 'exp', label: 'Hạn dùng', type: 'date', req: 1, value: S.lic.exp, half: 1, hint: 'Không vượt hạn key Giám đốc (' + d(S.lic.exp) + ')' }],
    ok: 'Tạo key',
    onSave: async v => {
      const may = v.may.toUpperCase().replace(/[^A-Z2-7]/g, ''); if (may.length !== 10) return 'Mã máy gồm 10 ký tự dạng XXXX-XXXX-XX';
      try { const r = await api('license_issue', { role: v.role, exp: v.exp, machine: may });
        const rec = { id: uid('K'), ten: v.ten, role: v.role, key: r.key, serial: r.serial, exp: v.exp > S.lic.exp ? S.lic.exp : v.exp, may: may.replace(/^(.{4})(.{4})(.{2})$/, '$1-$2-$3'), ngay: today(), cap: S.lic.name };
        S.keys.push(rec); await commit(); setTimeout(() => showKey(rec), 10);
      } catch (e) { return String(e); }
    } });
};
function showKey(k) {
  modal('Key của ' + k.ten, `<div class="calc"><span>Vai trò</span><b>${ROLE_NAME[k.role]}</b><span>Mã máy</span><span class="num">${esc(k.may)}</span><span>Hạn dùng</span><span class="date">${d(k.exp)}</span><span>Mã key</span><span class="num">${esc(k.serial)}</span></div>
    <div class="field"><label>Key (gửi nguyên đoạn này cho người dùng)</label><textarea class="keyarea" readonly rows="5" id="key-txt">${esc(k.key)}</textarea></div>
    <div class="note">Gửi qua Zalo, email hoặc tệp văn bản. Người dùng dán vào màn hình kích hoạt. Key chỉ kích hoạt được trên máy có mã ${esc(k.may)}.</div>`,
    `<button class="btn" data-act="key-save" data-id="${k.id}">Lưu thành tệp</button><button class="btn" data-act="copy" data-src="key-txt">Sao chép</button><button class="btn pri" data-close="1">Xong</button>`);
}
A['key-show'] = el => showKey(S.keys.find(k => k.id === el.dataset.id));
A['key-save'] = async el => { const k = S.keys.find(x => x.id === el.dataset.id); const p = await saveDlg({ defaultPath: `Key So Du An - ${k.ten}.txt`, filters: [{ name: 'Văn bản', extensions: ['txt'] }] }); if (!p) return;
  await api('save_file', { path: p, bytes: Array.from(new TextEncoder().encode(`Sổ Dự Án - key kích hoạt\nNgười dùng: ${k.ten}\nVai trò: ${ROLE_NAME[k.role]}\nMã máy: ${k.may}\nHạn: ${d(k.exp)}\n\n${k.key}\n`)) }); toast('Đã lưu'); };
A['key-rev'] = el => { const k = S.keys.find(x => x.id === el.dataset.id);
  confirmBox('Thu hồi key?', `Thu hồi key của <b>${esc(k.ten)}</b> (${ROLE_NAME[k.role]}). Máy đó sẽ tự khóa khi nhận dữ liệu chia sẻ tiếp theo có danh sách thu hồi này.`, 'Thu hồi', async () => { S.revoked.push({ id: uid('RV'), serial: k.serial, ten: k.ten, ngay: today() }); await commit('Đã thu hồi. Nhớ chia sẻ dữ liệu cho máy đó để có hiệu lực.'); }); };
A.copy = async el => { const t = document.getElementById(el.dataset.src); try { await navigator.clipboard.writeText(t.value ?? t.textContent); toast('Đã sao chép'); } catch { t.select?.(); document.execCommand('copy'); toast('Đã sao chép'); } };

/* ---------- Kích hoạt ---------- */
A.lic = () => { const l = S.lic;
  modal('Thông tin kích hoạt', `<div class="calc"><span>Người dùng</span><b>${esc(l.name)}</b><span>Vai trò</span><b>${ROLE_NAME[l.role]}</b><span>Mã key</span><span class="num">${esc(l.serial)}</span><span>Mã máy</span><span class="num" id="mcode">${esc(l.machine)}</span><span>Hạn dùng</span><span class="date">${d(l.exp)}</span></div>
    <div class="note">Đổi vai trò hoặc gia hạn: nhập key mới do Giám đốc (hoặc nhà cung cấp) cấp. Dữ liệu trên máy giữ nguyên.</div>`,
    `<button class="btn" data-act="copy" data-src="mcode">Sao chép mã máy</button><button class="btn" data-act="lic-new">Nhập key mới</button><button class="btn pri" data-close="1">Đóng</button>`); };
A['lic-new'] = () => formModal({ title: 'Nhập key mới', fields: [{ k: 'name', label: 'Họ tên', req: 1, value: S.lic.name }, { k: 'key', label: 'Key', type: 'textarea', req: 1, rows: 5 }], ok: 'Kích hoạt',
  onSave: async v => { try { S.lic = await api('license_activate', { name: v.name, key: v.key }); toast('Đã kích hoạt vai trò ' + ROLE_NAME[S.lic.role]); rerender(); } catch (e) { return String(e); } } });

/* ---------- Nhà cung cấp: cấp key Giám đốc bằng tệp khóa gốc ---------- */
export function providerModal() {
  modal('Cấp key Giám đốc (nhà cung cấp)', `<div class="note">Chỉ dùng khi có tệp khóa gốc. Tệp chỉ được đọc để ký, không lưu vào phần mềm.</div>
    <div class="field"><label>Tệp khóa gốc</label><div class="file"><span class="grow muted" id="pv-file-n">Chưa chọn</span><button class="btn sm" data-act="pv-pick">Chọn tệp</button></div></div>
    <div class="grid-f"><div class="field"><label for="pv-exp">Hạn dùng</label><input id="pv-exp" type="date" value="${addDays(today(), 365)}"></div>
    <div class="field"><label for="pv-may">Mã máy (để trống: máy bất kỳ)</label><input id="pv-may" placeholder="XXXX-XXXX-XX"></div></div>
    <div class="field" id="pv-out" hidden><label>Key Giám đốc</label><textarea class="keyarea" id="pv-key" rows="6" readonly></textarea></div>`,
    `<button class="btn" data-close="1">Đóng</button><button class="btn" data-act="copy" data-src="pv-key">Sao chép</button><button class="btn pri" data-act="pv-make">Tạo key</button>`);
}
let MASTER = null;
A['pv-pick'] = async () => { const p = await openDlg({ multiple: false, filters: [{ name: 'Khóa gốc', extensions: ['json'] }] }); if (!p) return;
  MASTER = new TextDecoder().decode(new Uint8Array(await api('read_file', { path: String(p) }))); document.getElementById('pv-file-n').textContent = String(p).split(/[\\/]/).pop(); };
A['pv-make'] = async () => { if (!MASTER) { toast('Chọn tệp khóa gốc'); return; }
  try { const key = await api('license_issue_director', { masterText: MASTER, exp: document.getElementById('pv-exp').value, machine: document.getElementById('pv-may').value.toUpperCase().replace(/[^A-Z2-7]/g, '') });
    document.getElementById('pv-key').value = key; document.getElementById('pv-out').hidden = false; } catch (e) { toast(String(e)); } };
