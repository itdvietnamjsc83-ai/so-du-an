# Sổ Dự Án

Phần mềm quản lý dự án chạy offline trên Windows và macOS cho đơn vị tư vấn quản lý dự án.
Dữ liệu nằm trên từng máy (SQLite); chia sẻ giữa các máy bằng tệp `.sodaan`.

## Tải bộ cài

Mỗi lần đẩy mã lên nhánh `main`, GitHub Actions build bộ cài:
- **Windows**: tệp `.exe` (NSIS), cài cho người dùng hiện tại, không cần quyền quản trị.
- **macOS**: tệp `.dmg` chạy được cả máy chip Intel và Apple.

Vào tab **Actions** → lần chạy mới nhất → mục **Artifacts** để tải. Đẩy một tag dạng `v0.1.0` thì bộ cài được đính vào một bản Release nháp.

macOS: bộ cài chưa ký bởi Apple, lần đầu mở chuột phải vào ứng dụng → **Open**. Nếu báo "bị hỏng", chạy `xattr -cr "/Applications/Sổ Dự Án.app"` trong Terminal.

## Key kích hoạt

- Bộ cài chứa một **khóa kiểm tra cố định** (`src-tauri/src/master_pub.txt`). Không bao giờ đổi tệp này: đổi là mọi key đã cấp mất hiệu lực.
- Khóa ký gốc tương ứng (tệp `master-key-*.json`) do nhà cung cấp giữ, **không đưa vào kho mã**. Dùng nó để cấp key Giám đốc:
  - trong phần mềm: màn hình kích hoạt → "Nhà cung cấp: cấp key Giám đốc", hoặc
  - dòng lệnh: `cargo run --bin sda-keygen -- director <tệp-khóa-gốc.json> <YYYY-MM-DD> [mã máy]`.
- Giám đốc cấp key Trưởng nhóm, Nhân viên trong mục **Quản lý key** (cần mã máy của người dùng, hiện ở màn hình kích hoạt).

## Phát triển

```bash
npm ci
npm run tauri dev        # chạy thử
npm run tauri build      # build bộ cài cho máy đang dùng
cargo test --manifest-path src-tauri/Cargo.toml --lib
python3 scripts/make_templates.py   # tạo lại các mẫu Word có sẵn
```

Cấu trúc: `src/` giao diện (JS thuần + Vite), `src-tauri/src/` lõi Rust (`db.rs` dữ liệu, `sync.rs` chia sẻ, `license.rs` key).
