pub mod ai;
pub mod backup;
pub mod db;
pub mod docs;
pub mod license;
pub mod share;
pub mod sync;
pub mod team;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};

pub struct AppState {
    conn: Mutex<rusqlite::Connection>,
    dir: PathBuf,
    tray: AtomicBool,
    /// bấm "Đồng bộ ngay": luồng nền chạy ngay vòng tiếp theo
    kick: AtomicBool,
}

type R<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }

#[derive(Default, Clone, serde::Serialize)]
struct Lic { activated: bool, name: String, role: String, exp: String, machine: String, serial: String, director: String, can_issue: bool, error: String }

fn lic_status(c: &rusqlite::Connection) -> Lic {
    let mine = license::fmt_machine(&license::machine_bytes());
    let Ok(Some(raw)) = db::kv_get(c, "license") else { return Lic { machine: mine, ..Default::default() } };
    let v: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let (name, key, bound) = (v["name"].as_str().unwrap_or(""), v["key"].as_str().unwrap_or(""), v["machine"].as_str().unwrap_or(""));
    let mut l = Lic { machine: mine.clone(), name: name.into(), ..Default::default() };
    match license::verify(key) {
        Err(er) => l.error = er,
        Ok((i, _)) => {
            l.role = i.role.into(); l.exp = i.exp.clone(); l.serial = i.serial; l.director = i.director; l.can_issue = i.can_issue;
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            if !i.machine.is_empty() && i.machine != mine { l.error = "Key này cấp cho máy khác".into(); }
            else if bound != mine { l.error = "Dữ liệu được chép từ máy khác, cần kích hoạt lại trên máy này".into(); }
            else if i.exp < today { l.error = format!("Key đã hết hạn ngày {}", i.exp); }
            else if is_revoked(c, &l.serial) || (l.director != l.serial && is_revoked(c, &l.director)) { l.error = "Key này đã bị thu hồi. Liên hệ Giám đốc để được cấp key mới".into(); }
            else { l.activated = true; }
        }
    }
    if l.activated { if let Some(m) = me_of(c) { l.role = share::eff_role(c, &m); } }
    l
}

/// Danh tính máy này cho phần đồng bộ (từ key đã kích hoạt).
fn me_of(c: &rusqlite::Connection) -> Option<share::Me> {
    let raw = db::kv_get(c, "license").ok().flatten()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    let key = v["key"].as_str()?.to_string();
    let (i, sk) = license::verify(&key).ok()?;
    Some(share::Me { serial: i.serial, director: i.director, role: i.role.into(), name: v["name"].as_str().unwrap_or("").into(), machine: i.machine, lic_key: key, gd_sk: sk })
}
fn me_req(c: &rusqlite::Connection) -> R<share::Me> {
    if !lic_status(c).activated { return Err("Phần mềm chưa kích hoạt".into()); }
    me_of(c).ok_or_else(|| "Phần mềm chưa kích hoạt".into())
}

fn is_revoked(c: &rusqlite::Connection, serial: &str) -> bool {
    c.query_row("SELECT 1 FROM records WHERE coll='revoked' AND deleted=0 AND json_extract(data,'$.serial')=?1 LIMIT 1", [serial], |_| Ok(())).is_ok()
}

fn who(c: &rusqlite::Connection) -> (String, String) {
    let l = lic_status(c);
    (if l.name.is_empty() { "Chưa kích hoạt".into() } else { l.name }, l.role)
}

#[tauri::command]
fn app_info(st: State<AppState>) -> R<Value> {
    let c = st.conn.lock().unwrap();
    Ok(json!({"dir": st.dir, "version": env!("CARGO_PKG_VERSION"), "license": lic_status(&c)}))
}

#[tauri::command]
fn db_load(st: State<AppState>) -> R<Value> {
    let c = st.conn.lock().unwrap();
    let mut colls = db::load_all(&c).map_err(e)?;
    let mut sh = Value::Null;
    if let Some(m) = me_of(&c) { share::visible(&c, &m, &mut colls); sh = share::status(&c, &m); }
    Ok(json!({"colls": colls, "kv": db::kv_all(&c).map_err(e)?, "share": sh}))
}

#[tauri::command]
fn db_apply(st: State<AppState>, changes: Vec<db::Change>, system: Option<bool>) -> R<share::Outcome> {
    let mut c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    let lk = share::lock_state(&c, &m);
    if !lk.is_empty() { return Err(match lk.as_str() { "wait" => "Máy này đang chờ Giám đốc nhận vào nhóm, chưa sửa được dữ liệu".into(), _ => "Máy này đang bị khóa".to_string() }); }
    share::local_apply(&mut c, &m, &changes, system.unwrap_or(false))
}

