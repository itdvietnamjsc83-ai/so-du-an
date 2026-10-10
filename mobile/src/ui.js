// Mảnh giao diện dùng chung cho bản điện thoại.
import { esc, days, d, cat } from '../../src/core.js';

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  task: '<path d="M10 6h11M10 12h11M10 18h11M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  build: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};
export const ic = (k, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || ''}</svg>`;
export const chip = (t, cls = 'gray') => `<span class="chip ${cls}">${esc(t)}</span>`;
export const ddmm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';

/** Nhãn hạn của một công việc, như bản máy tính nhưng gọn. */
export function hanChip(c) {
  if (c.tt === 'Hoàn thành') { const n = c.xong && c.goc ? Math.round((new Date(c.xong) - new Date(c.goc)) / 864e5) : 0; return n > 0 ? chip('Xong trễ ' + n + ' ngày', 'warn') : chip('Xong ' + ddmm(c.xong), 'ok'); }
  const n = days(c.hh);
  if (n < 0) return chip('Trễ ' + (-n) + ' ngày', 'bad');
  if (n <= 3) return chip(n === 0 ? 'Đến hạn hôm nay' : 'Còn ' + n + ' ngày', 'warn');
  if (c.tt === 'Chưa làm') return chip('Chưa làm', 'gray');
  return chip('Còn ' + n + ' ngày', 'info');
}
export const ttCls = t => ({ 'Đã trả đủ': 'ok', 'Quá hạn': 'bad', 'Trả một phần': 'warn', 'Chưa trả': 'gray', 'Hoàn thành': 'ok', 'Đang làm': 'info', 'Đang hoạt động': 'info', 'Tạm dừng': 'warn', 'Đã đóng': 'gray' }[t] || 'gray');

const SEG = [['xong', 'Đã xong'], ['danglam', 'Đang làm'], ['chuabd', 'Chưa làm'], ['saphan', 'Sắp đến hạn'], ['quahan', 'Quá hạn']];
export function stack(cv) {
  return `<div class="stack" role="img" aria-label="${SEG.map(([k, l]) => l + ' ' + cv.filter(c => cat(c) === k).length).join(', ')}">${SEG.map(([k]) => { const v = cv.filter(c => cat(c) === k).length; return v ? `<i class="${k}" style="flex:${v}"></i>` : ''; }).join('')}</div>`;
}
export const legend = () => `<div class="lg">${SEG.map(([k, l]) => `<span><i class="${k}"></i>${l}</span>`).join('')}</div>`;
export const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
/** Dòng nhãn – giá trị. */
export const kvRow = (k, v, cls = '') => `<div class="kvr ${cls}"><span>${k}</span><b>${v}</b></div>`;
export const fileBtn = (f, lab = 'Mở tệp') => f ? `<button class="btn sm" data-open="${esc(f)}">${ic('file', 16)}${lab}</button>` : '';
export const empty = t => `<div class="empty">${t}</div>`;
export { d };
