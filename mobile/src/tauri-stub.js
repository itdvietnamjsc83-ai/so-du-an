// Bản điện thoại không chạy trong Tauri: core.js chỉ dùng invoke cho lưu dữ liệu trên máy tính.
export const invoke = () => Promise.reject(new Error('Không dùng trên điện thoại'));
