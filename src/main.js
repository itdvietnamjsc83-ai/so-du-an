// Khởi động, màn hình kích hoạt, vẽ giao diện và xử lý sự kiện chung.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { enable as autoOn, disable as autoOff, isEnabled as autoIs } from '@tauri-apps/plugin-autostart';
import { S, $, api, esc, load, kvSet, can, ROLE_NAME, gtById, today } from './core.js';
import { toast, closeModal, runConfirm, submitForm, formDelete, pickInto, clearFile, moneyInput } from './ui.js';
import { V, renderSide, renderCrumbs, renderLic } from './views.js';
import { A, calcNT, providerModal } from './actions.js';
import './excelin.js';
import { DEV } from './developer.js';
import * as BB from './bienban.js';
import { start as startNotify } from './notify.js';

/** Quyền cần cho mỗi thao tác (kiểm tra lại ở đây, phòng khi nút còn sót trên màn hình). */
const ACTPERM = {
  'da-new': 'taoDA', 'da-edit': 'suaDA', 'gt-new': 'suaGT', 'gt-edit': 'suaGT', quet: 'themCV', 'quet-ok': 'themCV', 'cv-new': 'themCV', 'cv-save': 'themCV', 'cv-del': 'themCV', 'cv-note': 'ghiChu',
  done: 'done', 'done-ok': 'done', undo: 'done', dcsave: 'dcHan', 'tu-new': 'ghiTC', 'tu-edit': 'suaTC', 'nt-new': 'ghiTC', 'nt-edit': 'suaTC', 'tt-new': 'ghiTC', 'tt-edit': 'suaTC',
  'bh-edit': 'baoHanh', 'qt-edit': 'lapQT', 'qt-chot': 'chotQT', 'qt-mo': 'chotQT', 'ntc-new': 'nhaThau', 'ntc-edit': 'nhaThau', 'db-new': 'nhaThau', 'db-edit': 'nhaThau',
  'tv-new': 'thuVien', 'tv-edit': 'thuVien', 'dv-edit': 'caiDat', 'key-new': 'key', 'key-rev': 'key', 'sync-export': 'xuat', takeover: 'chonBan', backup: 'saoLuu', restore: 'saoLuu', 'tc-xlsx': 'bcTC',
  'bb-new': 'taoBB', 'bb-tpl': 'qlMau', 'bb-imp': 'qlMau', 'bb-menu': 'qlMau', 'bb-ren': 'qlMau', 'bb-del': 'qlMau', 'bb-restore': 'qlMau', 'bb-nhom': 'qlMau',
};
const ctxDA = () => (S.view === 'goithau' ? gtById(S.gtSel)?.da : S.view === 'duandetail' ? S.duAn : undefined);

