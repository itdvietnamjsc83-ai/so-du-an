//! Công cụ của nhà cung cấp: tạo khóa gốc (một lần) và cấp key Giám đốc.
//!   sda-keygen init <tệp-khóa-gốc.json>
//!   sda-keygen director <tệp-khóa-gốc.json> <hạn YYYY-MM-DD> [mã máy]
//!   sda-keygen check <key>
use so_du_an_lib::license;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let r = match a.get(1).map(|s| s.as_str()) {
        Some("init") if a.len() == 3 => {
            let p = std::path::Path::new(&a[2]);
            if p.exists() { Err("Tệp đã có, không ghi đè khóa gốc".to_string()) } else {
                let (sk, pk) = license::new_master();
                let txt = serde_json::json!({"note": "KHÓA KÝ GỐC SỔ DỰ ÁN - giữ bí mật, sao lưu 2 nơi", "secret": sk, "public": pk}).to_string();
                std::fs::write(p, txt).map(|_| format!("Đã tạo {}\nKhóa kiểm tra (đưa vào src-tauri/src/master_pub.txt):\n{pk}", a[2])).map_err(|e| e.to_string())
            }
        }
        Some("director") if a.len() >= 4 => {
            std::fs::read_to_string(&a[2]).map_err(|e| e.to_string())
                .and_then(|t| license::read_master_file(&t))
                .and_then(|sk| license::issue_director(&sk, &a[3], a.get(4).map(|s| s.as_str()).unwrap_or("")))
        }
        Some("check") if a.len() >= 3 => {
            license::verify(&a[2..].join("")).map(|(i, _)| format!("{i:?}"))
        }
        _ => Err("Cách dùng:\n  sda-keygen init <khoa-goc.json>\n  sda-keygen director <khoa-goc.json> <YYYY-MM-DD> [mã máy]\n  sda-keygen check <key>".into()),
    };
    match r { Ok(s) => println!("{s}"), Err(e) => { eprintln!("Lỗi: {e}"); std::process::exit(1) } }
}
