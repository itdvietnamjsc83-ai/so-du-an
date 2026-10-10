//! Kho dữ liệu SQLite: mỗi bản ghi lưu dạng JSON theo (bảng, id), kèm thời điểm sửa
//! để gộp dữ liệu giữa các máy theo từng bản ghi.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::Path;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let c = Connection::open(path)?;
    c.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS records(
           coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
           updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '',
           deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(coll,id));
         CREATE TABLE IF NOT EXISTS changelog(
           seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, user TEXT NOT NULL, role TEXT NOT NULL,
           coll TEXT NOT NULL, id TEXT NOT NULL, action TEXT NOT NULL, label TEXT NOT NULL DEFAULT '');
         CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;
    Ok(c)
}

pub fn now() -> String { chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string() }

#[derive(Deserialize)]
pub struct Change { pub coll: String, pub id: String, pub data: Option<Value>, #[serde(default)] pub label: String }

#[derive(Serialize, Deserialize, Clone)]
pub struct Rec { pub coll: String, pub id: String, pub data: Value, pub updated_at: String, pub updated_by: String, pub deleted: bool }

pub fn load_all(c: &Connection) -> rusqlite::Result<Value> {
    let mut st = c.prepare("SELECT coll, data FROM records WHERE deleted=0 ORDER BY coll, rowid")?;
    let mut out = Map::new();
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (coll, data) = row?;
        let v: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        out.entry(coll).or_insert_with(|| Value::Array(vec![])).as_array_mut().unwrap().push(v);
    }
    Ok(Value::Object(out))
}

pub fn apply(c: &mut Connection, changes: &[Change], user: &str, role: &str) -> rusqlite::Result<usize> {
    let tx = c.transaction()?;
    let ts = now();
    for ch in changes {
        match &ch.data {
            Some(d) => {
                let existed: bool = tx.query_row("SELECT 1 FROM records WHERE coll=?1 AND id=?2 AND deleted=0", params![ch.coll, ch.id], |_| Ok(true)).optional()?.unwrap_or(false);
                tx.execute(
                    "INSERT INTO records(coll,id,data,updated_at,updated_by,deleted) VALUES(?1,?2,?3,?4,?5,0)
                     ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, updated_by=excluded.updated_by, deleted=0",
                    params![ch.coll, ch.id, d.to_string(), ts, user],
                )?;
                tx.execute("INSERT INTO changelog(ts,user,role,coll,id,action,label) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                    params![ts, user, role, ch.coll, ch.id, if existed { "sửa" } else { "thêm" }, ch.label])?;
            }
            None => {
                tx.execute("UPDATE records SET deleted=1, updated_at=?3, updated_by=?4 WHERE coll=?1 AND id=?2", params![ch.coll, ch.id, ts, user])?;
                tx.execute("INSERT INTO changelog(ts,user,role,coll,id,action,label) VALUES(?1,?2,?3,?4,?5,'xóa',?6)",
                    params![ts, user, role, ch.coll, ch.id, ch.label])?;
            }
        }
    }
    tx.commit()?;
    Ok(changes.len())
}

pub fn all_records(c: &Connection) -> rusqlite::Result<Vec<Rec>> {
    let mut st = c.prepare("SELECT coll,id,data,updated_at,updated_by,deleted FROM records")?;
    let rows = st.query_map([], |r| Ok(Rec {
        coll: r.get(0)?, id: r.get(1)?,
        data: serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or(Value::Null),
        updated_at: r.get(3)?, updated_by: r.get(4)?, deleted: r.get::<_, i64>(5)? != 0,
    }))?;
    rows.collect()
}

pub fn get_rec(c: &Connection, coll: &str, id: &str) -> rusqlite::Result<Option<Rec>> {
    c.query_row("SELECT coll,id,data,updated_at,updated_by,deleted FROM records WHERE coll=?1 AND id=?2", params![coll, id], |r| Ok(Rec {
        coll: r.get(0)?, id: r.get(1)?,
        data: serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or(Value::Null),
        updated_at: r.get(3)?, updated_by: r.get(4)?, deleted: r.get::<_, i64>(5)? != 0,
    })).optional()
}

/// Ghi nguyên bản ghi từ máy khác (giữ thời điểm và người sửa gốc).
pub fn put_raw(c: &Connection, r: &Rec) -> rusqlite::Result<()> {
    c.execute(
        "INSERT INTO records(coll,id,data,updated_at,updated_by,deleted) VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, updated_by=excluded.updated_by, deleted=excluded.deleted",
        params![r.coll, r.id, r.data.to_string(), r.updated_at, r.updated_by, r.deleted as i64],
    )?;
    Ok(())
}

pub fn kv_get(c: &Connection, k: &str) -> rusqlite::Result<Option<String>> {
    c.query_row("SELECT value FROM kv WHERE key=?1", [k], |r| r.get(0)).optional()
}
pub fn kv_set(c: &Connection, k: &str, v: &str) -> rusqlite::Result<()> {
    c.execute("INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![k, v])?;
    Ok(())
}
pub fn kv_all(c: &Connection) -> rusqlite::Result<Value> {
    let mut st = c.prepare("SELECT key,value FROM kv WHERE key NOT LIKE 'license%'")?;
    let mut m = Map::new();
    for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (k, v) = r?;
        m.insert(k, serde_json::from_str(&v).unwrap_or(Value::String(v)));
    }
    Ok(Value::Object(m))
}

pub fn changelog(c: &Connection, limit: i64) -> rusqlite::Result<Value> {
    let mut st = c.prepare("SELECT ts,user,role,coll,id,action,label FROM changelog ORDER BY seq DESC LIMIT ?1")?;
    let rows = st.query_map([limit], |r| Ok(serde_json::json!({
        "ts": r.get::<_, String>(0)?, "user": r.get::<_, String>(1)?, "role": r.get::<_, String>(2)?,
        "coll": r.get::<_, String>(3)?, "id": r.get::<_, String>(4)?, "action": r.get::<_, String>(5)?, "label": r.get::<_, String>(6)?,
    })))?;
    Ok(Value::Array(rows.collect::<rusqlite::Result<Vec<_>>>()?))
}
