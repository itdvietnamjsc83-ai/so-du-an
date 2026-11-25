//! Đồng bộ nhiều máy qua một thư mục dùng chung (Google Drive, OneDrive, ổ mạng).
//!
//! Không dùng chung một tệp CSDL. Mỗi máy giữ CSDL riêng và ghi các "gói thay đổi" chỉ thêm,
//! đã mã hóa và ký, vào thư mục riêng của máy mình:
//!   <gốc>/1_DongBo/nhom.json            nhận diện nhóm, Giám đốc ký
//!   <gốc>/1_DongBo/nhom/team-NNNNNN.json danh sách nhân viên, vai trò, bảng quyền, khóa nhóm (Giám đốc ký)
//!   <gốc>/1_DongBo/may/<số key>/hello.json      máy xin vào nhóm
//!   <gốc>/1_DongBo/may/<số key>/NNNNNNNN.sdp   gói thay đổi
//!   <gốc>/1_DongBo/tep/<tên>.bin        tệp đính kèm đã mã hóa
//!   <gốc>/2_DuLieu/...                   thư mục tài liệu (máy Giám đốc quản lý)
//! Gộp theo từng trường: lần sửa sau cùng thắng (đồng hồ logic, hòa thì theo số key).
use crate::db::{self, Change};
use crate::license;
use crate::team::{self, Member, Ring, Scope, Team};
use ed25519_dalek::SigningKey;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use x25519_dalek::{PublicKey, StaticSecret};

type R<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }

pub fn ensure(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch(
        "CREATE TABLE IF NOT EXISTS fclock(coll TEXT, id TEXT, f TEXT, t INTEGER, m TEXT, PRIMARY KEY(coll,id,f));
         CREATE TABLE IF NOT EXISTS outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS flog(seq INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, ts TEXT, by TEXT, role TEXT, serial TEXT,
           coll TEXT, id TEXT, label TEXT, f TEXT, old TEXT, new TEXT, kind TEXT, note TEXT, overw INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS team_hist(ver INTEGER PRIMARY KEY, at INTEGER, body TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS seen(serial TEXT PRIMARY KEY, seq INTEGER NOT NULL);",
    )
}

/* ---------------- danh tính máy này ---------------- */

#[derive(Clone, Debug, Default)]
pub struct Me {
    pub serial: String,
    pub director: String,
    /// vai trò ghi trong key: GD, TN, NV
    pub role: String,
    pub name: String,
    pub machine: String,
    pub lic_key: String,
    pub gd_sk: Option<[u8; 32]>,
}
impl Me {
    pub fn is_gd(&self) -> bool { self.gd_sk.is_some() }
    pub fn director_pub(&self) -> R<ed25519_dalek::VerifyingKey> {
        match &self.gd_sk { Some(sk) => Ok(SigningKey::from_bytes(sk).verifying_key()), None => license::director_pub(&self.lic_key) }
    }
}

fn kv(c: &Connection, k: &str) -> Option<String> { db::kv_get(c, k).ok().flatten() }
fn kvj(c: &Connection, k: &str) -> Value { kv(c, k).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null) }
fn kvs(c: &Connection, k: &str, v: &Value) -> R<()> { db::kv_set(c, k, &v.to_string()).map_err(e) }

/// Khóa ký và khóa nhận của thiết bị (tạo một lần, cất trong CSDL máy này).
pub fn device(c: &Connection) -> R<(SigningKey, StaticSecret)> {
    let v = kvj(c, "dev");
    if let (Some(ed), Some(x)) = (v["ed"].as_str(), v["x"].as_str()) {
        return Ok((SigningKey::from_bytes(&team::arr32(ed)?), StaticSecret::from(team::arr32(x)?)));
    }
    let ed = team::rand32();
    let x = team::rand32();
    kvs(c, "dev", &json!({"ed": team::hex(&ed), "x": team::hex(&x)}))?;
    Ok((SigningKey::from_bytes(&ed), StaticSecret::from(x)))
}
fn signer(c: &Connection, me: &Me) -> R<SigningKey> {
    match &me.gd_sk { Some(sk) => Ok(SigningKey::from_bytes(sk)), None => Ok(device(c)?.0) }
}

/* ---------------- đồng hồ logic ---------------- */

pub fn now_ms() -> i64 { chrono::Utc::now().timestamp_millis() }
pub fn tick(c: &Connection) -> i64 {
    let last: i64 = kv(c, "hlc").and_then(|s| s.parse().ok()).unwrap_or(0);
    let t = now_ms().max(last + 1);
    let _ = db::kv_set(c, "hlc", &t.to_string());
    t
}
fn observe(c: &Connection, t: i64) {
    let last: i64 = kv(c, "hlc").and_then(|s| s.parse().ok()).unwrap_or(0);
    if t > last { let _ = db::kv_set(c, "hlc", &t.to_string()); }
}
pub fn iso_ms(t: i64) -> String {
    chrono::DateTime::from_timestamp_millis(t).map(|d| d.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()).unwrap_or_default()
}
fn date_of(t: i64) -> String {
    chrono::DateTime::from_timestamp_millis(t).map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string()).unwrap_or_else(team::today_str)
}

/* ---------------- trạng thái nhóm trên máy này ---------------- */

pub fn share_cfg(c: &Connection) -> Value { kvj(c, "share") }
pub fn joined(c: &Connection) -> bool { share_cfg(c)["root"].as_str().map(|s| !s.is_empty()).unwrap_or(false) }
pub fn root(c: &Connection) -> Option<PathBuf> { share_cfg(c)["root"].as_str().filter(|s| !s.is_empty()).map(PathBuf::from) }

pub fn team_hist(c: &Connection) -> Vec<Team> {
    let mut st = match c.prepare("SELECT body FROM team_hist ORDER BY ver") { Ok(s) => s, Err(_) => return vec![] };
    let rows = st.query_map([], |r| r.get::<_, String>(0)).map(|it| it.flatten().collect::<Vec<_>>()).unwrap_or_default();
    rows.iter().filter_map(|b| serde_json::from_str(b).ok()).collect()
}
pub fn team_now(c: &Connection) -> Option<Team> {
    c.query_row("SELECT body FROM team_hist ORDER BY ver DESC LIMIT 1", [], |r| r.get::<_, String>(0)).ok().and_then(|b| serde_json::from_str(&b).ok())
}
fn ring(c: &Connection) -> Ring {
    kv(c, "ring").and_then(|s| team::ring_from_json(s.as_bytes()).ok()).unwrap_or_default()
}
fn set_ring(c: &Connection, r: &Ring) -> R<()> { db::kv_set(c, "ring", &String::from_utf8(team::ring_to_json(r)).unwrap()).map_err(e) }

/// Vai trò đang có hiệu lực của máy này: GD, TN, NV.
pub fn eff_role(c: &Connection, me: &Me) -> String {
    if me.is_gd() { return "GD".into(); }
    if joined(c) { if let Some(m) = team_now(c).and_then(|t| t.member(&me.serial).cloned()) { return m.role; } }
    me.role.clone()
}