#[tauri::command]
fn kv_set(st: State<AppState>, key: String, value: Value) -> R<()> {
    if key.starts_with("license") || db::KV_INTERNAL.contains(&key.as_str()) { return Err("Khóa không hợp lệ".into()); }
    let c = st.conn.lock().unwrap();
    if key == "nh" { st.tray.store(value["tray"].as_i64().unwrap_or(1) != 0, Ordering::Relaxed); }
    db::kv_set(&c, &key, &value.to_string()).map_err(e)
}

#[tauri::command]
fn changelog(st: State<AppState>, limit: i64) -> R<Value> {
    db::changelog(&st.conn.lock().unwrap(), limit).map_err(e)
}

#[tauri::command]
fn license_activate(st: State<AppState>, name: String, key: String) -> R<Lic> {
    let (info, _) = license::verify(&key)?;
    let mine = license::fmt_machine(&license::machine_bytes());
    if !info.machine.is_empty() && info.machine != mine { return Err(format!("Key này cấp cho máy {}, máy này là {}", info.machine, mine)); }
    if info.exp < chrono::Local::now().format("%Y-%m-%d").to_string() { return Err(format!("Key đã hết hạn ngày {}", info.exp)); }
    if name.trim().is_empty() { return Err("Nhập họ tên người dùng".into()); }
    let c = st.conn.lock().unwrap();
    let revoked: bool = db::all_records(&c).map_err(e)?.iter().any(|r| r.coll == "revoked" && !r.deleted && r.data["serial"] == info.serial.as_str());
    if revoked { return Err("Key này đã bị thu hồi".into()); }
    let compact: String = key.split_whitespace().collect();
    db::kv_set(&c, "license", &json!({"name": name.trim(), "key": compact, "machine": mine}).to_string()).map_err(e)?;
    Ok(lic_status(&c))
}

#[tauri::command]
fn license_issue(st: State<AppState>, role: String, exp: String, machine: String) -> R<Value> {
    let c = st.conn.lock().unwrap();
    let l = lic_status(&c);
    if !l.activated || !l.can_issue { return Err("Chỉ Giám đốc đã kích hoạt mới cấp được key".into()); }
    let raw = db::kv_get(&c, "license").map_err(e)?.unwrap_or_default();
    let v: Value = serde_json::from_str(&raw).map_err(e)?;
    let role = license::Role::from_code(&role).ok_or("Vai trò không hợp lệ")?;
    let (key, serial) = license::issue_sub(v["key"].as_str().unwrap_or(""), role, &exp, &machine)?;
    Ok(json!({"key": key, "serial": serial}))
}

#[tauri::command]
fn license_issue_director(master_text: String, exp: String, machine: String) -> R<String> {
    let sk = license::read_master_file(&master_text)?;
    license::issue_director(&sk, &exp, &machine)
}

#[tauri::command]
fn license_check(key: String) -> R<Value> {
    let (i, _) = license::verify(&key)?;
    Ok(json!({"role": i.role, "exp": i.exp, "machine": i.machine, "serial": i.serial}))
}

#[tauri::command]
fn sync_export(st: State<AppState>, dest: String, projects: Vec<String>) -> R<usize> {
    let c = st.conn.lock().unwrap();
    let (name, role) = who(&c);
    sync::export(&c, &st.dir, std::path::Path::new(&dest), &projects, json!({"by": name, "role": role}))
}

#[tauri::command]
fn sync_preview(st: State<AppState>, path: String) -> R<sync::Preview> {
    sync::preview(&st.conn.lock().unwrap(), std::path::Path::new(&path))
}

#[tauri::command]
fn sync_apply(st: State<AppState>, path: String, picks: HashMap<String, String>) -> R<usize> {
    let mut c = st.conn.lock().unwrap();
    if share::joined(&c) { return Err("Máy đang đồng bộ qua thư mục dùng chung, không nhập tệp .sodaan được (tránh trùng dữ liệu)".into()); }
    backup(&st.dir, &c)?;
    sync::apply(&mut c, &st.dir, std::path::Path::new(&path), &picks)
}

fn backup(dir: &std::path::Path, c: &rusqlite::Connection) -> R<String> {
    let bdir = dir.join("backups");
    std::fs::create_dir_all(&bdir).map_err(e)?;
    let p = bdir.join(format!("so-du-an-{}.db", chrono::Local::now().format("%Y%m%d-%H%M%S")));
    c.execute("VACUUM INTO ?1", [p.to_string_lossy()]).map_err(e)?;
    Ok(p.to_string_lossy().into())
}

