//! Thư mục tài liệu trong thư mục dùng chung: <gốc>/2_DuLieu/<Dự án>/<Mã gói>_HD-<số HĐ>/<mục>/.
//! Máy Giám đốc tự tạo, đổi tên thư mục theo dữ liệu và chép tệp đính kèm vào đúng chỗ.
//! Phần mềm không bao giờ xóa tệp trong thư mục này: gói bị xóa thì chuyển vào _ThungRac.
use crate::db;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

type R<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }

pub const SUBS: &[(&str, &str)] = &[
    ("00_HopDong-PhuLuc", "Hợp đồng, phụ lục"),
    ("TU_TamUng", "Tạm ứng"),
    ("NT_NghiemThu", "Nghiệm thu"),
    ("TT_ThanhToan", "Thanh toán"),
    ("BBH_BienBanHop", "Biên bản họp"),
    ("CV_CongVan", "Công văn"),
    ("TD_TienDo", "Ảnh, tệp tiến độ công việc"),
    ("BH-QT_BaoHanh-QuyetToan", "Bảo hành, quyết toán"),
    ("BG_BanGiao", "Bàn giao"),
    ("KH_Khac", "Khác"),
];
pub const INBOX: &str = "_ChuaPhanLoai";

pub fn ensure(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch("CREATE TABLE IF NOT EXISTS pub(rel TEXT PRIMARY KEY, dest TEXT NOT NULL, at TEXT NOT NULL);")
}

/// Bỏ dấu tiếng Việt, giữ chữ số, thay khoảng trắng bằng gạch dưới. Dùng làm tên thư mục.
pub fn slug(s: &str) -> String {
    const FROM: &str = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
    const TO: &str = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";
    let from: Vec<char> = FROM.chars().collect();
    let to: Vec<char> = TO.chars().collect();
    let mut out = String::new();
    for ch in s.trim().chars() {
        let low: char = ch.to_lowercase().next().unwrap_or(ch);
        let m = from.iter().position(|x| *x == low).map(|i| to[i]);
        let c2 = match m { Some(x) => if ch.is_uppercase() { x.to_ascii_uppercase() } else { x }, None => ch };
        if c2.is_ascii_alphanumeric() || c2 == '-' || c2 == '.' { out.push(c2); } else if !out.ends_with('_') && !out.is_empty() { out.push('_'); }
    }
    let t: String = out.trim_matches('_').chars().take(60).collect();
    if t.is_empty() { "_".into() } else { t }
}

fn s(v: &Value, k: &str) -> String { v.get(k).map(|x| match x { Value::String(s) => s.clone(), Value::Null => String::new(), _ => x.to_string() }).unwrap_or_default() }

fn alive(c: &Connection) -> R<BTreeMap<(String, String), Value>> {
    Ok(db::all_records(c).map_err(e)?.into_iter().filter(|r| !r.deleted).map(|r| ((r.coll, r.id), r.data)).collect())
}

/// Đường dẫn tương đối thư mục của một gói thầu.
pub fn gt_rel(recs: &BTreeMap<(String, String), Value>, gt: &str) -> Option<String> {
    let g = recs.get(&("goiThau".into(), gt.into()))?;
    let da = recs.get(&("duAnList".into(), s(g, "da"))).map(|a| s(a, "ten")).unwrap_or_else(|| "Chua_ro_du_an".into());
    let ma = if s(g, "ma").is_empty() { s(g, "ten") } else { s(g, "ma") };
    let hd = s(g, "hd");
    Some(format!("2_DuLieu/{}/{}{}", slug(&da), slug(&ma), if hd.is_empty() { String::new() } else { format!("_HD-{}", slug(&hd)) }))
}

fn walk_files(v: &Value, path: &str, out: &mut Vec<(String, String)>) {
    match v {
        Value::String(x) if x.starts_with("files/") && !x.contains("..") => out.push((path.to_string(), x.clone())),
        Value::Array(a) => a.iter().for_each(|x| walk_files(x, path, out)),
        Value::Object(o) => o.iter().for_each(|(k, x)| walk_files(x, if path.is_empty() { k } else { path }, out)),
        _ => {}
    }
}

pub fn nice_name(rel: &str) -> String {
    let base = rel.rsplit('/').next().unwrap_or(rel);
    match base.split_once('-') { Some((pre, rest)) if pre.len() == 8 && !rest.is_empty() => rest.to_string(), _ => base.to_string() }
}

