// Sổ Dự Án trên điện thoại: chỉ xem. Dữ liệu lấy từ tệp .sodaan xuất trên máy tính.
import './style.css';
import { S, esc, d, today } from '../../src/core.js';
import { loadLocal, readPackage, diff, apply, clearAll, getFile, M } from './data.js';
import { R, m, tongquan, duan, goi, viec, cv, taichinh, them, SUB, devCard, dataLine } from './views.js';
import { ic, chip, empty } from './ui.js';

const app = document.getElementById('app');
const native = () => !!window.Capacitor?.isNativePlatform?.();
const mq = window.matchMedia('(min-width: 600px)');
const U = { pkg: null, diff: null, err: '', done: false, busy: false, rp: '' };

/* ---------- Cập nhật dữ liệu ---------- */
const fmtAt = s => { if (!s) return ''; const x = new Date(s); return isNaN(x) ? s : x.toTimeString().slice(0, 5) + ' ' + x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
SUB.capnhat = inSplit => {
  const n = (c, f = () => true) => S[c].filter(f).length;
  const cur = M.meta ? `<section class="card"><div class="row sb"><h2 class="h2">Dữ liệu đang xem</h2><span class="mut">${fmtAt(M.meta.at)}</span></div><div class="mut">Do ${esc(M.meta.by || 'không rõ')} gửi · tệp ${esc(M.meta.file || '')}</div>
    <div class="kg3"><div><b>${n('duAnList')}</b><span>dự án</span></div><div><b>${n('goiThau')}</b><span>gói thầu</span></div><div><b>${n('congViec')}</b><span>công việc</span></div></div></section>` : '';
  let mid = '';
  if (U.done) mid += `<section class="card okc"><b>Đã cập nhật xong</b><div>Dữ liệu đã thay bằng bản do ${esc(M.meta?.by || '')} gửi lúc ${fmtAt(M.meta?.at)}.</div><a class="btn pri" href="#/tongquan">Xem tổng quan</a></section>`;
  if (U.err) mid += `<section class="card errc"><b>Không mở được tệp</b><div>${esc(U.err)}</div></section>`;
  if (U.pkg) { const p = U.pkg.manifest, x = U.diff;
    mid += `<section class="card selc"><h2 class="h2">Tệp mới: ${esc(U.pkg.name)}</h2><div class="mut">Xuất lúc ${fmtAt(p.exported_at)}, do ${esc(p.by || 'không rõ')} · ${(p.projects || []).length} dự án: ${(p.projects || []).map(a => esc(a.ten)).join(', ')}</div>
      <div>${x.first ? 'Đây là lần nhập đầu tiên trên điện thoại này.' : `So với dữ liệu đang xem: <b>${x.doiTT} việc</b> đổi trạng thái, <b>${x.doiHan} việc</b> đổi hạn, <b>${x.cvMoi} việc</b> mới, <b>${x.daMoi} dự án</b> mới. Các dự án có trong tệp sẽ được thay bằng dữ liệu mới.`}</div>
      <button class="btn pri" data-act="apply" ${U.busy ? 'disabled' : ''}>${U.busy ? 'Đang cập nhật…' : 'Cập nhật'}</button><button class="btn" data-act="cancel">Để sau</button></section>`; }
  else mid += `<label class="btn pri big-btn">Chọn tệp .sodaan<input type="file" id="pick" hidden></label>`;
  const steps = `<section class="card"><h2 class="h2">Cách lấy tệp mới</h2><div class="step"><span class="no">1</span><span>Trên máy tính, mở Sổ Dự Án, vào <b>Chia sẻ &amp; đồng bộ</b>, bấm <b>Xuất dữ liệu</b>.</span></div><div class="step"><span class="no">2</span><span>Gửi tệp .sodaan sang điện thoại qua Zalo, email hoặc Google Drive, rồi lưu tệp vào máy.</span></div><div class="step"><span class="no">3</span><span>${native() ? 'Bấm vào tệp và chọn mở bằng Sổ Dự Án, hoặc bấm <b>Chọn tệp .sodaan</b> ở trên.' : 'Bấm <b>Chọn tệp .sodaan</b> ở trên và chọn tệp vừa lưu.'}</span></div></section>`;
  const hist = M.hist.length ? `<section class="card"><h2 class="h2">Các lần cập nhật</h2>${M.hist.map(h => `<div class="row sb" style="font-size:13px"><span>${fmtAt(h.at)}</span><span class="mut">${esc(h.by || '')}</span></div>`).join('')}</section>` : '';
  const clr = M.meta ? `<button class="linkbtn danger" data-act="clear">Xóa dữ liệu trên điện thoại</button>` : '';
  return `<header class="top">${inSplit ? '' : `<a class="back" href="#/them">${ic('back', 20)}Thêm</a>`}<h1>Cập nhật dữ liệu</h1></header><div class="body">${mid}${cur}${steps}${hist}${clr}</div>`;
};
async function takeFile(file) {
  U.err = ''; U.done = false; U.pkg = null;
  try { U.pkg = await readPackage(file); U.diff = await diff(U.pkg); } catch (e) { U.err = e.message || String(e); }
  location.hash = '#/them/capnhat'; render();
}

/* ---------- Báo cáo ---------- */
SUB.baocao = inSplit => {
  const r = S.rp; const das = S.duAnList.filter(a => !a.luuTru);
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${r[k] === v ? 'on' : ''}" data-rp="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const tree = das.map(a => { const gts = S.goiThau.filter(g => g.da === a.id); if (!gts.length) return ''; const all = gts.every(g => r.sel.includes(g.id));
    return `<div class="rp-da"><label class="rp-l"><input type="checkbox" data-rpda="${a.id}" ${all ? 'checked' : ''}><b>${esc(a.ten)}</b></label>${gts.map(g => `<label class="rp-l rp-gt"><input type="checkbox" data-rpgt="${g.id}" ${r.sel.includes(g.id) ? 'checked' : ''}>${esc(g.ma)} · ${esc(g.ten)}</label>`).join('')}</div>`; }).join('');
  const form = `<section class="card"><h2 class="h2">Loại báo cáo</h2>${seg('loai', [['tiendo', 'Tiến độ'], ['taichinh', 'Tài chính'], ['tonghop', 'Tổng hợp']])}
    ${r.loai !== 'taichinh' ? `<h2 class="h2">Mức chi tiết</h2>${seg('ct', [['tonghop', 'Tổng hợp'], ['chitiet', 'Từng công việc']])}${r.ct === 'chitiet' ? seg('loc', [['all', 'Mọi việc'], ['mo', 'Chưa xong'], ['quahan', 'Quá hạn'], ['tre', 'Trễ, lùi hạn']]) : ''}` : ''}
    <h2 class="h2">Kỳ báo cáo (không bắt buộc)</h2><div class="row"><input type="date" class="inp" data-rpd="tu" value="${r.tu}"><span>–</span><input type="date" class="inp" data-rpd="den" value="${r.den}"></div>
    <div class="row sb"><h2 class="h2">Phạm vi (${r.sel.length} gói thầu)</h2><button class="linkbtn" data-act="rp-all">${r.sel.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}</button></div><div class="rp-tree">${tree || empty('Chưa có gói thầu.')}</div>
    <div class="row"><button class="btn pri grow" data-act="rp-pdf" ${r.sel.length ? '' : 'disabled'}>Tạo báo cáo PDF</button><button class="btn grow" data-act="rp-xlsx" ${r.sel.length ? '' : 'disabled'}>Tạo Excel</button></div></section>`;
  const prev = `<h2 class="h2">Xem trước</h2><div class="hscroll" id="rp-prev">${U.rp || '<div class="empty">Đang dựng báo cáo…</div>'}</div>`;
  const body = R.wide ? `<div class="cols2 rpw"><div class="col">${form}</div><div class="col">${prev}</div></div>` : form + prev;
  return `<header class="top">${inSplit ? '' : `<a class="back" href="#/them">${ic('back', 20)}Thêm</a>`}<h1>Báo cáo</h1><div class="mut">Báo cáo giống bản máy tính, lưu thành PDF hoặc Excel để gửi đi</div></header><div class="body">${body}</div>`;
};
let report;
const loadReport = async () => report || (report = await import('../../src/report.js'));
async function fillPreview() {
  const el = document.getElementById('rp-prev'); if (!el) return;
  const { rpPreview, rpScope } = await loadReport();
  U.rp = S.rp.sel.length ? rpPreview(rpScope()) : '<div class="empty">Chọn ít nhất một gói thầu.</div>';
  const e2 = document.getElementById('rp-prev'); if (e2) e2.innerHTML = U.rp;
}
const rpName = ext => `BaoCao_${{ tiendo: 'TienDo', taichinh: 'TaiChinh', tonghop: 'TongHop' }[S.rp.loai]}_${today().split('-').reverse().join('-')}.${ext}`;
async function makePdf() {
  const { rpPreview, rpScope } = await loadReport();
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const box = document.createElement('div'); box.className = 'pdf-box'; box.innerHTML = rpPreview(rpScope()); document.body.appendChild(box);
  try {
    const paper = box.querySelector('.paper'); const cvs = await html2canvas(paper, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); const W = 297, H = 210, mg = 8; const pw = W - 2 * mg, ph = H - 2 * mg;
    const pxPerMm = cvs.width / pw; const pagePx = Math.floor(ph * pxPerMm);
    for (let y = 0, i = 0; y < cvs.height; y += pagePx, i++) {
      const h = Math.min(pagePx, cvs.height - y); const c = document.createElement('canvas'); c.width = cvs.width; c.height = h; c.getContext('2d').drawImage(cvs, 0, y, cvs.width, h, 0, 0, cvs.width, h);
      if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', mg, mg, pw, h / pxPerMm);
    }
    return pdf.output('blob');
  } finally { box.remove(); }
}

/* ---------- Lưu / chia sẻ / mở tệp ---------- */
const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', doc: 'application/msword', xls: 'application/vnd.ms-excel' };
const mimeOf = n => MIME[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const b64 = blob => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
async function shareBlob(blob, name) {
  blob = new Blob([blob], { type: mimeOf(name) });
  if (native()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem'); const { Share } = await import('@capacitor/share');
    const w = await Filesystem.writeFile({ path: name, data: await b64(blob), directory: Directory.Cache });
    await Share.share({ title: name, files: [w.uri] }).catch(() => {}); return;
  }
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const urls = new Map();
async function fileUrl(path) { if (urls.has(path)) return urls.get(path); const b = await getFile(path); if (!b) return null; const u = URL.createObjectURL(new Blob([b], { type: mimeOf(path) })); urls.set(path, u); return u; }
async function openFile(path) {
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(path)) { const u = await fileUrl(path); if (!u) return toast('Tệp không có trong dữ liệu đã nhận'); viewer(`<img src="${u}" alt="">`); return; }
  const b = await getFile(path); if (!b) return toast('Tệp không có trong dữ liệu đã nhận');
  await shareBlob(b, path.split('/').pop());
}
function viewer(inner) {
  const v = document.createElement('div'); v.className = 'viewer'; v.innerHTML = `<button class="vclose" aria-label="Đóng">${ic('close', 26)}</button>${inner}`;
  v.addEventListener('click', () => v.remove()); document.body.appendChild(v);
}
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 2600); }
async function busy(label, fn) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = label; document.body.appendChild(e); try { await fn(); } catch (x) { toast('Lỗi: ' + (x.message || x)); } finally { e.remove(); } }