#[tauri::command]
fn backup_now(st: State<AppState>) -> R<String> { backup(&st.dir, &st.conn.lock().unwrap()) }

#[tauri::command]
fn backup_save(st: State<AppState>, dest: String) -> R<usize> {
    let c = st.conn.lock().unwrap();
    let (name, _) = who(&c);
    backup::save(&c, &st.dir, std::path::Path::new(&dest), &name)
}

#[tauri::command]
fn backup_info(path: String) -> R<backup::Info> { backup::info(std::path::Path::new(&path)) }

#[tauri::command]
fn backup_restore(st: State<AppState>, path: String) -> R<()> {
    let mut c = st.conn.lock().unwrap();
    if share::joined(&c) && me_of(&c).map(|m| !m.is_gd()).unwrap_or(true) { return Err("Máy nhân viên đang trong nhóm không khôi phục bản sao lưu được. Dữ liệu sẽ tự lấy lại từ thư mục dùng chung.".into()); }
    backup(&st.dir, &c)?;
    backup::restore(&mut c, &st.dir, std::path::Path::new(&path))
}

#[tauri::command]
fn save_file(path: String, bytes: Vec<u8>) -> R<()> { std::fs::write(path, bytes).map_err(e) }

#[tauri::command]
fn read_file(path: String) -> R<Vec<u8>> { std::fs::read(path).map_err(e) }

/// Chép tệp đính kèm vào thư mục dữ liệu, trả đường dẫn tương đối "files/...".
#[tauri::command]
fn file_store(st: State<AppState>, src: Option<String>, name: String, bytes: Option<Vec<u8>>) -> R<String> {
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || ".-_ ".contains(c) { c } else { '_' }).collect();
    let rel = format!("files/{}-{}", &uuid::Uuid::new_v4().simple().to_string()[..8], safe);
    let dest = st.dir.join(&rel);
    std::fs::create_dir_all(dest.parent().unwrap()).map_err(e)?;
    match (src, bytes) {
        (Some(s), _) => { std::fs::copy(s, &dest).map_err(e)?; }
        (None, Some(b)) => { std::fs::write(&dest, b).map_err(e)?; }
        _ => return Err("Thiếu tệp".into()),
    }
    Ok(rel)
}

#[tauri::command]
fn file_read(st: State<AppState>, rel: String) -> R<Vec<u8>> {
    if rel.contains("..") { return Err("Đường dẫn không hợp lệ".into()); }
    std::fs::read(st.dir.join(rel)).map_err(e)
}

#[tauri::command]
fn file_path(st: State<AppState>, rel: String) -> R<String> {
    if rel.contains("..") { return Err("Đường dẫn không hợp lệ".into()); }
    Ok(st.dir.join(rel).to_string_lossy().into())
}

#[tauri::command]
fn send_telegram(token: String, chat_id: String, text: String) -> R<()> {
    ureq::post(&format!("https://api.telegram.org/bot{token}/sendMessage"))
        .send_json(json!({"chat_id": chat_id, "text": text}))
        .map(|_| ()).map_err(|x| format!("Không gửi được Telegram: {x}"))
}

#[tauri::command]
fn send_email(host: String, port: u16, user: String, pass: String, to: String, subject: String, body: String) -> R<()> {
    use lettre::{transport::smtp::authentication::Credentials, Message, SmtpTransport, Transport};
    let m = Message::builder().from(user.parse().map_err(e)?).to(to.parse().map_err(e)?).subject(subject).body(body).map_err(e)?;
    let t = SmtpTransport::relay(&host).map_err(e)?.port(port).credentials(Credentials::new(user, pass)).build();
    t.send(&m).map(|_| ()).map_err(|x| format!("Không gửi được email: {x}"))
}

/* ---------------- đồng bộ qua thư mục dùng chung ---------------- */

#[tauri::command]
fn share_status(st: State<AppState>) -> R<Value> {
    let c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    Ok(share::status(&c, &m))
}

#[tauri::command]
fn share_probe(st: State<AppState>, path: String) -> R<Value> {
    let c = st.conn.lock().unwrap();
    share::probe(std::path::Path::new(&path), &me_req(&c)?)
}

#[tauri::command]
fn share_create(st: State<AppState>, path: String, company: String) -> R<String> {
    let mut c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    backup(&st.dir, &c)?;
    let r = share::gd_connect(&mut c, &m, std::path::Path::new(&path), &company)?;
    if let Some(root) = share::root(&c) { let _ = docs::publish(&c, &root, &st.dir); }
    Ok(r)
}

