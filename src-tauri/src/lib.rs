pub mod backup;
pub mod db;
pub mod license;
pub mod sync;

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
    l
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
    Ok(json!({"colls": db::load_all(&c).map_err(e)?, "kv": db::kv_all(&c).map_err(e)?}))
}

#[tauri::command]
fn db_apply(st: State<AppState>, changes: Vec<db::Change>) -> R<usize> {
    let mut c = st.conn.lock().unwrap();
    let l = lic_status(&c);
    if !l.activated { return Err("Phần mềm chưa kích hoạt".into()); }
    db::apply(&mut c, &changes, &l.name, &l.role).map_err(e)
}

#[tauri::command]
fn kv_set(st: State<AppState>, key: String, value: Value) -> R<()> {
    if key.starts_with("license") { return Err("Khóa không hợp lệ".into()); }
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

#[tauri::command]
fn set_tray(st: State<AppState>, on: bool) { st.tray.store(on, Ordering::Relaxed); }

#[tauri::command]
fn quit(app: AppHandle) { app.exit(0); }

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
}

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
            let tray_on = db::kv_get(&conn, "nh").ok().flatten()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                .map(|v| v["tray"].as_i64().unwrap_or(1) != 0).unwrap_or(true);
            app.manage(AppState { conn: Mutex::new(conn), dir, tray: AtomicBool::new(tray_on) });

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
            send_telegram, send_email, set_tray, quit
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được Sổ Dự Án");
}