/// "" bình thường | "lock" Giám đốc khóa máy | "off" đã bị xóa | "lease" quá hạn chưa đồng bộ | "wait" chờ Giám đốc nhận vào nhóm
pub fn lock_state(c: &Connection, me: &Me) -> String {
    if kv(c, "removed").is_some() { return "off".into(); }
    if me.is_gd() || !joined(c) { return String::new(); }
    let Some(t) = team_now(c) else { return "wait".into() };
    match t.member(&me.serial) {
        None => return "wait".into(),
        Some(m) if m.status == "lock" => return "lock".into(),
        Some(m) if m.status == "off" => return "off".into(),
        _ => {}
    }
    if ring(c).is_empty() { return "wait".into(); }
    let seen: i64 = kv(c, "team_seen_at").and_then(|s| s.parse().ok()).unwrap_or(0);
    if seen > 0 && now_ms() - seen > t.lease_days.max(1) as i64 * 86_400_000 { return "lease".into(); }
    String::new()
}

/* ---------------- phạm vi bản ghi (dự án, gói thầu) ---------------- */

fn data_of(c: &Connection, coll: &str, id: &str) -> Value {
    db::get_rec(c, coll, id).ok().flatten().filter(|r| !r.deleted).map(|r| r.data).unwrap_or(Value::Null)
}
fn s(v: &Value, k: &str) -> String { v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string() }
pub fn scope_of(c: &Connection, coll: &str, id: &str, d: &Value) -> Scope {
    let gt_da = |gt: &str| s(&data_of(c, "goiThau", gt), "da");
    match coll {
        "duAnList" => Scope { da: id.into(), gt: String::new() },
        "goiThau" => Scope { da: s(d, "da"), gt: id.into() },
        "congViec" | "deXuat" | "nghiemThu" | "banGiao" => { let gt = s(d, "gt"); Scope { da: gt_da(&gt), gt } }
        "thanhToan" => { let gt = s(&data_of(c, "nghiemThu", &s(d, "nt")), "gt"); Scope { da: gt_da(&gt), gt } }
        "hop" | "taiLieu" => { let gt = s(d, "gt"); let da = if s(d, "da").is_empty() { gt_da(&gt) } else { s(d, "da") }; Scope { da, gt } }
        _ => Scope::default(),
    }
}

/* ---------------- thay đổi ---------------- */

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Op {
    /// mã thay đổi duy nhất
    pub c: String,
    /// đồng hồ logic
    pub t: i64,
    /// số key người sửa
    pub s: String,
    pub by: String,
    pub r: String,
    pub coll: String,
    pub id: String,
    /// các trường đổi; "_del": true là xóa
    pub f: Map<String, Value>,
    #[serde(default)] pub note: String,
}

fn label_of(d: &Value, id: &str) -> String {
    for k in ["ten", "ma", "lyDo", "ct", "nd"] { if let Some(x) = d.get(k).and_then(|v| v.as_str()) { if !x.is_empty() { return x.chars().take(120).collect(); } } }
    id.to_string()
}
fn short(v: &Value) -> String {
    let s = match v { Value::String(x) => x.clone(), Value::Null => String::new(), _ => v.to_string() };
    s.chars().take(400).collect()
}

