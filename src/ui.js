// Giao diện dùng chung: biểu tượng, hộp thoại, biểu mẫu, thông báo nhỏ.
import { $, esc, num, api } from './core.js';
import { open as pickFile } from '@tauri-apps/plugin-dialog';

export const I = {
  home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  folder:'<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  task:'<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="2"/>',
  stamp:'<path d="M12 3a3 3 0 0 0-3 3c0 2 2 3 2 6H7a2 2 0 0 0-2 2v2h14v-2a2 2 0 0 0-2-2h-4c0-3 2-4 2-6a3 3 0 0 0-3-3zM5 20h14"/>',
  report:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 17v-3M12 17v-6M15 17v-4"/>',
  doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 15h7M9 18h4"/>',
  money:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  build:'<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  book:'<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  sync:'<path d="M20 11a8 8 0 0 0-14-5l-2 2M4 13a8 8 0 0 0 14 5l2-2"/><path d="M4 4v4h4M20 20v-4h-4"/>'
};
export const ic = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

I.gear = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';
I.log = '<path d="M4 6h16M4 12h16M4 18h10"/>';

export const pillTT = tt => ({ 'Hoàn thành': 'good', 'Đã xong': 'good', 'Đã trả đủ': 'good', 'Đang hoạt động': 'good', 'Đã áp dụng': 'good', 'Đang dùng': 'good',
  'Quá hạn': 'bad', 'Đã thu hồi': 'bad', 'Tạm dừng': 'warn', 'Trả một phần': 'warn', 'Chưa trả': 'warn', 'Chưa kích hoạt': 'warn', 'Chuẩn bị': 'info', 'Lưu trữ': '' }[tt] ?? 'info');
export const pill = (tt, cls) => `<span class="pill ${cls ?? pillTT(tt)}">${esc(tt)}</span>`;

export function toast(msg, ms = 2800) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }

export function modal(title, body, foot, cls = '') {
  $('#modal-root').innerHTML = `<div class="overlay" data-close="1"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="x" data-close="1" aria-label="Đóng">×</button></div><div class="modal-b">${body}</div><div class="modal-f">${foot}</div></div></div>`;
  const f = $('#modal-root input:not([type=hidden]):not([readonly]), #modal-root select, #modal-root textarea'); if (f) setTimeout(() => f.focus(), 30);
}
export const closeModal = () => { $('#modal-root').innerHTML = ''; FORM = null; };

export function confirmBox(title, html, okLabel, onOk, danger = true) {
  modal(title, `<div class="note">${html}</div>`, `<button class="btn" data-close="1">Không</button><button class="btn pri ${danger ? 'danger' : ''}" data-act="confirmok">${esc(okLabel)}</button>`);
  CONFIRM = onOk;
}
export let CONFIRM = null;
export function runConfirm() { const f = CONFIRM; CONFIRM = null; closeModal(); if (f) return f(); }