/* ---------- vẽ ---------- */
function render() {
  if (!S.lic?.activated) return;
  renderSide(); renderCrumbs(); renderLic();
  const n = $('#bell-n'); const k = document.querySelectorAll('#side .badge')[0]?.textContent || ''; n.textContent = k; n.style.display = k ? '' : 'none';
  const sc = $('.content').scrollTop; const same = render.last === S.view + S.duAn + S.gtSel + S.tab;
  $('#view').innerHTML = (V[S.view] || V.tongquan)();
  $('.content').scrollTop = same ? sc : 0; render.last = S.view + S.duAn + S.gtSel + S.tab;
  if (S.view === 'caidat' && can('nhatKy')) loadLog();
}
async function loadLog() {
  const rows = await api('changelog', { limit: 200 }); const el = $('#clog'); if (!el) return;
  const AC = { add: 'Thêm', update: 'Sửa', delete: 'Xóa' };
  const CN = { duAnList: 'Dự án', goiThau: 'Gói thầu', congViec: 'Công việc', nghiemThu: 'Nghiệm thu', thanhToan: 'Thanh toán', nhaThau: 'Nhà thầu', danhBa: 'Đơn vị', thuVien: 'Thư viện', deXuat: 'Điều chỉnh hạn', bienBanMau: 'Mẫu biên bản', keys: 'Key', revoked: 'Thu hồi key', hop: 'Cuộc họp', caiDat: 'Cài đặt', banGiao: 'Bàn giao' };
  el.innerHTML = `<table><thead><tr><th>Thời điểm</th><th>Người</th><th>Thao tác</th><th>Mục</th><th>Nội dung</th></tr></thead><tbody>${rows.map(r => `<tr><td class="date">${esc(r.ts.replace('T', ' ').slice(0, 16))}</td><td>${esc(r.user)} <span class="muted">${esc(ROLE_NAME[r.role] || '')}</span></td><td>${AC[r.action] || esc(r.action)}</td><td>${CN[r.coll] || esc(r.coll)}</td><td>${esc(r.label)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có thay đổi.</td></tr>'}</tbody></table>`;
}
const go = v => { S.view = v; closeModal(); render(); };

/* ---------- màn hình chào: thông tin nhà phát triển ---------- */
function welcome() {
  const d = DEV, ln = (k, v) => v ? `<div class="wl-row"><span class="muted">${k}</span><span>${esc(v)}</span></div>` : '';
  return new Promise(res => {
    $('#app').hidden = true;
    $('#gate').innerHTML = `<div class="gate"><div class="act-card welcome">
      <div class="row" style="gap:10px"><div class="brand-mark" style="width:40px;height:40px;font-size:18px">S</div>
      <h1>Sổ Dự Án <span class="muted" style="font-size:13px;font-weight:400">phiên bản ${esc(S.info?.version || '')}</span></h1></div>
      ${d.logo ? `<div class="wl-logo"><img src="${d.logo}" alt="${esc(d.ten)}"></div>` : ''}
      ${d.ten ? `<div class="wl-dev"><div class="wl-cap">Nhà phát triển</div><div class="wl-name">${esc(d.ten)}</div></div>` : ''}
      ${d.gioiThieu ? `<p>${esc(d.gioiThieu)}</p>` : ''}
      <div class="wl-info">${ln('Điện thoại / Zalo', d.dienThoai)}${ln('Email', d.email)}${ln('Website', d.website)}${ln('Địa chỉ', d.diaChi)}${ln('Mã số thuế', d.mst)}</div>
      <button class="btn pri" id="wl-go" style="width:100%;justify-content:center">Bắt đầu sử dụng</button>
      ${d.banQuyen ? `<div class="muted" style="font-size:12px;text-align:center">${esc(d.banQuyen)}</div>` : ''}</div></div>`;
    const b = $('#wl-go'); b.focus();
    b.onclick = () => { $('#gate').innerHTML = ''; res(); };
  });
}

/* ---------- kích hoạt ---------- */
function gate(msg = '') {
  const l = S.lic || {};
  $('#app').hidden = true;
  $('#gate').innerHTML = `<div class="gate"><div class="act-card"><div class="brand-mark" style="width:44px;height:44px;font-size:20px">S</div>
    <h1>Kích hoạt Sổ Dự Án</h1><p class="muted">Nhập key do Giám đốc hoặc nhà cung cấp gửi cho bạn. Không cần kết nối mạng.</p>
    ${l.error ? `<div class="err">${esc(l.error)}</div>` : ''}
    <div class="field"><label>Mã máy này (gửi cho Giám đốc để được cấp key)</label><div class="row"><span class="mcode grow" id="g-mcode">${esc(l.machine || '')}</span><button class="btn sm" data-act="copy" data-src="g-mcode">Sao chép</button></div></div>
    <div class="field"><label for="g-name">Họ tên</label><input id="g-name" value="${esc(l.name || '')}" autocomplete="name"></div>
    <div class="field"><label for="g-key">Key kích hoạt</label><textarea id="g-key" class="keyarea" rows="5" placeholder="SDA-XX-....."></textarea></div>
    <div class="err" id="g-msg">${esc(msg)}</div>
    <button class="btn pri" data-act="g-ok" style="width:100%;justify-content:center">Kích hoạt</button>
    <button class="linkbtn muted" data-act="g-prov" style="font-size:12px">Nhà cung cấp: cấp key Giám đốc</button></div></div>`;
}
A['g-ok'] = async () => {
  const name = $('#g-name').value.trim(), key = $('#g-key').value.trim();
  if (!name) { $('#g-msg').textContent = 'Nhập họ tên'; return; }
  if (!key) { $('#g-msg').textContent = 'Dán key vào ô trên'; return; }
  try { S.lic = await api('license_activate', { name, key }); if (S.lic.activated) { $('#gate').innerHTML = ''; await enter(); } else $('#g-msg').textContent = S.lic.error; }
  catch (e) { $('#g-msg').textContent = String(e); }
};
A['g-prov'] = () => providerModal();

/* ---------- vào phần mềm ---------- */
async function enter() {
  await load();
  $('#app').hidden = false;
  try { await BB.seedBuiltins(); } catch (e) { console.error('seed', e); }
  if (!S.rp.sel.length) S.rp.sel = S.goiThau.map(g => g.id);
  syncAutostart();
  render();
  if (!enter.started) { enter.started = true; startNotify(); }
}
async function syncAutostart() { try { const want = !!S.nh.autostart; if ((await autoIs()) !== want) await (want ? autoOn() : autoOff()); } catch (e) { console.warn('autostart', e); } }

/* ---------- sự kiện ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-act], [data-go], [data-da], [data-gt], [data-cv], [data-close], tr.click, label');
  if (!t) return;
  if (t.dataset.close && (e.target === t || t.tagName === 'BUTTON')) { closeModal(); S.bb = null; S.tp = null; return; }
  const ds = t.dataset;
  try {
    if (ds.pickfile) return await pickInto(ds.pickfile);
    if (ds.clearfile) return clearFile(ds.clearfile);
    if (ds.go) return go(ds.go);
    if (ds.vf) { S.vf = ds.vf; return go('viec'); }
    if (ds.pf) { S.pf = ds.pf; return render(); }
    if (ds.tab) { S.tab = ds.tab; return render(); }
    if (ds.datab) { S.daTab = ds.datab; return render(); }
    if (ds.bbn) { S.bbNhom = ds.bbn; return render(); }
    if (ds.cn) { S.cnOpen = S.cnOpen === ds.cn ? null : ds.cn; return render(); }
    if (ds.rpq) { S.rp.sel = ds.rpq === 'all' ? S.goiThau.map(g => g.id) : ds.rpq === 'none' ? [] : S.goiThau.filter(g => g.da === ds.rpq).map(g => g.id); return render(); }
    const act = ds.act;
    if (act) {
      if (act === 'confirmok') return await runConfirm();
      if (act === 'formok') return await submitForm();
      if (act === 'formdel') return formDelete();
      if (act === 'vmine') { S.vMine = t.checked; return render(); }
      const need = ACTPERM[act]; if (need && !can(need, ctxDA())) { toast('Vai trò của bạn không có quyền này'); return; }
      if (A[act]) return await A[act](t);
      return await bbAct(act, t);
    }
    if (ds.cv) { closeModal(); return A.cv(t); }
    if (ds.gt) { const g = gtById(ds.gt); if (!g) return; S.gtSel = g.id; S.duAn = g.da; S.tab = ds.tabgo || 'congviec'; S.pf = ds.pfgo || 'all'; return go('goithau'); }
    if (ds.da) { S.duAn = ds.da; S.daTab = 'tiendo'; return go('duandetail'); }
  } catch (err) { console.error(err); toast('Lỗi: ' + (err?.message || err)); }
});
async function bbAct(act, t) {
  const id = t.dataset.id, i = +t.dataset.i;
  switch (act) {
    case 'bb-new': return BB.bbNew(id);
    case 'bb-ok': return BB.bbOk();
    case 'bb-addp': S.bb.extra.push({ ten: '', cv: '', dv: '' }); return BB.bbModal();
    case 'bb-addf': S.bb.fields.push({ k: '', v: '' }); return BB.bbModal();
    case 'bb-delx': S.bb[t.dataset.kind].splice(i, 1); return BB.bbModal();
    case 'bb-dl': return BB.bbDownload(id);
    case 'bb-dlv': return BB.bbDownload(id, S.bienBanMau.find(b => b.id === id).ls[i].file);
    case 'bb-menu': return BB.bbMenu(id);
    case 'bb-ren': return BB.bbRename(id);
    case 'bb-nhom': return BB.bbSetNhom(id);
    case 'bb-del': return BB.bbDelete(id);
    case 'bb-restore': return BB.bbRestore(id, i);
    case 'bb-imp': return BB.bbImport();
    case 'bb-impok': return BB.bbImportOk();
    case 'bb-tpl': return BB.tpStart();
    case 'tp-radd': S.tp.rieng.push(''); return BB.tpModal();
    case 'tp-rdel': S.tp.rieng.splice(i, 1); return BB.tpModal();
    case 'tp-dl': return BB.tpDownload();
    case 'tp-back': S.tp.step = Math.max(1, S.tp.step - 1); S.tp.file = null; return BB.tpModal();
    case 'tp-next': S.tp.step = 3; return BB.tpModal();
    case 'tp-load': return BB.tpLoad();
    case 'tp-ok': return BB.tpOk();
  }
}
document.addEventListener('change', async e => {
  const t = e.target, ds = t.dataset;
  if (BB.bbChange(t)) return;
  if (ds.tpf) { S.tp.chon[ds.tpf] = t.checked; return; }
  if (t.id === 'tp-tu') { S.tp.ten = $('#tp-ten').value; S.tp.nhom = $('#tp-nh').value; S.tp.tu = t.value; return BB.tpModal(); }
  if (ds.allof) { document.querySelectorAll(`[data-${ds.allof}]`).forEach(x => x.checked = t.checked); return; }
  if (ds.nh) { S.nh[ds.nh] = t.checked ? 1 : 0; await kvSet('nh', S.nh); if (ds.nh === 'autostart') syncAutostart(); return render(); }
  if (ds.nhv) { S.nh[ds.nhv] = t.value; await kvSet('nh', S.nh); return; }
  if (ds.nr) { const [i, f] = ds.nr.split(','); const r = S.nh.rules[+i]; r[f] = f === 'on' ? (t.checked ? 1 : 0) : f === 'truoc' ? Math.max(0, +t.value || 0) : t.value; if (f === 'su') { r.dv = r.su === 'hop' ? 'giờ' : 'ngày'; } await kvSet('nh', S.nh); return render(); }
  if (ds.nk) { const [i, k] = ds.nk.split(','); S.nh.rules[+i].kenh[k] = t.checked ? 1 : 0; await kvSet('nh', S.nh); return render(); }
  if (ds.rp) { S.rp[ds.rp] = t.value; await kvSet('rp', S.rp); return render(); }
  if (ds.rpb) { S.rp[ds.rpb] = t.checked; await kvSet('rp', S.rp); return render(); }
  if (ds.rpv) { S.rp[ds.rpv] = t.value; return render(); }
  if (ds.rpc) { S.rp.cols[ds.rpc] = t.checked ? 1 : 0; return render(); }
  if (t.id === 'rp-loc') { S.rp.loc = t.value; return render(); }
  if (ds.rpgt) { S.rp.sel = t.checked ? [...new Set([...S.rp.sel, ds.rpgt])] : S.rp.sel.filter(x => x !== ds.rpgt); return render(); }
  if (ds.rpda) { const ids = S.goiThau.filter(g => g.da === ds.rpda).map(g => g.id); S.rp.sel = t.checked ? [...new Set([...S.rp.sel, ...ids])] : S.rp.sel.filter(x => !ids.includes(x)); return render(); }
  if (ds.exda) { S.exSel = t.checked ? [...new Set([...S.exSel, ds.exda])] : S.exSel.filter(x => x !== ds.exda); return render(); }
  if (ds.immode) { S.imp.mode[ds.immode] = t.value; return; }
  if (ds.cf) { S.imp.picks[ds.cf] = t.value; return; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (BB.bbInput(t)) return;
  if (t.dataset.tpr !== undefined) { S.tp.rieng[+t.dataset.tpr] = t.value.replace(/[^A-Za-z0-9]/g, ''); t.nextElementSibling.textContent = '{' + (S.tp.rieng[+t.dataset.tpr] || '...') + '}'; return; }
  if (t.id === 'tp-ten') { S.tp.ten = t.value; return; }
  if (t.id === 'tp-nh') { S.tp.nhom = t.value; return; }
  if (t.dataset.money) { moneyInput(t); if (t.id === 'f-gtri') calcNT(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal-root').innerHTML) { closeModal(); S.bb = null; S.tp = null; }
  if (e.key === 'Enter' && e.target.matches('#modal-root .fgrid input')) { e.preventDefault(); submitForm(); }
});
window.addEventListener('sda-render', render);
window.addEventListener('sda-notified', () => { if (S.view === 'nhacviec') render(); });
window.addEventListener('sda-reload', async () => { S.lic = (await api('app_info')).license; if (!S.lic.activated) { location.reload(); return; } await load(); render(); });
window.addEventListener('sda-error', e => toast('Không lưu được: ' + e.detail, 5000));
// Ngày mới (để máy chạy qua đêm): vẽ lại cho đúng hạn còn lại.
let day = today(); setInterval(() => { if (today() !== day) { day = today(); render(); } }, 60000);

/* ---------- khởi động ---------- */
(async () => {
  try {
    S.info = await api('app_info'); S.lic = S.info.license;
    await welcome();
    if (S.lic.activated) await enter(); else gate();
  } catch (e) { document.body.innerHTML = `<pre style="padding:20px;white-space:pre-wrap">Không khởi động được: ${esc(String(e))}</pre>`; }
})();