#[tauri::command]
fn share_join(st: State<AppState>, path: String) -> R<()> {
    let mut c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    backup(&st.dir, &c)?;
    share::staff_connect(&mut c, &m, std::path::Path::new(&path))
}

#[tauri::command]
fn share_disconnect(st: State<AppState>) -> R<()> {
    let c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    if !m.is_gd() { return Err("Chỉ máy Giám đốc ngắt kết nối được. Máy nhân viên do Giám đốc khóa hoặc xóa.".into()); }
    share::disconnect(&c)
}

#[tauri::command]
fn share_settings(st: State<AppState>, every: u32) -> R<()> {
    let c = st.conn.lock().unwrap();
    let mut v: Value = db::kv_get(&c, "share").ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}));
    v["every"] = json!(every.clamp(1, 120));
    db::kv_set(&c, "share", &v.to_string()).map_err(e)
}

/// Đồng bộ một lượt (đẩy, nhận, đẩy). Máy Giám đốc cập nhật thêm thư mục tài liệu.
fn sync_round(st: &AppState) -> R<Value> {
    let mut c = st.conn.lock().unwrap();
    let Some(m) = me_of(&c) else { return Ok(Value::Null) };
    if !share::joined(&c) || !lic_status(&c).activated { return Ok(Value::Null); }
    let sent = share::push(&c, &m)?;
    let r = share::pull(&mut c, &m)?;
    let sent2 = share::push(&c, &m)?;
    let mut docs_n = 0;
    if m.is_gd() { if let Some(root) = share::root(&c) { docs_n = docs::publish(&c, &root, &st.dir).unwrap_or(0); } }
    Ok(json!({"sent": sent + sent2, "pull": r, "docs": docs_n, "lock": share::lock_state(&c, &m)}))
}

#[tauri::command]
fn share_sync_now(st: State<AppState>) -> R<Value> { sync_round(&st) }

#[tauri::command]
fn team_save(st: State<AppState>, edits: Vec<share::MemberEdit>, rights: Option<team::Rights>, lease_days: Option<u32>) -> R<u64> {
    let c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    let v = share::gd_save(&c, &m, &edits, rights, lease_days)?;
    drop(c);
    st.kick.store(true, Ordering::Relaxed);
    Ok(v)
}

#[tauri::command]
fn phieu_decide(st: State<AppState>, id: String, picks: Vec<usize>, approve: bool, note: String) -> R<usize> {
    let mut c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    let n = share::decide(&mut c, &m, &id, &picks, approve, &note)?;
    st.kick.store(true, Ordering::Relaxed);
    Ok(n)
}

#[tauri::command]
fn field_log(st: State<AppState>, limit: i64, overw: bool) -> R<Value> {
    let c = st.conn.lock().unwrap();
    let m = me_req(&c)?;
    if !m.is_gd() { return Err("Chỉ Giám đốc xem nhật ký sửa".into()); }
    share::field_log(&c, limit, overw)
}

/* ---------------- tài liệu và AI ---------------- */

#[tauri::command]
fn docs_list(st: State<AppState>, gt: String) -> R<Value> {
    let c = st.conn.lock().unwrap();
    let root = share::root(&c).ok_or("Chưa kết nối thư mục dùng chung")?;
    docs::list_gt(&c, &root, &gt)
}

#[tauri::command]
fn docs_inbox(st: State<AppState>) -> R<Value> {
    let c = st.conn.lock().unwrap();
    let root = share::root(&c).ok_or("Chưa kết nối thư mục dùng chung")?;
    Ok(docs::list_inbox(&root))
}

#[tauri::command]
fn docs_inbox_done(st: State<AppState>, path: String) -> R<()> {
    let c = st.conn.lock().unwrap();
    let root = share::root(&c).ok_or("Chưa kết nối thư mục dùng chung")?;
    docs::inbox_done(&root, &path)
}

#[tauri::command]
fn docs_root(st: State<AppState>) -> R<String> {
    let c = st.conn.lock().unwrap();
    let root = share::root(&c).ok_or("Chưa kết nối thư mục dùng chung")?;
    Ok(root.join("2_DuLieu").to_string_lossy().into())
}

fn ai_cfg(c: &rusqlite::Connection) -> (String, String, String) {
    let v: Value = db::kv_get(c, "ai").ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null);
    (v["provider"].as_str().unwrap_or("claude").into(), v["key"].as_str().unwrap_or("").into(), v["model"].as_str().unwrap_or("").into())
}