/// Thư mục con và gói thầu của một tệp đính kèm.
fn place(recs: &BTreeMap<(String, String), Value>, coll: &str, d: &Value, field: &str) -> Option<(String, String)> {
    let gt_of = |k: &str| s(d, k);
    let (gt, sub) = match coll {
        "goiThau" => (s(d, "id"), match field { "tamUng" => "TU_TamUng".to_string(), "bh" | "qt" => "BH-QT_BaoHanh-QuyetToan".into(), _ => "00_HopDong-PhuLuc".into() }),
        "nghiemThu" => (gt_of("gt"), format!("NT_NghiemThu/Dot{}_{}", s(d, "dot"), s(d, "ngay"))),
        "thanhToan" => { let nt = recs.get(&("nghiemThu".into(), s(d, "nt")))?; (s(nt, "gt"), "TT_ThanhToan".into()) }
        "hop" => (gt_of("gt"), "BBH_BienBanHop".into()),
        "banGiao" => (gt_of("gt"), "BG_BanGiao".into()),
        "congViec" => (gt_of("gt"), "TD_TienDo".into()),
        "deXuat" => (gt_of("gt"), "CV_CongVan".into()),
        "taiLieu" => (gt_of("gt"), { let m = s(d, "muc"); if SUBS.iter().any(|(k, _)| *k == m) { m } else { "KH_Khac".into() } }),
        _ => return None,
    };
    if gt.is_empty() { None } else { Some((gt, sub)) }
}

fn free_name(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() { return p; }
    let (stem, ext) = match name.rsplit_once('.') { Some((a, b)) => (a.to_string(), format!(".{b}")), None => (name.to_string(), String::new()) };
    for i in 2..1000 { let q = dir.join(format!("{stem} ({i}){ext}")); if !q.exists() { return q; } }
    p
}

/// Cập nhật cây thư mục và chép tệp mới. Chỉ chạy trên máy Giám đốc. Trả số tệp mới chép.
pub fn publish(c: &Connection, root: &Path, data_dir: &Path) -> R<usize> {
    let recs = alive(c)?;
    let mut map: Map<String, Value> = db::kv_get(c, "docs_map").ok().flatten().and_then(|x| serde_json::from_str(&x).ok()).unwrap_or_default();
    let mut live = HashSet::new();
    for ((coll, id), _) in recs.iter().filter(|((c, _), _)| c == "goiThau") {
        let _ = coll;
        let Some(want) = gt_rel(&recs, id) else { continue };
        live.insert(id.clone());
        let old = map.get(id).and_then(|v| v.as_str()).map(String::from);
        if let Some(old) = old.filter(|o| *o != want) {
            let (po, pn) = (root.join(&old), root.join(&want));
            if po.is_dir() && !pn.exists() {
                if let Some(p) = pn.parent() { let _ = std::fs::create_dir_all(p); }
                if std::fs::rename(&po, &pn).is_ok() {
                    c.execute("UPDATE pub SET dest = ?2 || substr(dest, length(?1) + 1) WHERE dest LIKE ?1 || '/%'", params![old, want]).map_err(e)?;
                }
            }
        }
        let base = root.join(&want);
        for (sub, _) in SUBS { std::fs::create_dir_all(base.join(sub)).map_err(|x| format!("Không tạo được thư mục tài liệu: {x}"))?; }
        map.insert(id.clone(), Value::String(want));
    }
    // Gói đã xóa: chuyển thư mục vào thùng rác (không xóa tệp).
    let gone: Vec<String> = map.keys().filter(|k| !live.contains(*k)).cloned().collect();
    for id in gone {
        if let Some(old) = map.remove(&id).and_then(|v| v.as_str().map(String::from)) {
            let po = root.join(&old);
            if po.is_dir() {
                let trash = root.join("2_DuLieu/_ThungRac");
                let _ = std::fs::create_dir_all(&trash);
                let name = format!("{}_{}", old.rsplit('/').next().unwrap_or("goi"), chrono::Local::now().format("%Y%m%d-%H%M"));
                let _ = std::fs::rename(&po, free_name(&trash, &name));
            }
        }
    }
    db::kv_set(c, "docs_map", &Value::Object(map.clone()).to_string()).map_err(e)?;
    let _ = std::fs::create_dir_all(root.join("2_DuLieu").join(INBOX));
    // Chép tệp đính kèm chưa có trong thư mục tài liệu.
    let mut n = 0;
    for ((coll, _), d) in &recs {
        let mut fl = vec![];
        walk_files(d, "", &mut fl);
        for (field, rel) in fl {
            let done: Option<String> = c.query_row("SELECT dest FROM pub WHERE rel=?1", [&rel], |r| r.get(0)).optional().map_err(e)?;
            if done.is_some() { continue; }
            let Some((gt, sub)) = place(&recs, coll, d, &field) else { continue };
            let Some(base) = map.get(&gt).and_then(|v| v.as_str()) else { continue };
            let src = data_dir.join(&rel);
            if !src.exists() { continue; }
            let dir = root.join(base).join(&sub);
            let _ = std::fs::create_dir_all(&dir);
            let dest = free_name(&dir, &nice_name(&rel));
            if std::fs::copy(&src, &dest).is_ok() {
                let rd = dest.strip_prefix(root).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
                c.execute("INSERT OR REPLACE INTO pub(rel,dest,at) VALUES(?1,?2,?3)", params![rel, rd, db::now()]).map_err(e)?;
                n += 1;
            }
        }
    }
    Ok(n)
}

