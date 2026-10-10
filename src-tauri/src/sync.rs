//! Chia sẻ dữ liệu giữa các máy bằng tệp .sodaan (zip): manifest.json + data.json + files/.
//! Gộp theo từng bản ghi; bản ghi bị sửa ở cả hai phía từ lần trao đổi trước là xung đột.
use crate::db::{self, Rec};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const GLOBAL: &[&str] = &["nhaThau", "thuVien", "revoked", "danhBa"];

pub fn ensure(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch("CREATE TABLE IF NOT EXISTS sync_base(coll TEXT, id TEXT, updated_at TEXT, PRIMARY KEY(coll,id));")
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str { v.get(k).and_then(|x| x.as_str()).unwrap_or("") }

/// Chọn các bản ghi thuộc các dự án được chia sẻ (cả bản ghi đã xóa để lan truyền việc xóa).
pub fn select(all: &[Rec], projects: &HashSet<String>) -> Vec<Rec> {
    let gts: HashSet<String> = all.iter().filter(|r| r.coll == "goiThau" && projects.contains(s(&r.data, "da"))).map(|r| r.id.clone()).collect();
    let nts: HashSet<String> = all.iter().filter(|r| r.coll == "nghiemThu" && gts.contains(s(&r.data, "gt"))).map(|r| r.id.clone()).collect();
    all.iter().filter(|r| {
        GLOBAL.contains(&r.coll.as_str())
            || (r.coll == "duAnList" && projects.contains(&r.id))
            || projects.contains(s(&r.data, "da"))
            || gts.contains(s(&r.data, "gt"))
            || nts.contains(s(&r.data, "nt"))
    }).cloned().collect()
}

fn collect_files(v: &Value, out: &mut HashSet<String>) {
    match v {
        Value::String(x) if x.starts_with("files/") => { out.insert(x.clone()); }
        Value::Array(a) => a.iter().for_each(|x| collect_files(x, out)),
        Value::Object(o) => o.values().for_each(|x| collect_files(x, out)),
        _ => {}
    }
}

pub fn export(c: &Connection, data_dir: &Path, dest: &Path, projects: &[String], manifest_extra: Value) -> Result<usize, String> {
    ensure(c).map_err(|e| e.to_string())?;
    let all = db::all_records(c).map_err(|e| e.to_string())?;
    let set: HashSet<String> = projects.iter().cloned().collect();
    let recs = select(&all, &set);
    let mut files = HashSet::new();
    recs.iter().filter(|r| !r.deleted).for_each(|r| collect_files(&r.data, &mut files));
    let f = std::fs::File::create(dest).map_err(|e| format!("Không tạo được tệp: {e}"))?;
    let mut z = zip::ZipWriter::new(f);
    let opt = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let ten: Vec<Value> = recs.iter().filter(|r| r.coll == "duAnList" && !r.deleted).map(|r| json!({"id": r.id, "ten": s(&r.data, "ten")})).collect();
    let mut manifest = json!({"app": "so-du-an", "format": 1, "exported_at": db::now(), "projects": ten, "records": recs.len(), "files": files.len()});
    if let (Some(m), Some(e)) = (manifest.as_object_mut(), manifest_extra.as_object()) { for (k, v) in e { m.insert(k.clone(), v.clone()); } }
    z.start_file("manifest.json", opt).map_err(|e| e.to_string())?;
    z.write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes()).map_err(|e| e.to_string())?;
    z.start_file("data.json", opt).map_err(|e| e.to_string())?;
    z.write_all(serde_json::to_string(&recs).unwrap().as_bytes()).map_err(|e| e.to_string())?;
    for rel in &files {
        let p = data_dir.join(rel);
        if let Ok(bytes) = std::fs::read(&p) {
            z.start_file(rel, opt).map_err(|e| e.to_string())?;
            z.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    z.finish().map_err(|e| e.to_string())?;
    for r in &recs {
        c.execute("INSERT INTO sync_base(coll,id,updated_at) VALUES(?1,?2,?3) ON CONFLICT(coll,id) DO UPDATE SET updated_at=excluded.updated_at", params![r.coll, r.id, r.updated_at]).map_err(|e| e.to_string())?;
    }
    Ok(recs.len())
}

pub struct Package { pub manifest: Value, pub recs: Vec<Rec>, pub files: HashMap<String, Vec<u8>> }

pub fn read_package(path: &Path) -> Result<Package, String> {
    let f = std::fs::File::open(path).map_err(|e| format!("Không mở được tệp: {e}"))?;
    let mut z = zip::ZipArchive::new(f).map_err(|_| "Tệp không phải gói dữ liệu Sổ Dự Án".to_string())?;
    let mut read = |name: &str| -> Result<String, String> {
        let mut e = z.by_name(name).map_err(|_| format!("Gói dữ liệu thiếu {name}"))?;
        let mut s = String::new();
        e.read_to_string(&mut s).map_err(|e| e.to_string())?;
        Ok(s)
    };
    let manifest: Value = serde_json::from_str(&read("manifest.json")?).map_err(|_| "manifest.json hỏng".to_string())?;
    if manifest["app"] != "so-du-an" { return Err("Tệp không phải gói dữ liệu Sổ Dự Án".into()); }
    let recs: Vec<Rec> = serde_json::from_str(&read("data.json")?).map_err(|_| "data.json hỏng".to_string())?;
    let mut files = HashMap::new();
    for i in 0..z.len() {
        let mut e = z.by_index(i).map_err(|e| e.to_string())?;
        let name = e.name().to_string();
        if name.starts_with("files/") && !name.contains("..") {
            let mut b = vec![];
            e.read_to_end(&mut b).map_err(|e| e.to_string())?;
            files.insert(name, b);
        }
    }
    Ok(Package { manifest, recs, files })
}

#[derive(Serialize)]
pub struct Conflict { pub key: String, pub coll: String, pub id: String, pub label: String, pub mine: Value, pub theirs: Value }

#[derive(Serialize)]
pub struct Preview { pub manifest: Value, pub add: usize, pub update: usize, pub same: usize, pub keep: usize, pub delete: usize, pub conflicts: Vec<Conflict> }

enum Act { Add, Update, Same, Keep, Conflict }

fn decide(c: &Connection, inc: &Rec) -> rusqlite::Result<(Act, Option<Rec>)> {
    let local = db::get_rec(c, &inc.coll, &inc.id)?;
    let Some(l) = local else { return Ok((Act::Add, None)) };
    if l.updated_at == inc.updated_at { return Ok((Act::Same, Some(l))); }
    let base: Option<String> = c.query_row("SELECT updated_at FROM sync_base WHERE coll=?1 AND id=?2", params![inc.coll, inc.id], |r| r.get(0)).optional()?;
    let local_changed = base.as_deref() != Some(l.updated_at.as_str());
    let inc_changed = base.as_deref() != Some(inc.updated_at.as_str());
    let act = match (local_changed, inc_changed) {
        (false, true) => Act::Update,
        (true, false) => Act::Keep,
        _ if l.data == inc.data && l.deleted == inc.deleted => Act::Same,
        (true, true) if base.is_some() => Act::Conflict,
        _ => if inc.updated_at > l.updated_at { Act::Update } else { Act::Keep },
    };
    Ok((act, Some(l)))
}

fn label(r: &Rec) -> String {
    for k in ["ten", "ma", "lyDo", "ct"] { if let Some(x) = r.data.get(k).and_then(|v| v.as_str()) { return x.to_string(); } }
    r.id.clone()
}

pub fn preview(c: &Connection, path: &Path) -> Result<Preview, String> {
    ensure(c).map_err(|e| e.to_string())?;
    let p = read_package(path)?;
    let mut pv = Preview { manifest: p.manifest.clone(), add: 0, update: 0, same: 0, keep: 0, delete: 0, conflicts: vec![] };
    for r in &p.recs {
        let (a, l) = decide(c, r).map_err(|e| e.to_string())?;
        match a {
            Act::Add => if !r.deleted { pv.add += 1 },
            Act::Update => if r.deleted { pv.delete += 1 } else { pv.update += 1 },
            Act::Same => pv.same += 1,
            Act::Keep => pv.keep += 1,
            Act::Conflict => {
                let l = l.unwrap();
                pv.conflicts.push(Conflict {
                    key: format!("{}/{}", r.coll, r.id), coll: r.coll.clone(), id: r.id.clone(), label: label(r),
                    mine: json!({"updated_at": l.updated_at, "updated_by": l.updated_by, "deleted": l.deleted, "data": l.data}),
                    theirs: json!({"updated_at": r.updated_at, "updated_by": r.updated_by, "deleted": r.deleted, "data": r.data}),
                });
            }
        }
    }
    Ok(pv)
}

pub fn apply(c: &mut Connection, data_dir: &Path, path: &Path, picks: &HashMap<String, String>) -> Result<usize, String> {
    ensure(c).map_err(|e| e.to_string())?;
    let p = read_package(path)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let mut n = 0;
    for r in &p.recs {
        let (a, _) = decide(&tx, r).map_err(|e| e.to_string())?;
        let take = match a {
            Act::Add | Act::Update => true,
            Act::Conflict => picks.get(&format!("{}/{}", r.coll, r.id)).map(|x| x == "theirs").unwrap_or(false),
            _ => false,
        };
        if take { db::put_raw(&tx, r).map_err(|e| e.to_string())?; n += 1; }
        tx.execute("INSERT INTO sync_base(coll,id,updated_at) VALUES(?1,?2,?3) ON CONFLICT(coll,id) DO UPDATE SET updated_at=excluded.updated_at", params![r.coll, r.id, r.updated_at]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    for (rel, bytes) in &p.files {
        let dest: PathBuf = data_dir.join(rel);
        if let Some(parent) = dest.parent() { let _ = std::fs::create_dir_all(parent); }
        if !dest.exists() { std::fs::write(&dest, bytes).map_err(|e| e.to_string())?; }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, Change};

    fn put(c: &mut Connection, coll: &str, id: &str, data: Value) {
        db::apply(c, &[Change { coll: coll.into(), id: id.into(), data: Some(data), label: String::new() }], "t", "GD").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
    }

    #[test]
    fn gop_va_xung_dot() {
        let dir = std::env::temp_dir().join(format!("sda-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut a = db::open(&dir.join("a.db")).unwrap();
        let mut b = db::open(&dir.join("b.db")).unwrap();
        put(&mut a, "duAnList", "DA1", json!({"ten": "Dự án 1"}));
        put(&mut a, "goiThau", "G1", json!({"da": "DA1", "ma": "XL"}));
        put(&mut a, "congViec", "C1", json!({"gt": "G1", "ten": "Việc", "tt": "Chưa làm"}));
        put(&mut a, "duAnList", "DA2", json!({"ten": "Không chia sẻ"}));
        let pkg = dir.join("x.sodaan");
        assert_eq!(export(&a, &dir, &pkg, &["DA1".into()], json!({})).unwrap(), 3);

        // Máy B nhận lần đầu: thêm mới 3 bản ghi, không lấy DA2.
        let pv = preview(&b, &pkg).unwrap();
        assert_eq!((pv.add, pv.conflicts.len()), (3, 0));
        apply(&mut b, &dir, &pkg, &HashMap::new()).unwrap();
        assert!(db::get_rec(&b, "duAnList", "DA2").unwrap().is_none());

        // Hai bên cùng sửa C1 → xung đột; B sửa thêm G1 → A nhận cập nhật.
        put(&mut a, "congViec", "C1", json!({"gt": "G1", "ten": "Việc", "tt": "Đang làm"}));
        put(&mut b, "congViec", "C1", json!({"gt": "G1", "ten": "Việc", "tt": "Hoàn thành"}));
        put(&mut b, "goiThau", "G1", json!({"da": "DA1", "ma": "XL-01"}));
        let pkg2 = dir.join("y.sodaan");
        export(&b, &dir, &pkg2, &["DA1".into()], json!({})).unwrap();
        let pv = preview(&a, &pkg2).unwrap();
        assert_eq!(pv.update, 1);
        assert_eq!(pv.conflicts.len(), 1);
        assert_eq!(pv.conflicts[0].key, "congViec/C1");

        // Không chọn thì giữ bản của máy; chọn "theirs" thì lấy bản nhận.
        let mut picks = HashMap::new();
        picks.insert("congViec/C1".to_string(), "theirs".to_string());
        apply(&mut a, &dir, &pkg2, &picks).unwrap();
        assert_eq!(db::get_rec(&a, "congViec", "C1").unwrap().unwrap().data["tt"], "Hoàn thành");
        assert_eq!(db::get_rec(&a, "goiThau", "G1").unwrap().unwrap().data["ma"], "XL-01");

        // Nhận lại cùng tệp: không còn gì mới.
        let pv = preview(&a, &pkg2).unwrap();
        assert_eq!((pv.add, pv.update, pv.conflicts.len()), (0, 0, 0));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