/// Quét một tệp bằng AI. Không giữ khóa CSDL trong lúc chờ AI trả lời.
#[tauri::command]
async fn ai_scan(st: State<'_, AppState>, path: Option<String>, rel: Option<String>, ctx: String) -> R<Value> {
    let (provider, key, model, file) = {
        let c = st.conn.lock().unwrap();
        me_req(&c)?;
        let (p, k, m) = ai_cfg(&c);
        let file = match (path, rel) {
            (Some(p), _) => PathBuf::from(p),
            (None, Some(r)) if !r.contains("..") => st.dir.join(r),
            _ => return Err("Thiếu tệp".into()),
        };
        (p, k, m, file)
    };
    let name = file.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&file).map_err(|x| format!("Không đọc được tệp: {x}"))?;
        ai::scan(&provider, &key, &model, &name, &bytes, &ctx)
    }).await.map_err(e)?
}

#[tauri::command]
async fn ai_test(provider: String, key: String, model: String) -> R<String> {
    tauri::async_runtime::spawn_blocking(move || ai::test(&provider, &key, &model)).await.map_err(e)?
}

#[tauri::command]
fn set_tray(st: State<AppState>, on: bool) { st.tray.store(on, Ordering::Relaxed); }

#[tauri::command]
fn quit(app: AppHandle) { app.exit(0); }

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
}

/// Luồng nền: đồng bộ theo chu kỳ (mặc định 2 phút) và báo giao diện vẽ lại khi có dữ liệu mới.
fn start_sync_loop(app: AppHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut last = std::time::Instant::now() - std::time::Duration::from_secs(3600);
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            let st = app.state::<AppState>();
            let every = {
                let c = st.conn.lock().unwrap();
                if !share::joined(&c) { continue; }
                db::kv_get(&c, "share").ok().flatten().and_then(|s| serde_json::from_str::<Value>(&s).ok()).and_then(|v| v["every"].as_u64()).unwrap_or(2)
            };
            let kick = st.kick.swap(false, Ordering::Relaxed);
            if !kick && last.elapsed().as_secs() < every * 60 { continue; }
            last = std::time::Instant::now();
            let r = sync_round(&st);
            let _ = app.emit("sda-synced", match r { Ok(v) => v, Err(x) => json!({"error": x}) });
        }
    });
}

#[tauri::command]
fn sync_kick(st: State<AppState>) { st.kick.store(true, Ordering::Relaxed); }

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(dir.join("files"))?;
            let conn = db::open(&dir.join("so-du-an.db"))?;
            sync::ensure(&conn)?;
            share::ensure(&conn)?;
            docs::ensure(&conn)?;
            db::kv_set(&conn, "data_dir", &dir.to_string_lossy())?;
            let tray_on = db::kv_get(&conn, "nh").ok().flatten()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                .map(|v| v["tray"].as_i64().unwrap_or(1) != 0).unwrap_or(true);
            app.manage(AppState { conn: Mutex::new(conn), dir, tray: AtomicBool::new(tray_on), kick: AtomicBool::new(true) });
            start_sync_loop(app.handle().clone());

            let open = MenuItem::with_id(app, "open", "Mở Sổ Dự Án", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát hẳn", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Sổ Dự Án")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() { "open" => show(app), "quit" => app.exit(0), _ => {} })
                .on_tray_icon_event(|t, ev| if let TrayIconEvent::Click { button: MouseButton::Left, .. } = ev { show(t.app_handle()) })
                .build(app)?;

            let hidden = std::env::args().any(|a| a == "--hidden");
            if !hidden { show(app.handle()); }
            Ok(())
        })
        .on_window_event(|w, ev| {
            if let WindowEvent::CloseRequested { api, .. } = ev {
                let st = w.state::<AppState>();
                if st.tray.load(Ordering::Relaxed) { api.prevent_close(); let _ = w.hide(); }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info, db_load, db_apply, kv_set, changelog,
            license_activate, license_issue, license_issue_director, license_check,
            sync_export, sync_preview, sync_apply, backup_now, backup_save, backup_info, backup_restore,
            save_file, read_file, file_store, file_read, file_path,
            send_telegram, send_email, set_tray, quit,
            share_status, share_probe, share_create, share_join, share_disconnect, share_settings, share_sync_now, sync_kick,
            team_save, phieu_decide, field_log, docs_list, docs_inbox, docs_inbox_done, docs_root, ai_scan, ai_test
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được Sổ Dự Án");
}