/* ---------- Khung, điều hướng ---------- */
const NAV = [['tongquan', 'home', 'Tổng quan'], ['duan', 'folder', 'Dự án'], ['viec', 'task', 'Công việc'], ['taichinh', 'money', 'Tài chính'], ['them', 'more', 'Thêm']];
const navKey = () => ({ goi: 'duan', cv: 'viec' }[R.route[0]] || R.route[0]);
const PAGES = { tongquan, duan, goi, viec, cv, taichinh, them };
let lastKey = '';
function render() {
  R.wide = mq.matches; const h = location.hash.replace(/^#\/?/, ''); R.route = h ? h.split('/').map(decodeURIComponent) : ['tongquan'];
  if (!PAGES[R.route[0]]) R.route = ['tongquan'];
  const key = R.route.join('/') + (R.wide ? '|w' : ''); const keep = key === lastKey;
  const sc = keep ? [...app.querySelectorAll('.body,.side')].map(e => e.scrollTop) : [];
  const nk = navKey(); const items = NAV.map(([k, i, l]) => `<a class="${k === nk ? 'on' : ''}" href="#/${k}">${ic(i)}<span>${l}</span></a>`).join('');
  app.className = 'app ' + (R.wide ? 'wide' : 'phone');
  app.innerHTML = (R.wide ? `<nav class="rail"><div class="logo lg2">S</div>${items}</nav>` : '') + `<main class="scr">${PAGES[R.route[0]]()}</main>` + (R.wide ? '' : `<nav class="nav">${items}</nav>`);
  if (keep) app.querySelectorAll('.body,.side').forEach((e, i) => { e.scrollTop = sc[i] || 0; });
  lastKey = key;
  app.querySelector('.tabs a.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  app.querySelectorAll('img[data-src]').forEach(async img => { const u = await fileUrl(img.dataset.src); if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), { className: 'mut', textContent: 'Ảnh không có trong dữ liệu đã nhận' })); });
  if (R.route[0] === 'them' && (R.route[1] === 'baocao') && !U.rp) fillPreview();
}
window.addEventListener('hashchange', () => { U.rp = ''; if (!location.hash.includes('capnhat')) { U.done = false; U.err = ''; } render(); });
mq.addEventListener?.('change', render);

app.addEventListener('click', async e => {
  const t = e.target.closest('[data-open],[data-act],[data-daf],[data-pf],[data-cn],[data-ntseg],[data-rp],[data-open-grp]'); if (!t) return;
  const ds = t.dataset;
  if (ds.open !== undefined) { e.preventDefault(); return openFile(ds.open); }
  if (ds.daf) { m.daf = ds.daf; return render(); }
  if (ds.pf) { m.pf = ds.pf; return render(); }
  if (ds.cn) { m.cnOpen = m.cnOpen === ds.cn ? null : ds.cn; return render(); }
  if (ds.ntseg) { m.ntSeg = ds.ntseg; return render(); }
  if (ds.openGrp) { m.open.add(ds.openGrp); return render(); }
  if (ds.rp) { S.rp[ds.rp] = ds.v; U.rp = ''; return render(); }
  const A = {
    apply: async () => { U.busy = true; render(); try { await apply(U.pkg); U.pkg = null; U.done = true; defaultSel(); } catch (x) { U.err = x.message || String(x); } U.busy = false; render(); },
    cancel: () => { U.pkg = null; render(); },
    clear: async () => { if (!confirm('Xóa toàn bộ dữ liệu đã nhận trên điện thoại này?')) return; await clearAll(); U.done = false; render(); },
    'tc-xlsx': () => busy('Đang tạo Excel…', async () => { const { buildFinanceXlsx } = await loadReport(); await shareBlob(await buildFinanceXlsx(), `TaiChinh_${today().split('-').reverse().join('-')}.xlsx`); }),
    'rp-all': () => { S.rp.sel = S.rp.sel.length ? [] : S.goiThau.filter(g => !S.duAnList.find(a => a.id === g.da)?.luuTru).map(g => g.id); U.rp = ''; render(); },
    'rp-pdf': () => busy('Đang tạo PDF…', async () => shareBlob(await makePdf(), rpName('pdf'))),
    'rp-xlsx': () => busy('Đang tạo Excel…', async () => { const { buildXlsx, rpScope } = await loadReport(); await shareBlob(await buildXlsx(rpScope()), rpName('xlsx')); }),
  };
  if (A[ds.act]) A[ds.act]();
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'pick' && t.files[0]) return takeFile(t.files[0]);
  if (t.dataset.mine !== undefined) { m.mine = t.checked; return render(); }
  if (t.dataset.rpda) { const ids = S.goiThau.filter(g => g.da === t.dataset.rpda).map(g => g.id); S.rp.sel = t.checked ? [...new Set([...S.rp.sel, ...ids])] : S.rp.sel.filter(x => !ids.includes(x)); U.rp = ''; return render(); }
  if (t.dataset.rpgt) { const id = t.dataset.rpgt; S.rp.sel = t.checked ? [...S.rp.sel, id] : S.rp.sel.filter(x => x !== id); U.rp = ''; return render(); }
  if (t.dataset.rpd) { S.rp[t.dataset.rpd] = t.value; U.rp = ''; return render(); }
});
app.addEventListener('input', e => { if (e.target.id === 'q') { m.q = e.target.value; const pos = e.target.selectionStart; render(); const q = document.getElementById('q'); q?.focus(); q?.setSelectionRange(pos, pos); } });
const defaultSel = () => { S.rp.sel = S.goiThau.filter(g => !S.duAnList.find(a => a.id === g.da)?.luuTru).map(g => g.id); S.rp.ky = true; S.rp.sheet = true; };

/* ---------- Màn hình chào, khởi động ---------- */
function welcome() {
  return new Promise(ok => {
    app.className = 'app welcome-app';
    app.innerHTML = `<div class="welcome"><div class="row" style="gap:10px;justify-content:center"><div class="logo lg2">S</div><div><b style="font-size:20px">Sổ Dự Án</b><div class="mut">Bản điện thoại · phiên bản ${__APP_VERSION__}</div></div></div>${devCard()}<button class="btn pri big-btn" id="wl-go">Bắt đầu sử dụng</button></div>`;
    document.getElementById('wl-go').onclick = ok;
  });
}
async function nativeHooks() {
  if (!native()) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', () => { if (location.hash && !/^#\/?(tongquan)?$/.test(location.hash)) history.back(); else App.exitApp(); });
  const open = async url => { if (!url) return;
    try { const { Filesystem } = await import('@capacitor/filesystem'); const r = await Filesystem.readFile({ path: url }); const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
      await takeFile({ name: decodeURIComponent(url.split('/').pop() || 'du-lieu.sodaan'), arrayBuffer: async () => bin.buffer }); } catch (e) { U.err = 'Không đọc được tệp: ' + (e.message || e); location.hash = '#/them/capnhat'; render(); } };
  App.addListener('appUrlOpen', ev => open(ev.url));
  const l = await App.getLaunchUrl(); if (l?.url) setTimeout(() => open(l.url), 0);
}
(async () => {
  const has = await loadLocal(); defaultSel();
  await welcome();
  if (!has && !location.hash) location.hash = '#/them/capnhat';
  render(); nativeHooks();
  if (!native() && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