/// Áp một thay đổi theo từng trường (bản mới hơn thắng). Trả danh sách trường thực sự đổi.
pub fn apply_op(c: &Connection, op: &Op, me_serial: &str, kind: &str) -> R<Vec<String>> {
    let cur = db::get_rec(c, &op.coll, &op.id).map_err(e)?;
    let mut data = cur.as_ref().map(|r| r.data.clone()).unwrap_or_else(|| json!({}));
    if !data.is_object() { data = json!({}); }
    let mut deleted = cur.as_ref().map(|r| r.deleted).unwrap_or(false);
    let mut changed = vec![];
    let fv = Value::Object(op.f.clone());
    let label = label_of(if op.f.contains_key("ten") || op.f.contains_key("ma") { &fv } else { &data }, &op.id);
    for (f, v) in &op.f {
        let clk: Option<(i64, String)> = c.query_row("SELECT t,m FROM fclock WHERE coll=?1 AND id=?2 AND f=?3", params![op.coll, op.id, f], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(e)?;
        let newer = match &clk { None => true, Some((t, m)) => (op.t, op.s.as_str()) > (*t, m.as_str()) };
        if !newer { continue; }
        let old = if f == "_del" { Value::Bool(deleted) } else { data.get(f).cloned().unwrap_or(Value::Null) };
        c.execute("INSERT INTO fclock(coll,id,f,t,m) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(coll,id,f) DO UPDATE SET t=excluded.t, m=excluded.m",
            params![op.coll, op.id, f, op.t, op.s]).map_err(e)?;
        if &old == v && cur.is_some() { continue; }
        if f == "_del" { deleted = v.as_bool().unwrap_or(false); } else { data[f] = v.clone(); }
        let overw = clk.as_ref().map(|(_, m)| m == me_serial && op.s != me_serial).unwrap_or(false);
        c.execute("INSERT INTO flog(t,ts,by,role,serial,coll,id,label,f,old,new,kind,note,overw) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![op.t, iso_ms(op.t), op.by, op.r, op.s, op.coll, op.id, label, f, short(&old), short(v), kind, op.note, overw as i64]).map_err(e)?;
        changed.push(f.clone());
    }
    if !changed.is_empty() || cur.is_none() {
        if data.get("id").is_none() { data["id"] = Value::String(op.id.clone()); }
        db::put_raw(c, &db::Rec { coll: op.coll.clone(), id: op.id.clone(), data, updated_at: iso_ms(op.t), updated_by: op.by.clone(), deleted }).map_err(e)?;
    }
    Ok(changed)
}

fn push_outbox(c: &Connection, op: &Op) -> R<()> {
    c.execute("INSERT INTO outbox(op) VALUES(?1)", [serde_json::to_string(op).unwrap()]).map_err(e)?;
    Ok(())
}

#[derive(Serialize, Default, Debug)]
pub struct Outcome { pub direct: usize, pub proposed: usize, pub phieu: Option<String>, pub denied: Vec<String> }

fn rank(m: char) -> u8 { match m { 'n' => 3, 'd' => 2, _ => 1 } }

/// Ghi thay đổi do người dùng máy này làm. Trường được "sửa ngay" thì áp luôn;
/// trường cần duyệt thì gom vào một phiếu đề xuất gửi Giám đốc; trường không có quyền bị từ chối.
/// `system`: dữ liệu phần mềm tự tạo (mẫu cài sẵn), ghi với đồng hồ 0 để mọi sửa thật đều thắng.
pub fn local_apply(c: &mut Connection, me: &Me, changes: &[Change], system: bool) -> R<Outcome> {
    let tx = c.transaction().map_err(e)?;
    let is_joined = joined(&tx);
    let role = eff_role(&tx, me);
    let team = if is_joined { team_now(&tx) } else { None };
    let free = system || !is_joined || role == "GD" || team.is_none();
    let t = if system { 0 } else { tick(&tx) };
    let date = team::today_str();
    let mut out = Outcome::default();
    let mut items: Vec<Value> = vec![];
    for (i, ch) in changes.iter().enumerate() {
        let cur = db::get_rec(&tx, &ch.coll, &ch.id).map_err(e)?;
        let alive = cur.as_ref().map(|r| !r.deleted).unwrap_or(false);
        let old = cur.as_ref().filter(|r| !r.deleted).map(|r| r.data.clone()).unwrap_or_else(|| json!({}));
        let mut f = Map::new();
        let creating = !alive && ch.data.is_some();
        let sc_data = ch.data.clone().unwrap_or_else(|| old.clone());
        let sc = scope_of(&tx, &ch.coll, &ch.id, &sc_data);
        let md = |fld: &str| -> char {
            if free { return 'n'; }
            let g = team::group_of(&ch.coll, fld);
            team::mode(team.as_ref().unwrap(), &me.serial, &role, g, &sc, t, &date)
        };
        match &ch.data {
            None => { if !alive { continue; } f.insert("_del".into(), Value::Bool(true)); }
            Some(nd) => {
                let empty = Map::new();
                let no = nd.as_object().unwrap_or(&empty);
                let oo = old.as_object().unwrap_or(&empty);
                for (k, v) in no { if oo.get(k) != Some(v) { f.insert(k.clone(), v.clone()); } }
                for k in oo.keys() { if !no.contains_key(k) && md(k) != 'h' { f.insert(k.clone(), Value::Null); } }
                if creating { f.insert("_del".into(), Value::Bool(false)); }
            }
        }
        if f.is_empty() { continue; }
        // Quyết định quyền: tạo mới / xóa theo mức thấp nhất, sửa theo từng trường.
        let lab = if ch.label.is_empty() { label_of(&sc_data, &ch.id) } else { ch.label.clone() };
        let whole = if ch.data.is_none() { Some(if free { 'n' } else { team::mode(team.as_ref().unwrap(), &me.serial, &role, "xoa", &sc, t, &date) }) }
            else if creating { Some(f.keys().filter(|k| *k != "_del" && *k != "id").map(|k| md(k)).min_by_key(|m| rank(*m)).unwrap_or('n')) }
            else { None };
        let mut direct = Map::new();
        let mut prop = Map::new();
        let mut deny = false;
        for (k, v) in &f {
            let m = whole.unwrap_or_else(|| if k == "_del" || k == "id" { 'n' } else { md(k) });
            match m { 'n' => { direct.insert(k.clone(), v.clone()); } 'd' => { prop.insert(k.clone(), v.clone()); } _ => deny = true }
        }
        if deny { out.denied.push(lab); continue; }
        if !direct.is_empty() && (whole.is_none() || prop.is_empty()) {
            let op = Op { c: format!("{}-{}", uuid::Uuid::new_v4().simple(), i), t, s: me.serial.clone(), by: me.name.clone(), r: role.clone(), coll: ch.coll.clone(), id: ch.id.clone(), f: direct.clone(), note: String::new() };
            apply_op(&tx, &op, &me.serial, if system { "hệ thống" } else { "sửa" })?;
            if is_joined && !system { push_outbox(&tx, &op)?; }
            if !system {
                tx.execute("INSERT INTO changelog(ts,user,role,coll,id,action,label) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                    params![db::now(), me.name, role, ch.coll, ch.id, if ch.data.is_none() { "xóa" } else if creating { "thêm" } else { "sửa" }, lab]).map_err(e)?;
            }
            out.direct += 1;
        }
        if !prop.is_empty() {
            let mut all = prop.clone();
            if whole.is_some() { for (k, v) in direct { all.insert(k, v); } }
            for (k, v) in all {
                if k == "id" { continue; }
                items.push(json!({"coll": ch.coll, "id": ch.id, "label": lab, "f": k, "old": old.get(&k).cloned().unwrap_or(if k == "_del" { Value::Bool(!alive) } else { Value::Null }), "new": v, "moi": creating}));
            }
            tx.execute("INSERT INTO changelog(ts,user,role,coll,id,action,label) VALUES(?1,?2,?3,?4,?5,'đề xuất',?6)",
                params![db::now(), me.name, role, ch.coll, ch.id, lab]).map_err(e)?;
            out.proposed += 1;
        }
    }
    if !items.is_empty() {
        let id = format!("PH{}", &uuid::Uuid::new_v4().simple().to_string()[..10]);
        let mut f = Map::new();
        for (k, v) in [("by", json!(me.serial)), ("ten", json!(me.name)), ("role", json!(role)), ("may", json!(me.machine)), ("at", json!(t)),
            ("kind", json!("sua")), ("status", json!("cho")), ("items", Value::Array(items)), ("_del", json!(false)), ("id", json!(id))] { f.insert(k.into(), v); }
        let op = Op { c: uuid::Uuid::new_v4().simple().to_string(), t, s: me.serial.clone(), by: me.name.clone(), r: role.clone(), coll: "phieu".into(), id: id.clone(), f, note: "đề xuất".into() };
        apply_op(&tx, &op, &me.serial, "đề xuất")?;
        push_outbox(&tx, &op)?;
        out.phieu = Some(id);
    }
    tx.commit().map_err(e)?;
    Ok(out)
}

/* ---------------- thư mục dùng chung ---------------- */

pub fn dir_sync(root: &Path) -> PathBuf { root.join("1_DongBo") }
fn dir_may(root: &Path, serial: &str) -> PathBuf { dir_sync(root).join("may").join(serial) }
fn dir_tep(root: &Path) -> PathBuf { dir_sync(root).join("tep") }
fn dir_team(root: &Path) -> PathBuf { dir_sync(root).join("nhom") }

/// Ghi tệp an toàn: ghi tạm rồi đổi tên, để máy khác không đọc phải tệp dở dang.
fn write_atomic(p: &Path, bytes: &[u8]) -> R<()> {
    if let Some(d) = p.parent() { std::fs::create_dir_all(d).map_err(|x| format!("Không tạo được thư mục {}: {x}", d.display()))?; }
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|x| format!("Không ghi được vào thư mục dùng chung: {x}"))?;
    std::fs::rename(&tmp, p).map_err(e)
}

fn sign_team(c: &Connection, me: &Me, root: &Path, t: &Team) -> R<()> {
    let sk = signer(c, me)?;
    let doc = team::sign_doc(&sk, &serde_json::to_value(t).unwrap());
    write_atomic(&dir_team(root).join(format!("team-{:06}.json", t.ver)), doc.to_string().as_bytes())?;
    c.execute("INSERT OR REPLACE INTO team_hist(ver,at,body) VALUES(?1,?2,?3)", params![t.ver as i64, t.at, serde_json::to_string(t).unwrap()]).map_err(e)?;
    Ok(())
}

/// Kiểm tra thư mục: ghi được không, có phải nhóm của Giám đốc này không.
pub fn probe(root: &Path, me: &Me) -> R<Value> {
    if !root.is_dir() { return Err("Thư mục không tồn tại".into()); }
    let t = root.join(format!(".sda-thu-{}", std::process::id()));
    let writable = std::fs::write(&t, b"x").is_ok();
    let _ = std::fs::remove_file(&t);
    let nhom = dir_sync(root).join("nhom.json");
    let mut info = json!({"writable": writable, "exists": nhom.exists()});
    if nhom.exists() {
        let doc: Value = serde_json::from_slice(&std::fs::read(&nhom).map_err(e)?).map_err(|_| "Tệp nhom.json hỏng".to_string())?;
        let ok = team::verify_doc(&me.director_pub()?, &doc).is_ok();
        info["same_team"] = json!(ok);
        info["company"] = doc["body"]["company"].clone();
        info["created"] = doc["body"]["created"].clone();
    }
    Ok(info)
}

/// Máy Giám đốc tạo thư mục gốc mới cho nhóm, hoặc kết nối lại thư mục cũ của chính mình.
pub fn gd_connect(c: &mut Connection, me: &Me, root: &Path, company: &str) -> R<String> {
    let gd = me.gd_sk.ok_or("Chỉ máy Giám đốc tạo được thư mục nhóm")?;
    let sk = SigningKey::from_bytes(&gd);
    let info = probe(root, me)?;
    if !info["writable"].as_bool().unwrap_or(false) { return Err("Không ghi được vào thư mục này".into()); }
    if info["exists"].as_bool().unwrap_or(false) && !info["same_team"].as_bool().unwrap_or(false) {
        return Err("Thư mục này thuộc nhóm của Giám đốc khác".into());
    }
    std::fs::create_dir_all(dir_may(root, &me.serial)).map_err(e)?;
    std::fs::create_dir_all(dir_tep(root)).map_err(e)?;
    std::fs::create_dir_all(dir_team(root)).map_err(e)?;
    std::fs::create_dir_all(root.join("2_DuLieu")).map_err(e)?;
    kvs(c, "share", &json!({"root": root.to_string_lossy(), "at": now_ms()}))?;
    if info["exists"].as_bool().unwrap_or(false) {
        // Kết nối lại: đọc nhóm và mọi gói (kể cả gói cũ của chính mình) về CSDL.
        c.execute("DELETE FROM seen", []).map_err(e)?;
        pull(c, me)?;
        return Ok("reconnect".into());
    }
    let created = now_ms();
    let doc = team::sign_doc(&sk, &json!({"app": "so-du-an", "director": me.serial, "director_pub": team::hex(sk.verifying_key().as_bytes()), "company": company, "created": created}));
    write_atomic(&dir_sync(root).join("nhom.json"), doc.to_string().as_bytes())?;
    let mut r = Ring::new();
    r.insert(1, team::rand32());
    set_ring(c, &r)?;
    let mut t = Team { ver: 1, at: tick(c), director: me.serial.clone(), company: company.into(), members: vec![], rights: Default::default(), lease_days: 7, keyver: 1, wraps: BTreeMap::new(), gd_ring: Value::Null };
    team::rewrap(&mut t, &r, &gd);
    sign_team(c, me, root, &t)?;
    // Đưa toàn bộ dữ liệu hiện có lên làm điểm xuất phát.
    let tx = c.transaction().map_err(e)?;
    let ts = tick(&tx);
    for rec in db::all_records(&tx).map_err(e)? {
        let mut f = rec.data.as_object().cloned().unwrap_or_default();
        f.insert("_del".into(), Value::Bool(rec.deleted));
        let op = Op { c: uuid::Uuid::new_v4().simple().to_string(), t: ts, s: me.serial.clone(), by: me.name.clone(), r: "GD".into(), coll: rec.coll.clone(), id: rec.id.clone(), f: f.clone(), note: "dữ liệu ban đầu".into() };
        for k in f.keys() {
            tx.execute("INSERT INTO fclock(coll,id,f,t,m) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(coll,id,f) DO UPDATE SET t=excluded.t, m=excluded.m", params![rec.coll, rec.id, k, ts, me.serial]).map_err(e)?;
        }
        push_outbox(&tx, &op)?;
    }
    tx.commit().map_err(e)?;
    push(c, me)?;
    Ok("created".into())
}

/// Máy nhân viên kết nối vào thư mục nhóm. Dữ liệu cũ trên máy được sao lưu rồi xóa,
/// sau đó lấy toàn bộ dữ liệu của nhóm về (tránh trùng lặp).
pub fn staff_connect(c: &mut Connection, me: &Me, root: &Path) -> R<()> {
    if me.is_gd() { return Err("Máy Giám đốc dùng nút Tạo thư mục nhóm".into()); }
    let info = probe(root, me)?;
    if !info["exists"].as_bool().unwrap_or(false) { return Err("Chưa thấy thư mục nhóm ở đây. Chọn đúng thư mục SoDuAn_DungChung mà Giám đốc đã chia sẻ, hoặc chờ Google Drive tải xong.".into()); }
    if !info["same_team"].as_bool().unwrap_or(false) { return Err("Thư mục này không phải của Giám đốc đã cấp key cho máy này".into()); }
    if !info["writable"].as_bool().unwrap_or(false) { return Err("Không ghi được vào thư mục. Giám đốc cần chia sẻ với quyền Người chỉnh sửa.".into()); }
    let (ed, x) = device(c)?;
    let body = json!({"serial": me.serial, "name": me.name, "machine": me.machine, "lic": me.lic_key, "role": me.role,
        "ed_pub": team::hex(ed.verifying_key().as_bytes()), "x_pub": team::hex(PublicKey::from(&x).as_bytes()), "at": now_ms()});
    write_atomic(&dir_may(root, &me.serial).join("hello.json"), team::sign_doc(&ed, &body).to_string().as_bytes())?;
    let tx = c.transaction().map_err(e)?;
    for t in ["records", "fclock", "outbox", "flog", "seen", "team_hist", "changelog"] { tx.execute(&format!("DELETE FROM {t}"), []).map_err(e)?; }
    tx.execute("DELETE FROM kv WHERE key IN ('ring','team_seen_at','pkseq','follow')", []).map_err(e)?;
    tx.commit().map_err(e)?;
    kvs(c, "share", &json!({"root": root.to_string_lossy(), "at": now_ms()}))?;
    let _ = pull(c, me);
    Ok(())
}

pub fn disconnect(c: &Connection) -> R<()> { c.execute("DELETE FROM kv WHERE key='share'", []).map_err(e)?; Ok(()) }

/* ---------------- đẩy gói lên ---------------- */

fn collect_files(v: &Value, out: &mut HashSet<String>) {
    match v {
        Value::String(x) if x.starts_with("files/") && !x.contains("..") => { out.insert(x.clone()); }
        Value::Array(a) => a.iter().for_each(|x| collect_files(x, out)),
        Value::Object(o) => o.values().for_each(|x| collect_files(x, out)),
        _ => {}
    }
}
fn tep_name(rel: &str) -> String { rel.trim_start_matches("files/").replace(['/', '\\'], "_") + ".bin" }

/// Ghi các thay đổi chưa gửi thành một gói mới. Trả số thay đổi đã gửi.
pub fn push(c: &Connection, me: &Me) -> R<usize> {
    let Some(root) = root(c) else { return Ok(0) };
    if !lock_state(c, me).is_empty() { return Ok(0); }
    let pushed: i64 = kv(c, "pushed").and_then(|s| s.parse().ok()).unwrap_or(0);
    let mut st = c.prepare("SELECT seq, op FROM outbox WHERE seq > ?1 ORDER BY seq").map_err(e)?;
    let rows: Vec<(i64, String)> = st.query_map([pushed], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
    if rows.is_empty() { return Ok(0); }
    let r = ring(c);
    let team = team_now(c).ok_or("Chưa có thông tin nhóm")?;
    let key = r.get(&team.keyver).ok_or("Máy này chưa nhận được khóa nhóm, chờ máy Giám đốc chấp nhận")?;
    let ops: Vec<Value> = rows.iter().filter_map(|(_, o)| serde_json::from_str(o).ok()).collect();
    // Tệp đính kèm: mã hóa đưa lên thư mục tep (nếu chưa có).
    let mut files = HashSet::new();
    ops.iter().for_each(|o| collect_files(&o["f"], &mut files));
    let data_dir = kv(c, "data_dir").map(PathBuf::from);
    if let Some(dd) = &data_dir {
        for rel in &files {
            let dest = dir_tep(&root).join(tep_name(rel));
            if dest.exists() { continue; }
            if let Ok(b) = std::fs::read(dd.join(rel)) {
                let (n, ct) = team::seal(key, &b);
                write_atomic(&dest, json!({"kv": team.keyver, "n": n, "c": ct}).to_string().as_bytes())?;
            }
        }
    }
    let seq: i64 = kv(c, "pkseq").and_then(|s| s.parse().ok()).unwrap_or(0).max(max_seq_in(&dir_may(&root, &me.serial))) + 1;
    let (n, ct) = team::seal(key, json!({"ops": ops}).to_string().as_bytes());
    let msg = format!("{}|{}|{}|{}|{}", me.serial, seq, team.keyver, n, ct);
    let sig = team::sign_bytes(&signer(c, me)?, msg.as_bytes());
    let pk = json!({"v": 1, "s": me.serial, "seq": seq, "kv": team.keyver, "n": n, "c": ct, "sig": sig, "at": now_ms()});
    write_atomic(&dir_may(&root, &me.serial).join(format!("{seq:08}.sdp")), pk.to_string().as_bytes())?;
    db::kv_set(c, "pkseq", &seq.to_string()).map_err(e)?;
    db::kv_set(c, "pushed", &rows.last().unwrap().0.to_string()).map_err(e)?;
    c.execute("INSERT INTO seen(serial,seq) VALUES(?1,?2) ON CONFLICT(serial) DO UPDATE SET seq=MAX(seq, excluded.seq)", params![me.serial, seq]).map_err(e)?;
    db::kv_set(c, "last_push", &now_ms().to_string()).map_err(e)?;
    Ok(rows.len())
}
fn max_seq_in(d: &Path) -> i64 {
    std::fs::read_dir(d).map(|it| it.flatten().filter_map(|x| x.file_name().to_str().and_then(|n| n.strip_suffix(".sdp")).and_then(|n| n.parse::<i64>().ok())).max().unwrap_or(0)).unwrap_or(0)
}

/* ---------------- nhận gói về ---------------- */

#[derive(Serialize, Default, Debug)]
pub struct PullResult { pub ops: usize, pub changed: usize, pub late: usize, pub team_changed: bool, pub accepted: Vec<String>, pub errors: Vec<String>, pub lock: String }

/// Đọc các phiên bản nhóm mới, cập nhật khóa, trạng thái máy này.
fn read_teams(c: &Connection, me: &Me, root: &Path, res: &mut PullResult) -> R<()> {
    let dpk = me.director_pub()?;
    let have: i64 = c.query_row("SELECT COALESCE(MAX(ver),0) FROM team_hist", [], |r| r.get(0)).map_err(e)?;
    let mut files: Vec<(i64, PathBuf)> = std::fs::read_dir(dir_team(root)).map(|it| it.flatten()
        .filter_map(|x| { let n = x.file_name().to_string_lossy().to_string(); n.strip_prefix("team-").and_then(|v| v.strip_suffix(".json")).and_then(|v| v.parse().ok()).map(|v| (v, x.path())) })
        .collect()).unwrap_or_default();
    files.sort();
    let mut any = false;
    for (v, p) in files.into_iter().filter(|(v, _)| *v > have) {
        let Ok(b) = std::fs::read(&p) else { break };
        let Ok(doc) = serde_json::from_slice::<Value>(&b) else { break };
        match team::verify_doc(&dpk, &doc) {
            Ok(body) => {
                let t: Team = serde_json::from_value(body.clone()).map_err(|x| format!("Bảng nhóm hỏng: {x}"))?;
                if t.ver as i64 != v { continue; }
                c.execute("INSERT OR REPLACE INTO team_hist(ver,at,body) VALUES(?1,?2,?3)", params![v, t.at, body.to_string()]).map_err(e)?;
                observe(c, t.at);
                any = true;
            }
            Err(_) => res.errors.push(format!("Bỏ qua {} vì chữ ký không phải của Giám đốc", p.display())),
        }
    }
    if dir_team(root).is_dir() { db::kv_set(c, "team_seen_at", &now_ms().to_string()).map_err(e)?; }
    res.team_changed = any;
    let Some(t) = team_now(c) else { return Ok(()) };
    // Khóa nhóm.
    let mut r = ring(c);
    let got = if let Some(gd) = me.gd_sk {
        let v = &t.gd_ring;
        team::open(&team::gd_store_key(&gd), v["n"].as_str().unwrap_or(""), v["c"].as_str().unwrap_or("")).ok()
    } else if let Some(w) = t.wraps.get(&me.serial) {
        team::unwrap(&device(c)?.1, w).ok()
    } else { None };
    if let Some(b) = got { if let Ok(nr) = team::ring_from_json(&b) { for (k, v) in nr { r.insert(k, v); } set_ring(c, &r)?; } }
    // Bị xóa khỏi nhóm.
    if !me.is_gd() { if let Some(m) = t.member(&me.serial) { if m.status == "off" { wipe(c)?; res.lock = "off".into(); } } }
    Ok(())
}

/// Xóa sạch dữ liệu trên máy bị Giám đốc xóa khỏi nhóm.
pub fn wipe(c: &Connection) -> R<()> {
    let dd = kv(c, "data_dir").map(PathBuf::from);
    for t in ["records", "fclock", "outbox", "flog", "seen", "changelog", "sync_base"] { let _ = c.execute(&format!("DELETE FROM {t}"), []); }
    c.execute("DELETE FROM kv WHERE key NOT LIKE 'license%'", []).map_err(e)?;
    db::kv_set(c, "removed", &now_ms().to_string()).map_err(e)?;
    if let Some(dd) = dd {
        for sub in ["files", "backups"] { let p = dd.join(sub); let _ = std::fs::remove_dir_all(&p); let _ = std::fs::create_dir_all(&p); }
    }
    let _ = c.execute_batch("VACUUM;");
    Ok(())
}

enum Admit { Apply, Drop, Late(String) }

fn admit(c: &Connection, me: &Me, hist: &[Team], op: &Op) -> Admit {
    let Some(first) = hist.first() else { return Admit::Drop };
    if op.s == first.director { return Admit::Apply; }
    let Some((t, m)) = team::role_at(hist, &op.s, op.t) else { return Admit::Drop };
    let m = match m { Some(m) => m.clone(), None => {
        // Máy mới, có thể bảng nhóm lúc op.t chưa có: lấy theo bảng mới nhất.
        match hist.last().and_then(|x| x.member(&op.s)).cloned() { Some(m) => m, None => return Admit::Drop }
    } };
    if m.status != "active" && op.t >= m.eff { return if me.is_gd() { Admit::Late("Sửa khi máy đã bị khóa".into()) } else { Admit::Drop }; }
    if op.coll == "phieu" {
        let cur = data_of(c, "phieu", &op.id);
        let by = op.f.get("by").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(&cur, "by"));
        let st = op.f.get("status").and_then(|x| x.as_str()).unwrap_or("cho");
        return if by == op.s && st == "cho" && (cur.is_null() || s(&cur, "status") == "cho") { Admit::Apply } else { Admit::Drop };
    }
    // Chỉ máy Giám đốc xét lại quyền; máy khác tin bảng quyền của người gửi và chờ Giám đốc hủy nếu sai.
    if !me.is_gd() { return Admit::Apply; }
    let cur = db::get_rec(c, &op.coll, &op.id).ok().flatten();
    let alive = cur.as_ref().map(|r| !r.deleted).unwrap_or(false);
    let mut d = cur.as_ref().map(|r| r.data.clone()).unwrap_or_else(|| json!({}));
    for (k, v) in &op.f { if k != "_del" { d[k] = v.clone(); } }
    let sc = scope_of(c, &op.coll, &op.id, &d);
    let date = date_of(op.t);
    let md = |g: &str| team::mode(t, &op.s, &m.role, g, &sc, op.t, &date);
    let ok = if op.f.get("_del") == Some(&Value::Bool(true)) { md("xoa") == 'n' }
        else { op.f.keys().filter(|k| *k != "_del" && *k != "id").all(|k| md(team::group_of(&op.coll, k)) == 'n') || (!alive && op.f.len() <= 1) };
    if ok { Admit::Apply } else {
        let locked = t.rights.locks.iter().any(|l| op.t >= l.at && (l.scope == sc.da || l.scope == sc.gt));
        Admit::Late(if locked { "Sửa sau khi khóa sổ".into() } else if t.ver > 1 { "Sửa vượt quyền hiện hành (máy chưa nhận bảng quyền mới)".into() } else { "Sửa vượt quyền".into() })
    }
}

/// Máy Giám đốc: biến một thay đổi không hợp lệ thành phiếu chờ Giám đốc quyết định.
fn make_late(c: &Connection, me: &Me, op: &Op, why: &str) -> R<()> {
    let id = format!("PL{}", &op.c.chars().filter(|x| x.is_ascii_alphanumeric()).take(12).collect::<String>());
    if db::get_rec(c, "phieu", &id).map_err(e)?.is_some() { return Ok(()); }
    let cur = data_of(c, &op.coll, &op.id);
    let fv = Value::Object(op.f.clone());
    let lab = label_of(if cur.is_null() { &fv } else { &cur }, &op.id);
    let items: Vec<Value> = op.f.iter().filter(|(k, _)| *k != "id").map(|(k, v)| json!({"coll": op.coll, "id": op.id, "label": lab, "f": k,
        "old": if k == "_del" { Value::Bool(cur.is_null()) } else { cur.get(k).cloned().unwrap_or(Value::Null) }, "new": v, "moi": cur.is_null()})).collect();
    let mut f = Map::new();
    for (k, v) in [("by", json!(op.s)), ("ten", json!(op.by)), ("role", json!(op.r)), ("at", json!(op.t)), ("kind", json!("late")), ("lyDo", json!(why)),
        ("status", json!("cho")), ("items", Value::Array(items)), ("_del", json!(false)), ("id", json!(id))] { f.insert(k.into(), v); }
    let t = tick(c);
    let nop = Op { c: uuid::Uuid::new_v4().simple().to_string(), t, s: me.serial.clone(), by: me.name.clone(), r: "GD".into(), coll: "phieu".into(), id, f, note: why.into() };
    apply_op(c, &nop, &me.serial, "sửa muộn")?;
    push_outbox(c, &nop)
}

fn fetch_files(c: &Connection, root: &Path, rels: &HashSet<String>) -> Vec<String> {
    let Some(dd) = kv(c, "data_dir").map(PathBuf::from) else { return vec![] };
    let r = ring(c);
    let mut missing = vec![];
    for rel in rels {
        let dest = dd.join(rel);
        if dest.exists() { continue; }
        let src = dir_tep(root).join(tep_name(rel));
        let got = std::fs::read(&src).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).and_then(|v| {
            let k = r.get(&(v["kv"].as_u64().unwrap_or(0) as u32))?;
            team::open(k, v["n"].as_str()?, v["c"].as_str()?).ok()
        });
        match got {
            Some(b) => { if let Some(p) = dest.parent() { let _ = std::fs::create_dir_all(p); } let _ = std::fs::write(&dest, b); }
            None => missing.push(rel.clone()),
        }
    }
    missing
}

/// Đọc thư mục dùng chung: bảng nhóm, máy xin vào nhóm (máy Giám đốc), gói thay đổi của các máy.
pub fn pull(c: &mut Connection, me: &Me) -> R<PullResult> {
    let mut res = PullResult::default();
    let Some(root) = root(c) else { return Ok(res) };
    if !root.is_dir() { return Err(format!("Không thấy thư mục dùng chung {}", root.display())); }
    read_teams(c, me, &root, &mut res)?;
    if res.lock == "off" { return Ok(res); }
    if me.is_gd() { res.accepted = accept_hellos(c, me, &root)?; }
    let hist = team_hist(c);
    let r = ring(c);
    let Some(latest) = hist.last().cloned() else { return Ok(res) };
    let mut need: HashSet<String> = kvj(c, "need_files").as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let dirs: Vec<PathBuf> = std::fs::read_dir(dir_sync(&root).join("may")).map(|it| it.flatten().map(|x| x.path()).filter(|p| p.is_dir()).collect()).unwrap_or_default();
    for d in dirs {
        let serial = d.file_name().unwrap().to_string_lossy().to_string();
        let seen: i64 = c.query_row("SELECT seq FROM seen WHERE serial=?1", [&serial], |r| r.get(0)).optional().map_err(e)?.unwrap_or(0);
        let mut files: Vec<(i64, PathBuf)> = std::fs::read_dir(&d).map(|it| it.flatten().filter_map(|x| {
            let n = x.file_name().to_string_lossy().to_string();
            n.strip_suffix(".sdp").and_then(|v| v.parse::<i64>().ok()).map(|v| (v, x.path())) }).collect()).unwrap_or_default();
        files.sort();
        let pub_key = if serial == latest.director { Some(me.director_pub()?) } else { latest.member(&serial).and_then(|m| team::vk(&m.ed_pub).ok()) };
        let Some(pk) = pub_key else { continue };
        for (seq, p) in files.into_iter().filter(|(v, _)| *v > seen) {
            let Ok(b) = std::fs::read(&p) else { break };
            let Ok(v) = serde_json::from_slice::<Value>(&b) else { break }; // tệp đang tải dở
            let msg = format!("{}|{}|{}|{}|{}", s(&v, "s"), v["seq"], v["kv"], s(&v, "n"), s(&v, "c"));
            if s(&v, "s") != serial || v["seq"].as_i64() != Some(seq) || !team::verify_bytes(&pk, msg.as_bytes(), &s(&v, "sig")) {
                res.errors.push(format!("Bỏ qua gói {} của máy {} vì chữ ký không hợp lệ", seq, serial));
                c.execute("INSERT INTO seen(serial,seq) VALUES(?1,?2) ON CONFLICT(serial) DO UPDATE SET seq=excluded.seq", params![serial, seq]).map_err(e)?;
                continue;
            }
            let Some(key) = r.get(&(v["kv"].as_u64().unwrap_or(0) as u32)) else { break }; // chưa có khóa
            let Ok(plain) = team::open(key, &s(&v, "n"), &s(&v, "c")) else { break };
            let body: Value = serde_json::from_slice(&plain).unwrap_or(Value::Null);
            let ops: Vec<Op> = body["ops"].as_array().map(|a| a.iter().filter_map(|x| serde_json::from_value(x.clone()).ok()).collect()).unwrap_or_default();
            let tx = c.transaction().map_err(e)?;
            for op in &ops {
                if op.s != serial { continue; }
                observe(&tx, op.t);
                res.ops += 1;
                match if serial == me.serial { Admit::Apply } else { admit(&tx, me, &hist, op) } {
                    Admit::Apply => {
                        let ch = apply_op(&tx, op, &me.serial, if serial == me.serial { "sửa" } else { "nhận" })?;
                        if !ch.is_empty() { res.changed += 1; }
                        let mut fs = HashSet::new();
                        collect_files(&Value::Object(op.f.clone()), &mut fs);
                        need.extend(fs);
                    }
                    Admit::Late(why) => { make_late(&tx, me, op, &why)?; res.late += 1; }
                    Admit::Drop => {}
                }
            }
            tx.execute("INSERT INTO seen(serial,seq) VALUES(?1,?2) ON CONFLICT(serial) DO UPDATE SET seq=excluded.seq", params![serial, seq]).map_err(e)?;
            tx.commit().map_err(e)?;
        }
    }
    let missing = fetch_files(c, &root, &need);
    kvs(c, "need_files", &json!(missing))?;
    db::kv_set(c, "last_pull", &now_ms().to_string()).map_err(e)?;
    if res.late > 0 { push(c, me)?; }
    Ok(res)
}

/* ---------------- máy Giám đốc: nhận máy mới, đổi vai trò, khóa, xóa ---------------- */

fn accept_hellos(c: &Connection, me: &Me, root: &Path) -> R<Vec<String>> {
    let Some(mut t) = team_now(c) else { return Ok(vec![]) };
    let revoked: HashSet<String> = db::all_records(c).map_err(e)?.into_iter().filter(|r| r.coll == "revoked" && !r.deleted).filter_map(|r| r.data["serial"].as_str().map(String::from)).collect();
    let mut added = vec![];
    let dirs: Vec<PathBuf> = std::fs::read_dir(dir_sync(root).join("may")).map(|it| it.flatten().map(|x| x.path()).collect()).unwrap_or_default();
    for d in dirs {
        let Ok(b) = std::fs::read(d.join("hello.json")) else { continue };
        let Ok(doc) = serde_json::from_slice::<Value>(&b) else { continue };
        let body = &doc["body"];
        let serial = s(body, "serial");
        if serial.is_empty() || serial == me.serial || revoked.contains(&serial) { continue; }
        let Ok(edk) = team::vk(&s(body, "ed_pub")) else { continue };
        if team::verify_doc(&edk, &doc).is_err() { continue; }
        let Ok((info, _)) = license::verify(&s(body, "lic")) else { continue };
        if info.serial != serial || info.director != me.director || info.role == "GD" { continue; }
        if !info.machine.is_empty() && info.machine != s(body, "machine") { continue; }
        match t.members.iter_mut().find(|m| m.serial == serial) {
            Some(m) => {
                // Máy cài lại (cùng key): nhận khóa thiết bị mới nếu máy chưa bị xóa.
                if m.status != "off" && (m.ed_pub != s(body, "ed_pub") || m.x_pub != s(body, "x_pub")) && body["at"].as_i64().unwrap_or(0) > m.joined {
                    m.ed_pub = s(body, "ed_pub"); m.x_pub = s(body, "x_pub"); m.joined = body["at"].as_i64().unwrap_or(0);
                    added.push(m.name.clone());
                }
            }
            None => {
                t.members.push(Member { serial: serial.clone(), name: s(body, "name"), machine: s(body, "machine"), role: info.role.to_string(), status: "active".into(),
                    ed_pub: s(body, "ed_pub"), x_pub: s(body, "x_pub"), eff: 0, joined: body["at"].as_i64().unwrap_or(0) });
                added.push(s(body, "name"));
            }
        }
    }
    if !added.is_empty() {
        let r = ring(c);
        t.ver += 1; t.at = tick(c);
        team::rewrap(&mut t, &r, &me.gd_sk.unwrap());
        sign_team(c, me, root, &t)?;
    }
    Ok(added)
}

#[derive(Deserialize, Debug)]
pub struct MemberEdit { pub serial: String, pub role: String, pub status: String, #[serde(default)] pub eff_date: String }

/// Máy Giám đốc lưu bảng nhóm mới: vai trò, khóa/xóa máy, bảng quyền, hạn phải đồng bộ.
pub fn gd_save(c: &Connection, me: &Me, edits: &[MemberEdit], rights: Option<team::Rights>, lease_days: Option<u32>) -> R<u64> {
    let gd = me.gd_sk.ok_or("Chỉ Giám đốc")?;
    let root = root(c).ok_or("Chưa kết nối thư mục nhóm")?;
    let mut t = team_now(c).ok_or("Chưa có nhóm")?;
    let now = tick(c);
    let mut rotate = false;
    for ed in edits {
        let Some(m) = t.members.iter_mut().find(|m| m.serial == ed.serial) else { continue };
        if m.role == ed.role && m.status == ed.status { continue; }
        let eff = if ed.eff_date.is_empty() { now } else {
            chrono::NaiveDate::parse_from_str(&ed.eff_date, "%Y-%m-%d").ok().and_then(|d| d.and_hms_opt(0, 0, 0)).and_then(|d| d.and_local_timezone(chrono::Local).single()).map(|d| d.timestamp_millis()).unwrap_or(now).max(now)
        };
        if ed.status == "off" && m.status != "off" { rotate = true; }
        m.role = if ed.role == "TN" { "TN".into() } else { "NV".into() };
        m.status = match ed.status.as_str() { "lock" | "off" => ed.status.clone(), _ => "active".into() };
        m.eff = eff;
    }
    if let Some(r) = rights { t.rights = r; }
    if let Some(l) = lease_days { t.lease_days = l.clamp(1, 365); }
    let mut ring = ring(c);
    if rotate { t.keyver += 1; ring.insert(t.keyver, team::rand32()); set_ring(c, &ring)?; }
    t.ver += 1; t.at = now;
    team::rewrap(&mut t, &ring, &gd);
    sign_team(c, me, &root, &t)?;
    Ok(t.ver)
}

/// Giám đốc quyết định một phiếu: đồng ý các dòng chọn (đưa vào dữ liệu, gửi mọi máy) hoặc hủy.
/// Phiếu "sửa muộn" bị hủy thì ghi lại giá trị hiện tại để máy đã lỡ sửa quay về như cũ.
pub fn decide(c: &mut Connection, me: &Me, id: &str, picks: &[usize], approve: bool, note: &str) -> R<usize> {
    if !me.is_gd() { return Err("Chỉ Giám đốc duyệt phiếu".into()); }
    let tx = c.transaction().map_err(e)?;
    let p = data_of(&tx, "phieu", id);
    if p.is_null() { return Err("Không thấy phiếu".into()); }
    if s(&p, "status") != "cho" { return Err("Phiếu này đã được xử lý".into()); }
    let items = p["items"].as_array().cloned().unwrap_or_default();
    let t = tick(&tx);
    let mut n = 0;
    let mut by_rec: BTreeMap<(String, String), Map<String, Value>> = BTreeMap::new();
    for (i, it) in items.iter().enumerate() {
        let take = approve && picks.contains(&i);
        let (coll, rid, f) = (s(it, "coll"), s(it, "id"), s(it, "f"));
        if coll.is_empty() || coll == "phieu" { continue; }
        if take {
            by_rec.entry((coll, rid)).or_default().insert(f, it["new"].clone());
            n += 1;
        } else if s(&p, "kind") == "late" {
            // Ghi lại giá trị đang có trên máy Giám đốc (mới hơn) để các máy khác quay về.
            let cur = db::get_rec(&tx, &coll, &rid).map_err(e)?;
            let v = if f == "_del" { Value::Bool(cur.as_ref().map(|r| r.deleted).unwrap_or(true)) } else { cur.as_ref().and_then(|r| r.data.get(&f).cloned()).unwrap_or(Value::Null) };
            by_rec.entry((coll, rid)).or_default().insert(f, v);
        }
    }
    let who = s(&p, "ten");
    for ((coll, rid), f) in by_rec {
        let op = Op { c: uuid::Uuid::new_v4().simple().to_string(), t, s: me.serial.clone(), by: me.name.clone(), r: "GD".into(), coll, id: rid, f,
            note: if approve { format!("Duyệt đề xuất của {who}") } else { format!("Hủy sửa của {who}") } };
        apply_op(&tx, &op, &me.serial, if approve { "duyệt" } else { "hủy" })?;
        push_outbox(&tx, &op)?;
    }
    let all = approve && picks.len() >= items.len();
    let st = if !approve { "tuchoi" } else if all { "dongy" } else if n == 0 { "tuchoi" } else { "motphan" };
    let mut f = Map::new();
    f.insert("status".into(), json!(st));
    f.insert("xuLy".into(), json!({"by": me.name, "at": t, "note": note, "picks": picks}));
    let op = Op { c: uuid::Uuid::new_v4().simple().to_string(), t, s: me.serial.clone(), by: me.name.clone(), r: "GD".into(), coll: "phieu".into(), id: id.into(), f, note: String::new() };
    apply_op(&tx, &op, &me.serial, "duyệt")?;
    push_outbox(&tx, &op)?;
    tx.commit().map_err(e)?;
    Ok(n)
}

/// Thông tin cho màn hình: trạng thái kết nối, nhóm, quyền của máy này.
pub fn status(c: &Connection, me: &Me) -> Value {
    let cfg = share_cfg(c);
    let t = team_now(c);
    let pending: i64 = c.query_row("SELECT COUNT(*) FROM outbox WHERE seq > ?1", [kv(c, "pushed").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0)], |r| r.get(0)).unwrap_or(0);
    let phieu_cho: i64 = c.query_row("SELECT COUNT(*) FROM records WHERE coll='phieu' AND deleted=0 AND json_extract(data,'$.status')='cho'", [], |r| r.get(0)).unwrap_or(0);
    let mine_cho: i64 = c.query_row("SELECT COUNT(*) FROM records WHERE coll='phieu' AND deleted=0 AND json_extract(data,'$.status')='cho' AND json_extract(data,'$.by')=?1", [&me.serial], |r| r.get(0)).unwrap_or(0);
    let mut members = Value::Null;
    if me.is_gd() {
        if let Some(t) = &t {
            let seen: BTreeMap<String, i64> = c.prepare("SELECT serial, seq FROM seen").ok().map(|mut st| st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).map(|it| it.flatten().collect()).unwrap_or_default()).unwrap_or_default();
            members = json!(t.members.iter().map(|m| {
                let last = root(c).and_then(|r| std::fs::read_dir(dir_may(&r, &m.serial)).ok()).and_then(|it| it.flatten().filter_map(|x| x.metadata().ok()?.modified().ok()).max())
                    .map(|st| chrono::DateTime::<chrono::Local>::from(st).format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default();
                json!({"serial": m.serial, "name": m.name, "machine": m.machine, "role": m.role, "status": m.status, "eff": m.eff, "joined": m.joined, "lastSeen": last, "pk": seen.get(&m.serial)})
            }).collect::<Vec<_>>());
        }
    }
    json!({
        "joined": joined(c), "root": cfg["root"], "lock": lock_state(c, me), "role": eff_role(c, me), "serial": me.serial, "isGD": me.is_gd(),
        "team": t.as_ref().map(|t| json!({"ver": t.ver, "company": t.company, "rights": t.rights, "lease_days": t.lease_days, "director": t.director,
            "me": t.member(&me.serial)})),
        "members": members,
        "pending": pending, "phieuCho": phieu_cho, "mineCho": mine_cho,
        "lastPull": kv(c, "last_pull"), "lastPush": kv(c, "last_push"), "needFiles": kvj(c, "need_files"),
        "groups": team::GROUPS.iter().map(|(k, l)| json!([k, l])).collect::<Vec<_>>(),
        "now": now_ms(),
    })
}

/// Lọc dữ liệu đưa lên màn hình theo quyền "ẩn hẳn".
pub fn visible(c: &Connection, me: &Me, colls: &mut Value) {
    if me.is_gd() || !joined(c) { return; }
    let Some(t) = team_now(c) else { return };
    let role = eff_role(c, me);
    let date = team::today_str();
    let now = now_ms();
    let Some(obj) = colls.as_object_mut() else { return };
    let snapshot: Vec<(String, Vec<Value>)> = obj.iter().map(|(k, v)| (k.clone(), v.as_array().cloned().unwrap_or_default())).collect();
    for (coll, recs) in snapshot {
        let mut out = vec![];
        for mut r in recs {
            let id = s(&r, "id");
            let sc = scope_of(c, &coll, &id, &r);
            let keys: Vec<String> = r.as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default();
            let mut drop = false;
            for k in keys {
                let g = team::group_of(&coll, &k);
                if team::mode(&t, &me.serial, &role, g, &sc, now, &date) == 'h' {
                    if matches!(coll.as_str(), "nghiemThu" | "thanhToan") { drop = true; break; }
                    if let Some(o) = r.as_object_mut() { o.remove(&k); }
                }
            }
            if coll == "phieu" && s(&r, "by") != me.serial { drop = true; }
            if !drop { out.push(r); }
        }
        obj.insert(coll, Value::Array(out));
    }
}

/// Nhật ký sửa theo trường (máy Giám đốc).
pub fn field_log(c: &Connection, limit: i64, overw_only: bool) -> R<Value> {
    let q = format!("SELECT t,by,role,serial,coll,id,label,f,old,new,kind,note,overw FROM flog {} ORDER BY seq DESC LIMIT ?1", if overw_only { "WHERE overw=1" } else { "" });
    let mut st = c.prepare(&q).map_err(e)?;
    let rows = st.query_map([limit], |r| Ok(json!({"t": r.get::<_, i64>(0)?, "by": r.get::<_, String>(1)?, "role": r.get::<_, String>(2)?, "serial": r.get::<_, String>(3)?,
        "coll": r.get::<_, String>(4)?, "id": r.get::<_, String>(5)?, "label": r.get::<_, String>(6)?, "f": r.get::<_, String>(7)?, "old": r.get::<_, String>(8)?,
        "new": r.get::<_, String>(9)?, "kind": r.get::<_, String>(10)?, "note": r.get::<_, String>(11)?, "overw": r.get::<_, i64>(12)? != 0}))).map_err(e)?;
    Ok(Value::Array(rows.flatten().collect()))
}

#[cfg(test)]
mod tests;