fn list_dir(base: &Path, dir: &Path, out: &mut Vec<Value>, depth: u32) {
    let Ok(it) = std::fs::read_dir(dir) else { return };
    for x in it.flatten() {
        let p = x.path();
        let name = x.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.ends_with(".tmp") || name == "desktop.ini" { continue; }
        if p.is_dir() { if depth < 4 { list_dir(base, &p, out, depth + 1); } continue; }
        let md = x.metadata().ok();
        let rel = p.strip_prefix(base).map(|q| q.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        let sub = rel.rsplit_once('/').map(|(a, _)| a.to_string()).unwrap_or_default();
        out.push(json!({"name": name, "sub": sub, "path": p.to_string_lossy(), "size": md.as_ref().map(|m| m.len()).unwrap_or(0),
            "mtime": md.and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default()}));
    }
}

/// Tệp trong thư mục của một gói (kể cả tệp người dùng tự chép vào).
pub fn list_gt(c: &Connection, root: &Path, gt: &str) -> R<Value> {
    let recs = alive(c)?;
    let rel = gt_rel(&recs, gt).ok_or("Không thấy gói thầu")?;
    let base = root.join(&rel);
    let mut out = vec![];
    list_dir(&base, &base, &mut out, 0);
    out.sort_by(|a, b| s(a, "sub").cmp(&s(b, "sub")).then(s(a, "name").cmp(&s(b, "name"))));
    Ok(json!({"dir": base.to_string_lossy(), "exists": base.is_dir(), "files": out, "subs": SUBS.iter().map(|(k, l)| json!([k, l])).collect::<Vec<_>>()}))
}

/// Tệp chờ phân loại (người dùng chép bản quét vào _ChuaPhanLoai để quét bằng AI).
pub fn list_inbox(root: &Path) -> Value {
    let base = root.join("2_DuLieu").join(INBOX);
    let _ = std::fs::create_dir_all(&base);
    let mut out = vec![];
    if let Ok(it) = std::fs::read_dir(&base) {
        for x in it.flatten() {
            let p = x.path();
            let name = x.file_name().to_string_lossy().to_string();
            if p.is_dir() || name.starts_with('.') || name.ends_with(".tmp") || name == "desktop.ini" { continue; }
            let md = x.metadata().ok();
            out.push(json!({"name": name, "path": p.to_string_lossy(), "size": md.as_ref().map(|m| m.len()).unwrap_or(0),
                "mtime": md.and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default()}));
        }
    }
    json!({"dir": base.to_string_lossy(), "files": out})
}

/// Sau khi đã nhập: chuyển tệp khỏi hộp chờ vào _ChuaPhanLoai/_DaNhap (không xóa).
pub fn inbox_done(root: &Path, path: &str) -> R<()> {
    let base = root.join("2_DuLieu").join(INBOX);
    let p = PathBuf::from(path);
    if p.parent() != Some(base.as_path()) { return Ok(()); }
    let done = base.join("_DaNhap");
    std::fs::create_dir_all(&done).map_err(e)?;
    let dest = free_name(&done, &p.file_name().unwrap().to_string_lossy());
    std::fs::rename(&p, dest).map_err(e)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ten_thu_muc_khong_dau() {
        assert_eq!(slug("Trường THCS Đống Đa"), "Truong_THCS_Dong_Da");
        assert_eq!(slug("  XL-01 / gói 2 "), "XL-01_goi_2");
        assert_eq!(nice_name("files/ab12cd34-Bien ban.pdf"), "Bien ban.pdf");
    }
}
