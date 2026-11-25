//! Mô phỏng nhiều máy dùng chung một thư mục (thư mục tạm thay cho Google Drive).
use super::*;
use crate::license::{self, Role};
use crate::team::{Grant, Rights};

fn master() {
    let _ = license::TEST_MASTER.set([7u8; 32]);
}
fn tmp(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("sda-test-{}-{}", name, uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&p).unwrap();
    p
}
struct Machine { c: Connection, me: Me, dir: PathBuf }
fn machine(name: &str, key: &str) -> Machine {
    let dir = tmp(name);
    let c = db::open(&dir.join("so-du-an.db")).unwrap();
    ensure(&c).unwrap();
    db::kv_set(&c, "data_dir", &dir.to_string_lossy()).unwrap();
    let (info, sk) = license::verify(key).unwrap();
    let me = Me { serial: info.serial, director: info.director, role: info.role.into(), name: name.into(), machine: String::new(), lic_key: key.into(), gd_sk: sk };
    Machine { c, me, dir }
}
fn ch(coll: &str, id: &str, data: Value) -> Change { Change { coll: coll.into(), id: id.into(), data: Some(data), label: String::new() } }
fn get(m: &Machine, coll: &str, id: &str) -> Value { data_of(&m.c, coll, id) }
fn edit(m: &mut Machine, coll: &str, id: &str, f: &str, v: Value) -> Outcome {
    let mut d = get(m, coll, id);
    d[f] = v;
    local_apply(&mut m.c, &m.me, &[ch(coll, id, d)], false).unwrap()
}
fn sync(m: &mut Machine) -> PullResult { push(&m.c, &m.me).unwrap(); let r = pull(&mut m.c, &m.me).unwrap(); push(&m.c, &m.me).unwrap(); r }