/* ---------- biểu mẫu chung ---------- */
let FORM = null;
const fmtMoney = v => v ? Number(v).toLocaleString('vi-VN') : '';
function fieldHtml(f) {
  const id = 'f-' + f.k, v = f.value ?? '', req = f.req ? ' <b style="color:var(--bad)">*</b>' : '';
  const lab = `<label for="${id}">${esc(f.label)}${req}</label>`;
  const hint = f.hint ? `<span class="muted" style="font-size:12px">${f.hint}</span>` : '';
  let input;
  switch (f.type) {
    case 'select': input = `<select id="${id}">${(f.opts || []).map(o => { const [val, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`; break;
    case 'textarea': input = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`; break;
    case 'money': input = `<input id="${id}" inputmode="numeric" data-money="1" value="${fmtMoney(v)}" placeholder="0">`; break;
    case 'percent': input = `<input id="${id}" type="number" step="0.1" min="0" max="100" value="${v === '' ? '' : Math.round(v * 1000) / 10}">`; break;
    case 'check': return `<label class="rp-l ${f.half ? '' : 'full'}"><input type="checkbox" class="check" id="${id}" ${v ? 'checked' : ''}>${esc(f.label)}</label>`;
    case 'file': input = `<div class="file"><span class="grow muted" id="${id}-n">${v ? esc(String(v).replace(/^files\/[^-]+-/, '')) : 'Chưa chọn tệp'}</span><input type="hidden" id="${id}" value="${esc(v)}"><button type="button" class="btn sm" data-pickfile="${f.k}">Chọn tệp</button>${v ? `<button type="button" class="btn sm" data-clearfile="${f.k}">Bỏ</button>` : ''}</div>`; break;
    case 'people': input = `<textarea id="${id}" rows="${f.rows || 4}" placeholder="Mỗi dòng một người: Họ tên | Chức vụ&#10;Ví dụ: Ông Nguyễn Văn A | Giám đốc">${esc((v || []).map(p => p.ten + (p.cv ? ' | ' + p.cv : '')).join('\n'))}</textarea>`; break;
    case 'checks': input = `<div class="checks" id="${id}">${(f.opts || []).map(([val, l]) => `<label class="rp-l"><input type="checkbox" class="check" value="${esc(val)}" ${(v || []).includes(val) ? 'checked' : ''}>${esc(l)}</label>`).join('') || '<span class="muted">Chưa có mục nào.</span>'}</div>`; break;
    case 'list': input = `<input id="${id}" list="${id}-dl" value="${esc(v)}" placeholder="${esc(f.ph || '')}"><datalist id="${id}-dl">${(f.opts || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>`; break;
    default: input = `<input id="${id}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" ${f.type === 'number' ? 'step="any"' : ''}>`;
  }
  return `<div class="field ${f.half ? '' : 'full'}">${lab}${input}${hint}</div>`;
}
export function formModal({ title, fields, ok = 'Lưu', onSave, extra = '', danger = null, cls = '' }) {
  const html = `<div class="fgrid">${fields.map(fieldHtml).join('')}</div>${extra}`;
  const del = danger ? `<button class="btn ghost-bad" style="margin-right:auto" data-act="formdel">${esc(danger.label)}</button>` : '';
  modal(title, html, `${del}<button class="btn" data-close="1">Hủy</button><button class="btn pri" data-act="formok">${esc(ok)}</button>`, cls);
  FORM = { fields, onSave, danger };
}
export function readForm() {
  const v = {};
  FORM.fields.forEach(f => { const el = document.getElementById('f-' + f.k); if (!el) return;
    if (f.type === 'people') { v[f.k] = el.value.split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [ten, ...cv] = x.split('|'); return { ten: ten.trim(), cv: cv.join('|').trim() }; }); return; }
    if (f.type === 'checks') { v[f.k] = [...el.querySelectorAll('input:checked')].map(x => x.value); return; }
    v[f.k] = f.type === 'check' ? el.checked : f.type === 'money' ? num(el.value) : f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : f.type === 'percent' ? (Number(el.value) || 0) / 100 : el.value.trim(); });
  return v;
}
export async function submitForm() {
  if (!FORM) return;
  const v = readForm();
  const miss = FORM.fields.find(f => f.req && (v[f.k] === '' || v[f.k] === null || v[f.k] === undefined || (Array.isArray(v[f.k]) && !v[f.k].length)));
  if (miss) { toast('Chưa nhập: ' + miss.label); document.getElementById('f-' + miss.k)?.focus(); return; }
  const r = await FORM.onSave(v);
  if (typeof r === 'string') { toast(r); return; }
  if (r !== false) closeModal();
}
export function formDelete() { if (FORM?.danger) { const f = FORM.danger.onDelete; closeModal(); f(); } }

export async function pickInto(k) {
  const p = await pickFile({ multiple: false });
  if (!p) return;
  const name = String(p).split(/[\\/]/).pop();
  const rel = await api('file_store', { src: String(p), name, bytes: null });
  document.getElementById('f-' + k).value = rel;
  document.getElementById('f-' + k + '-n').textContent = name;
}
export function clearFile(k) { document.getElementById('f-' + k).value = ''; document.getElementById('f-' + k + '-n').textContent = 'Chưa chọn tệp'; }

/** Định dạng số tiền ngay khi gõ. */
export function moneyInput(el) { const v = el.value.replace(/\D/g, ''); el.value = v ? Number(v).toLocaleString('vi-VN') : ''; }
