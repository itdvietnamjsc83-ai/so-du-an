//! Sao lưu toàn bộ dữ liệu ra một tệp .sdabak (zip): manifest.json + so-du-an.db + files/,
//! và khôi phục lại từ tệp đó. Key kích hoạt của máy đang dùng được giữ nguyên khi khôi phục.
use crate::db;
use rusqlite::{Connection, DatabaseName};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::Path;

type R<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }

/// Chụp CSDL đang mở ra một tệp riêng (nhất quán, kể cả khi đang WAL).
pub fn snapshot_db(c: &Connection, dest: &Path) -> R<()> {
    let _ = std::fs::remove_file(dest);
    c.execute("VACUUM INTO ?1", [dest.to_string_lossy()]).map_err(e)?;
    Ok(())
}

fn count_projects(c: &Connection) -> i64 {
    c.query_row("SELECT COUNT(*) FROM records WHERE coll='duAnList' AND deleted=0", [], |r| r.get(0)).unwrap_or(0)
}

/// Ghi tệp sao lưu đầy đủ (dữ liệu + tệp đính kèm) tới `dest`.
pub fn save(c: &Connection, dir: &Path, dest: &Path, by: &str) -> R<usize> {
    let tmp = dir.join("backup-tmp.db");
    snapshot_db(c, &tmp)?;
    let db_bytes = std::fs::read(&tmp).map_err(e);
    let _ = std::fs::remove_file(&tmp);
    let db_bytes = db_bytes?;
    let files: Vec<_> = std::fs::read_dir(dir.join("files")).map(|it| it.flatten().filter(|x| x.path().is_file()).collect()).unwrap_or_default();
    let manifest = json!({"app": "so-du-an", "kind": "backup", "format": 1, "at": db::now(), "by": by,
        "version": env!("CARGO_PKG_VERSION"), "projects": count_projects(c), "files": files.len()});
    let out = std::fs::File::create(dest).map_err(|x| format!("Không ghi được tệp: {x}"))?;
    let mut z = zip::ZipWriter::new(out);
    let opt = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    z.start_file("manifest.json", opt).map_err(e)?;
    z.write_all(manifest.to_string().as_bytes()).map_err(e)?;
    z.start_file("so-du-an.db", opt).map_err(e)?;
    z.write_all(&db_bytes).map_err(e)?;
    for f in &files {
        if let Ok(b) = std::fs::read(f.path()) {
            z.start_file(format!("files/{}", f.file_name().to_string_lossy()), opt).map_err(e)?;
            z.write_all(&b).map_err(e)?;
        }
    }
    z.finish().map_err(e)?;
    Ok(files.len())
}

#[derive(Serialize)]
pub struct Info { pub at: String, pub by: String, pub version: String, pub projects: i64, pub files: i64 }

fn open_zip(path: &Path) -> R<zip::ZipArchive<std::fs::File>> {
    let f = std::fs::File::open(path).map_err(|x| format!("Không mở được tệp: {x}"))?;
    zip::ZipArchive::new(f).map_err(|_| "Tệp không phải bản sao lưu Sổ Dự Án".to_string())
}

pub fn info(path: &Path) -> R<Info> {
    let mut z = open_zip(path)?;
    let mut s = String::new();
    z.by_name("manifest.json").map_err(|_| "Tệp không phải bản sao lưu Sổ Dự Án".to_string())?.read_to_string(&mut s).map_err(e)?;
    let m: Value = serde_json::from_str(&s).map_err(|_| "Bản sao lưu bị hỏng".to_string())?;
    if m["app"] != "so-du-an" || m["kind"] != "backup" {
        return Err("Đây không phải tệp sao lưu (.sdabak). Tệp .sodaan thì nhận ở mục Chia sẻ & đồng bộ.".into());
    }
    z.by_name("so-du-an.db").map_err(|_| "Bản sao lưu thiếu dữ liệu".to_string())?;
    let st = |k: &str| m[k].as_str().unwrap_or("").to_string();
    Ok(Info { at: st("at"), by: st("by"), version: st("version"), projects: m["projects"].as_i64().unwrap_or(0), files: m["files"].as_i64().unwrap_or(0) })
}

/// Thay toàn bộ dữ liệu bằng bản sao lưu. Trước đó tự sao lưu bản hiện tại vào thư mục backups.
pub fn restore(c: &mut Connection, dir: &Path, path: &Path) -> R<()> {
    info(path)?;
    let mut z = open_zip(path)?;
    let tmp = dir.join("restore-tmp.db");
    {
        let mut b = vec![];
        z.by_name("so-du-an.db").map_err(e)?.read_to_end(&mut b).map_err(e)?;
        std::fs::write(&tmp, b).map_err(e)?;
    }
    let check = Connection::open(&tmp).and_then(|t| t.query_row("SELECT COUNT(*) FROM records", [], |r| r.get::<_, i64>(0)));
    if check.is_err() { let _ = std::fs::remove_file(&tmp); return Err("Bản sao lưu bị hỏng, không đọc được dữ liệu".into()); }
    let license = db::kv_get(c, "license").map_err(e)?;
    let res = c.restore(DatabaseName::Main, &tmp, None::<fn(rusqlite::backup::Progress)>).map_err(|x| format!("Khôi phục lỗi: {x}"));
    let _ = std::fs::remove_file(&tmp);
    res?;
    match license {
        Some(l) => db::kv_set(c, "license", &l).map_err(e)?,
        None => { c.execute("DELETE FROM kv WHERE key='license'", []).map_err(e)?; }
    }
    let fdir = dir.join("files");
    std::fs::create_dir_all(&fdir).map_err(e)?;
    for i in 0..z.len() {
        let mut f = z.by_index(i).map_err(e)?;
        let name = f.name().to_string();
        if let Some(n) = name.strip_prefix("files/") {
            if n.is_empty() || n.contains('/') || n.contains('\\') || n.contains("..") { continue; }
            let mut b = vec![];
            f.read_to_end(&mut b).map_err(e)?;
            std::fs::write(fdir.join(n), b).map_err(e)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sao_luu_va_khoi_phuc() {
        let dir = std::env::temp_dir().join(format!("sda-bk-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(dir.join("files")).unwrap();
        std::fs::write(dir.join("files/a.txt"), b"tep").unwrap();
        let mut c = db::open(&dir.join("so-du-an.db")).unwrap();
        db::kv_set(&c, "license", "KEY-CU").unwrap();
        c.execute("INSERT INTO records(coll,id,data,updated_at) VALUES('duAnList','D1','{\"ten\":\"A\"}','x')", []).unwrap();
        let bk = dir.join("bk.sdabak");
        save(&c, &dir, &bk, "Dũng").unwrap();
        assert_eq!(info(&bk).unwrap().projects, 1);
        // sau khi sao lưu: thêm dự án, đổi key, xóa tệp
        c.execute("INSERT INTO records(coll,id,data,updated_at) VALUES('duAnList','D2','{}','x')", []).unwrap();
        db::kv_set(&c, "license", "KEY-MOI").unwrap();
        std::fs::remove_file(dir.join("files/a.txt")).unwrap();
        restore(&mut c, &dir, &bk).unwrap();
        assert_eq!(count_projects(&c), 1);
        assert_eq!(db::kv_get(&c, "license").unwrap().as_deref(), Some("KEY-MOI"));
        assert_eq!(std::fs::read(dir.join("files/a.txt")).unwrap(), b"tep");
        assert!(info(&dir.join("so-du-an.db")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