#[test]
fn nhieu_may_dong_bo_duyet_khoa_xoa() {
    master();
    let gd_key = license::issue_director(&[7u8; 32], "2030-01-01", "").unwrap();
    let (tn_key, tn_serial) = license::issue_sub(&gd_key, Role::TN, "2030-01-01", "").unwrap();
    let (nv_key, _) = license::issue_sub(&gd_key, Role::NV, "2030-01-01", "").unwrap();
    let root = tmp("drive");
    let mut gd = machine("Dung", &gd_key);
    let mut tn = machine("Hung", &tn_key);
    let mut nv = machine("Lan", &nv_key);

    // Dữ liệu có sẵn trên máy Giám đốc trước khi lập nhóm, kèm một tệp đính kèm.
    std::fs::create_dir_all(gd.dir.join("files")).unwrap();
    std::fs::write(gd.dir.join("files/ab-hd.pdf"), b"%PDF hop dong").unwrap();
    local_apply(&mut gd.c, &gd.me, &[
        ch("duAnList", "D1", json!({"id": "D1", "ten": "Trường học A"})),
        ch("goiThau", "G1", json!({"id": "G1", "da": "D1", "ten": "Xây lắp", "gt": 1000, "tep": "files/ab-hd.pdf"})),
        ch("congViec", "C1", json!({"id": "C1", "gt": "G1", "ten": "Đổ móng", "tt": "Chưa", "hh": "2026-12-01"})),
    ], false).unwrap();

    assert_eq!(gd_connect(&mut gd.c, &gd.me, &root, "ITD").unwrap(), "created");
    // Máy nhân viên có dữ liệu riêng từ trước: bị thay bằng dữ liệu nhóm.
    local_apply(&mut tn.c, &tn.me, &[ch("duAnList", "X", json!({"id": "X", "ten": "rác"}))], false).unwrap();
    staff_connect(&mut tn.c, &tn.me, &root).unwrap();
    staff_connect(&mut nv.c, &nv.me, &root).unwrap();
    assert_eq!(lock_state(&tn.c, &tn.me), "wait");
    assert!(get(&tn, "duAnList", "X").is_null());

    // Giám đốc nhận hai máy vào nhóm.
    let r = sync(&mut gd);
    assert_eq!(r.accepted.len(), 2);
    sync(&mut tn);
    sync(&mut nv);
    assert_eq!(lock_state(&tn.c, &tn.me), "");
    assert_eq!(eff_role(&tn.c, &tn.me), "TN");
    assert_eq!(get(&tn, "goiThau", "G1")["ten"], "Xây lắp");
    assert_eq!(std::fs::read(tn.dir.join("files/ab-hd.pdf")).unwrap(), b"%PDF hop dong");

    // Trưởng nhóm sửa tiến độ: mặc định phải chờ Giám đốc duyệt.
    let o = edit(&mut tn, "congViec", "C1", "tt", json!("Đang làm"));
    assert_eq!((o.direct, o.proposed), (0, 1));
    assert_eq!(get(&tn, "congViec", "C1")["tt"], "Chưa");
    let ph = o.phieu.unwrap();
    // Nhân viên không có quyền sửa giá trị hợp đồng.
    let o = edit(&mut nv, "goiThau", "G1", "gt", json!(5));
    assert_eq!(o.denied.len(), 1);
    sync(&mut tn);
    sync(&mut gd);
    assert_eq!(get(&gd, "phieu", &ph)["status"], "cho");
    assert_eq!(decide(&mut gd.c, &gd.me, &ph, &[0], true, "ok").unwrap(), 1);
    sync(&mut gd);
    sync(&mut tn);
    assert_eq!(get(&tn, "congViec", "C1")["tt"], "Đang làm");
    assert_eq!(get(&tn, "phieu", &ph)["status"], "dongy");

    // Giám đốc cấp toàn quyền tiến độ cho riêng Trưởng nhóm, trong dự án D1.
    let mut rights = Rights::default();
    rights.grants.push(Grant { who: tn_serial.clone(), scope: "D1".into(), data: "tiendo".into(), lv: "n".into(), from: String::new(), to: String::new(), on: true });
    gd_save(&gd.c, &gd.me, &[], Some(rights.clone()), None).unwrap();
    sync(&mut tn);
    let o = edit(&mut tn, "congViec", "C1", "tt", json!("Xong"));
    assert_eq!((o.direct, o.proposed), (1, 0));
    // Hạn hoàn thành vẫn phải duyệt.
    let o = edit(&mut tn, "congViec", "C1", "hh", json!("2027-01-01"));
    assert_eq!(o.proposed, 1);
    sync(&mut tn);
    let r = sync(&mut gd);
    assert_eq!(r.late, 0);
    assert_eq!(get(&gd, "congViec", "C1")["tt"], "Xong");
    assert_eq!(get(&gd, "congViec", "C1")["hh"], "2026-12-01");

    // Hai máy cùng sửa một trường: bản sửa sau cùng thắng, ở cả hai máy.
    edit(&mut tn, "congViec", "C1", "notes", json!("TN ghi"));
    std::thread::sleep(std::time::Duration::from_millis(5));
    edit(&mut gd, "congViec", "C1", "notes", json!("GĐ ghi"));
    sync(&mut tn); sync(&mut gd); sync(&mut tn);
    assert_eq!(get(&tn, "congViec", "C1")["notes"], "GĐ ghi");
    assert_eq!(get(&gd, "congViec", "C1")["notes"], "GĐ ghi");

    // Đổi vai trò: Lan lên Trưởng nhóm.
    let nv_serial = nv.me.serial.clone();
    gd_save(&gd.c, &gd.me, &[MemberEdit { serial: nv_serial.clone(), role: "TN".into(), status: "active".into(), eff_date: String::new() }], None, None).unwrap();
    sync(&mut nv);
    assert_eq!(eff_role(&nv.c, &nv.me), "TN");

    // Khóa máy Hùng. Hùng chưa nhận được lệnh khóa, vẫn sửa: máy Giám đốc chuyển thành phiếu sửa muộn.
    gd_save(&gd.c, &gd.me, &[MemberEdit { serial: tn_serial.clone(), role: "TN".into(), status: "lock".into(), eff_date: String::new() }], None, None).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    edit(&mut tn, "congViec", "C1", "tt", json!("Làm lại"));
    push(&tn.c, &tn.me).unwrap();
    let r = sync(&mut gd);
    assert_eq!(r.late, 1);
    assert_eq!(get(&gd, "congViec", "C1")["tt"], "Xong");
    let late = db::all_records(&gd.c).unwrap().into_iter().find(|r| r.coll == "phieu" && r.data["kind"] == "late").unwrap();
    decide(&mut gd.c, &gd.me, &late.id, &[], false, "không nhận").unwrap();
    sync(&mut gd);
    pull(&mut tn.c, &tn.me).unwrap();
    assert_eq!(lock_state(&tn.c, &tn.me), "lock");
    pull(&mut nv.c, &nv.me).unwrap();
    assert_eq!(get(&nv, "congViec", "C1")["tt"], "Xong");

    // Xóa máy Hùng: dữ liệu trên máy bị xóa sạch, khóa nhóm được thay.
    gd_save(&gd.c, &gd.me, &[MemberEdit { serial: tn_serial.clone(), role: "TN".into(), status: "off".into(), eff_date: String::new() }], None, None).unwrap();
    let r = pull(&mut tn.c, &tn.me).unwrap();
    assert_eq!(r.lock, "off");
    assert_eq!(lock_state(&tn.c, &tn.me), "off");
    assert!(db::all_records(&tn.c).unwrap().is_empty());
    assert!(!tn.dir.join("files/ab-hd.pdf").exists());
    assert_eq!(team_now(&gd.c).unwrap().keyver, 2);
    // Lan vẫn làm việc bình thường với khóa mới.
    edit(&mut gd, "duAnList", "D1", "ten", json!("Trường học A mở rộng"));
    sync(&mut gd); sync(&mut nv);
    assert_eq!(get(&nv, "duAnList", "D1")["ten"], "Trường học A mở rộng");

    // Máy Giám đốc cài lại, kết nối lại thư mục cũ: lấy lại toàn bộ dữ liệu.
    let mut gd2 = machine("Dung", &gd_key);
    assert_eq!(gd_connect(&mut gd2.c, &gd2.me, &root, "ITD").unwrap(), "reconnect");
    assert_eq!(get(&gd2, "duAnList", "D1")["ten"], "Trường học A mở rộng");
    assert_eq!(get(&gd2, "congViec", "C1")["tt"], "Xong");

    for m in [&gd, &tn, &nv, &gd2] { let _ = std::fs::remove_dir_all(&m.dir); }
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn an_truong_tai_chinh_voi_nhan_vien() {
    master();
    let gd_key = license::issue_director(&[7u8; 32], "2030-01-01", "").unwrap();
    let (nv_key, _) = license::issue_sub(&gd_key, Role::NV, "2030-01-01", "").unwrap();
    let root = tmp("drive2");
    let mut gd = machine("Dung", &gd_key);
    let mut nv = machine("Lan", &nv_key);
    local_apply(&mut gd.c, &gd.me, &[ch("goiThau", "G1", json!({"id": "G1", "da": "D1", "ten": "Xây lắp", "gt": 1000}))], false).unwrap();
    gd_connect(&mut gd.c, &gd.me, &root, "ITD").unwrap();
    staff_connect(&mut nv.c, &nv.me, &root).unwrap();
    sync(&mut gd);
    let mut rights = Rights::default();
    rights.grants.push(Grant { who: "NV".into(), scope: "all".into(), data: "tc".into(), lv: "h".into(), from: String::new(), to: String::new(), on: true });
    gd_save(&gd.c, &gd.me, &[], Some(rights), None).unwrap();
    sync(&mut nv);
    let mut all = db::load_all(&nv.c).unwrap();
    visible(&nv.c, &nv.me, &mut all);
    let g = &all["goiThau"][0];
    assert_eq!(g["ten"], "Xây lắp");
    assert!(g.get("gt").is_none());
    // Lưu bản ghi thiếu trường bị ẩn không làm mất trường đó.
    let o = local_apply(&mut nv.c, &nv.me, &[ch("goiThau", "G1", g.clone())], false).unwrap();
    assert_eq!((o.direct, o.proposed, o.denied.len()), (0, 0, 0));
    assert_eq!(get(&nv, "goiThau", "G1")["gt"], 1000);
    let _ = std::fs::remove_dir_all(&gd.dir); let _ = std::fs::remove_dir_all(&nv.dir); let _ = std::fs::remove_dir_all(&root);
}
