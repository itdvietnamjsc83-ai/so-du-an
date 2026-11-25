//! Nhóm nhiều máy: danh sách nhân viên, vai trò, bảng quyền và khóa mã hóa của nhóm.
//! Máy Giám đốc ký mọi phiên bản bằng khóa con trong key Giám đốc; máy khác chỉ kiểm tra.
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use x25519_dalek::{PublicKey, StaticSecret};

type R<T> = Result<T, String>;

pub fn hex(b: &[u8]) -> String { data_encoding::HEXLOWER.encode(b) }
pub fn unhex(s: &str) -> R<Vec<u8>> { data_encoding::HEXLOWER.decode(s.as_bytes()).map_err(|_| "Dữ liệu hex hỏng".to_string()) }
pub fn arr32(s: &str) -> R<[u8; 32]> { unhex(s)?.try_into().map_err(|_| "Khóa sai độ dài".to_string()) }
pub fn b64(b: &[u8]) -> String { base64::engine::general_purpose::STANDARD.encode(b) }
pub fn unb64(s: &str) -> R<Vec<u8>> { base64::engine::general_purpose::STANDARD.decode(s).map_err(|_| "Dữ liệu base64 hỏng".to_string()) }

pub fn rand32() -> [u8; 32] { let mut k = [0u8; 32]; OsRng.fill_bytes(&mut k); k }

/// Mã hóa đối xứng (XChaCha20-Poly1305). Trả (nonce, bản mã) dạng base64.
pub fn seal(key: &[u8; 32], plain: &[u8]) -> (String, String) {
    let c = XChaCha20Poly1305::new(key.into());
    let mut n = [0u8; 24];
    OsRng.fill_bytes(&mut n);
    let ct = c.encrypt(XNonce::from_slice(&n), plain).expect("mã hóa");
    (b64(&n), b64(&ct))
}
pub fn open(key: &[u8; 32], nonce: &str, ct: &str) -> R<Vec<u8>> {
    let n = unb64(nonce)?;
    if n.len() != 24 { return Err("Nonce sai".into()); }
    XChaCha20Poly1305::new(key.into()).decrypt(XNonce::from_slice(&n), unb64(ct)?.as_ref()).map_err(|_| "Không giải mã được (sai khóa hoặc tệp hỏng)".to_string())
}

/// Gói khóa cho một máy theo khóa công khai X25519 của máy đó.
pub fn wrap(recip: &[u8; 32], plain: &[u8]) -> Value {
    let eph = StaticSecret::random_from_rng(OsRng);
    let eph_pub = PublicKey::from(&eph);
    let shared = eph.diffie_hellman(&PublicKey::from(*recip));
    let k = wrap_key(shared.as_bytes(), eph_pub.as_bytes(), recip);
    let (n, c) = seal(&k, plain);
    json!({"e": hex(eph_pub.as_bytes()), "n": n, "c": c})
}
pub fn unwrap(me: &StaticSecret, v: &Value) -> R<Vec<u8>> {
    let e = arr32(v["e"].as_str().unwrap_or(""))?;
    let my_pub = PublicKey::from(me);
    let shared = me.diffie_hellman(&PublicKey::from(e));
    let k = wrap_key(shared.as_bytes(), &e, my_pub.as_bytes());
    open(&k, v["n"].as_str().unwrap_or(""), v["c"].as_str().unwrap_or(""))
}
fn wrap_key(shared: &[u8], eph: &[u8], recip: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"sda-wrap-v1");
    h.update(shared); h.update(eph); h.update(recip);
    h.finalize().into()
}
/// Khóa riêng để máy Giám đốc tự cất bộ khóa nhóm của mình (khôi phục được khi cài lại).
pub fn gd_store_key(gd_sk: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"sda-gd-keyring-v1");
    h.update(gd_sk);
    h.finalize().into()
}

/// Ký một tài liệu JSON: {"body": ..., "sig": hex}. serde_json giữ khóa theo thứ tự chữ cái nên chuỗi ổn định.
pub fn sign_doc(sk: &SigningKey, body: &Value) -> Value {
    let sig = sk.sign(body.to_string().as_bytes());
    json!({"body": body, "sig": hex(&sig.to_bytes())})
}
pub fn verify_doc(pk: &VerifyingKey, doc: &Value) -> R<Value> {
    let body = doc.get("body").ok_or("Tài liệu thiếu nội dung")?;
    let sig = unhex(doc["sig"].as_str().unwrap_or(""))?;
    let sig = Signature::from_slice(&sig).map_err(|_| "Chữ ký hỏng".to_string())?;
    pk.verify(body.to_string().as_bytes(), &sig).map_err(|_| "Chữ ký không hợp lệ".to_string())?;
    Ok(body.clone())
}
pub fn sign_bytes(sk: &SigningKey, b: &[u8]) -> String { hex(&sk.sign(b).to_bytes()) }
pub fn verify_bytes(pk: &VerifyingKey, b: &[u8], sig: &str) -> bool {
    unhex(sig).ok().and_then(|s| Signature::from_slice(&s).ok()).map(|s| pk.verify(b, &s).is_ok()).unwrap_or(false)
}
pub fn vk(hexpub: &str) -> R<VerifyingKey> { VerifyingKey::from_bytes(&arr32(hexpub)?).map_err(|_| "Khóa công khai hỏng".to_string()) }

/* ---------------- tài liệu nhóm ---------------- */

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Member {
    pub serial: String,
    pub name: String,
    #[serde(default)] pub machine: String,
    /// TN hoặc NV
    pub role: String,
    /// active | lock | off
    pub status: String,
    #[serde(default)] pub ed_pub: String,
    #[serde(default)] pub x_pub: String,
    /// Thời điểm (đồng hồ logic) vai trò/trạng thái hiện tại bắt đầu có hiệu lực.
    #[serde(default)] pub eff: i64,
    #[serde(default)] pub joined: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Grant {
    /// số key (máy cụ thể) hoặc "TN" / "NV" (cả vai trò)
    pub who: String,
    /// "all" hoặc id dự án
    pub scope: String,
    /// nhóm dữ liệu hoặc "all" (toàn quyền)
    pub data: String,
    /// n sửa ngay | d đề xuất | x chỉ xem | h ẩn
    pub lv: String,
    #[serde(default)] pub from: String,
    #[serde(default)] pub to: String,
    #[serde(default = "yes")] pub on: bool,
}
fn yes() -> bool { true }

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct LockRow { pub scope: String, #[serde(default)] pub ten: String, pub at: i64 }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Rights {
    /// nhóm -> {"TN": mức, "NV": mức}
    pub rules: BTreeMap<String, BTreeMap<String, String>>,
    #[serde(default)] pub grants: Vec<Grant>,
    #[serde(default)] pub locks: Vec<LockRow>,
}
impl Default for Rights { fn default() -> Self { Rights { rules: default_rules(), grants: vec![], locks: vec![] } } }

/// Các nhóm dữ liệu để phân quyền.
pub const GROUPS: &[(&str, &str)] = &[
    ("tiendo", "Cập nhật tiến độ, ghi chú công việc"),
    ("cv", "Thêm/sửa dự án, gói thầu, công việc, nhà thầu, cuộc họp"),
    ("han", "Đổi hạn hoàn thành"),
    ("hd", "Hợp đồng: số, ngày ký, nhà thầu"),
    ("tc", "Tài chính: giá trị HĐ, tạm ứng, nghiệm thu, thanh toán, bảo hành, quyết toán"),
    ("xoa", "Xóa dự án, gói thầu, bản ghi"),
    ("mau", "Mẫu biên bản dùng chung"),
    ("tl", "Tài liệu của hợp đồng"),
    ("caidat", "Thông tin đơn vị"),
];

pub fn default_rules() -> BTreeMap<String, BTreeMap<String, String>> {
    let mut m = BTreeMap::new();
    for (g, _) in GROUPS {
        let tn = if *g == "caidat" { "x" } else { "d" };
        let nv = if matches!(*g, "tiendo" | "mau" | "tl") { "d" } else { "x" };
        m.insert(g.to_string(), BTreeMap::from([("TN".to_string(), tn.to_string()), ("NV".to_string(), nv.to_string())]));
    }
    m
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Team {
    pub ver: u64,
    pub at: i64,
    pub director: String,
    #[serde(default)] pub company: String,
    #[serde(default)] pub members: Vec<Member>,
    #[serde(default)] pub rights: Rights,
    #[serde(default = "lease")] pub lease_days: u32,
    /// Phiên bản khóa nhóm đang dùng để mã hóa.
    pub keyver: u32,
    /// số key -> bộ khóa nhóm đã gói cho máy đó
    #[serde(default)] pub wraps: BTreeMap<String, Value>,
    /// bộ khóa nhóm máy Giám đốc tự cất
    #[serde(default)] pub gd_ring: Value,
}
fn lease() -> u32 { 7 }

impl Team {
    pub fn member(&self, serial: &str) -> Option<&Member> { self.members.iter().find(|m| m.serial == serial) }
}

/// Bộ khóa: phiên bản -> khóa 32 byte.
pub type Ring = BTreeMap<u32, [u8; 32]>;
pub fn ring_to_json(r: &Ring) -> Vec<u8> {
    serde_json::to_vec(&r.iter().map(|(v, k)| json!({"v": v, "k": hex(k)})).collect::<Vec<_>>()).unwrap()
}
pub fn ring_from_json(b: &[u8]) -> R<Ring> {
    let v: Vec<Value> = serde_json::from_slice(b).map_err(|_| "Bộ khóa hỏng".to_string())?;
    let mut r = Ring::new();
    for x in v { r.insert(x["v"].as_u64().unwrap_or(0) as u32, arr32(x["k"].as_str().unwrap_or(""))?); }
    Ok(r)
}

/// Gói lại bộ khóa cho mọi máy còn trong nhóm (không gói cho máy đã xóa).
pub fn rewrap(t: &mut Team, ring: &Ring, gd_sk: &[u8; 32]) {
    let plain = ring_to_json(ring);
    t.wraps.clear();
    for m in &t.members {
        if m.status == "off" || m.x_pub.is_empty() { continue; }
        if let Ok(x) = arr32(&m.x_pub) { t.wraps.insert(m.serial.clone(), wrap(&x, &plain)); }
    }
    let (n, c) = seal(&gd_store_key(gd_sk), &plain);
    t.gd_ring = json!({"n": n, "c": c});
}

/* ---------------- quyền theo từng trường ---------------- */

/// Nhóm dữ liệu của một trường. "gd" = chỉ Giám đốc. "" = trường kỹ thuật, theo quyền của bản ghi.
pub fn group_of(coll: &str, field: &str) -> &'static str {
    match coll {
        "goiThau" => match field {
            "gt" | "tlThuHoi" | "soNgayTT" | "tamUng" | "bh" | "qt" => "tc",
            "hd" | "ngayKy" | "nt" => "hd",
            _ => "cv",
        },
        "congViec" => match field { "tt" | "xong" | "notes" | "anh" => "tiendo", "hh" => "han", _ => "cv" },
        "deXuat" => "han",
        "nghiemThu" | "thanhToan" => "tc",
        "duAnList" | "nhaThau" | "danhBa" | "thuVien" | "hop" | "banGiao" => "cv",
        "bienBanMau" => "mau",
        "taiLieu" => "tl",
        "caiDat" => "caidat",
        "phieu" => "phieu",
        _ => "gd",
    }
}

/// Ngữ cảnh của một bản ghi để xét quyền theo dự án và khóa sổ.
#[derive(Default, Clone, Debug)]
pub struct Scope { pub da: String, pub gt: String }

pub fn today_str() -> String { chrono::Local::now().format("%Y-%m-%d").to_string() }

/// Mức quyền của một người với một nhóm dữ liệu, tại thời điểm `t`.
/// Trả 'n' sửa ngay, 'd' đề xuất, 'x' chỉ xem, 'h' ẩn.
pub fn mode(team: &Team, serial: &str, role: &str, group: &str, sc: &Scope, t: i64, date: &str) -> char {
    if role == "GD" || serial == team.director { return 'n'; }
    if group == "gd" { return 'x'; }
    if group == "phieu" { return 'n'; }
    let locked = team.rights.locks.iter().any(|l| t >= l.at && !l.scope.is_empty() && (l.scope == sc.da || l.scope == sc.gt));
    let mut best: Option<(u8, char)> = None;
    for g in &team.rights.grants {
        if !g.on || !(g.data == group || g.data == "all") { continue; }
        if !g.from.is_empty() && g.from.as_str() > date { continue; }
        if !g.to.is_empty() && g.to.as_str() < date { continue; }
        let who = if g.who == serial { 2 } else if g.who == role { 0 } else { continue };
        let sco = if g.scope == "all" || g.scope.is_empty() { 0 } else if g.scope == sc.da { 1 } else { continue };
        let spec = who + sco + if g.data == group { 0 } else { 0 };
        let lv = g.lv.chars().next().unwrap_or('x');
        if best.map(|b| spec >= b.0).unwrap_or(true) { best = Some((spec, lv)); }
    }
    let m = best.map(|b| b.1).unwrap_or_else(|| {
        team.rights.rules.get(group).and_then(|r| r.get(role)).and_then(|s| s.chars().next())
            .or_else(|| default_rules().get(group).and_then(|r| r.get(role)).and_then(|s| s.chars().next())).unwrap_or('x')
    });
    if locked && m != 'h' { 'x' } else { m }
}

/// Vai trò thực của một người tại thời điểm t, theo danh sách phiên bản nhóm (cũ → mới).
pub fn role_at<'a>(hist: &'a [Team], serial: &str, t: i64) -> Option<(&'a Team, Option<&'a Member>)> {
    let mut cur: Option<&Team> = None;
    for x in hist { if x.at <= t { cur = Some(x); } }
    let team = cur.or_else(|| hist.first())?;
    Some((team, team.member(serial)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ma_hoa_goi_khoa_va_ky() {
        let k = rand32();
        let (n, c) = seal(&k, b"xin chao");
        assert_eq!(open(&k, &n, &c).unwrap(), b"xin chao");
        assert!(open(&rand32(), &n, &c).is_err());
        let me = StaticSecret::random_from_rng(OsRng);
        let pubk = PublicKey::from(&me);
        let w = wrap(pubk.as_bytes(), b"bo khoa");
        assert_eq!(unwrap(&me, &w).unwrap(), b"bo khoa");
        assert!(unwrap(&StaticSecret::random_from_rng(OsRng), &w).is_err());
        let sk = SigningKey::generate(&mut OsRng);
        let d = sign_doc(&sk, &json!({"b": 1, "a": "x"}));
        assert!(verify_doc(&sk.verifying_key(), &d).is_ok());
        let mut bad = d.clone(); bad["body"]["a"] = json!("y");
        assert!(verify_doc(&sk.verifying_key(), &bad).is_err());
    }

    #[test]
    fn quyen_theo_vai_tro_va_dong_quyen() {
        let mut t = Team { ver: 1, at: 0, director: "gd".into(), company: String::new(), members: vec![], rights: Rights::default(), lease_days: 7, keyver: 1, wraps: BTreeMap::new(), gd_ring: Value::Null };
        let sc = Scope { da: "DA1".into(), gt: "G1".into() };
        assert_eq!(mode(&t, "gd", "GD", "tc", &sc, 5, "2026-11-25"), 'n');
        assert_eq!(mode(&t, "a", "TN", "tc", &sc, 5, "2026-11-25"), 'd');
        assert_eq!(mode(&t, "b", "NV", "tc", &sc, 5, "2026-11-25"), 'x');
        assert_eq!(mode(&t, "b", "NV", "tiendo", &sc, 5, "2026-11-25"), 'd');
        // Toàn quyền cho máy a trong dự án DA1, có thời hạn.
        t.rights.grants.push(Grant { who: "a".into(), scope: "DA1".into(), data: "all".into(), lv: "n".into(), from: "".into(), to: "2026-12-01".into(), on: true });
        assert_eq!(mode(&t, "a", "TN", "tc", &sc, 5, "2026-11-25"), 'n');
        assert_eq!(mode(&t, "a", "TN", "tc", &sc, 5, "2026-12-02"), 'd');
        assert_eq!(mode(&t, "a", "TN", "tc", &Scope { da: "DA2".into(), gt: "".into() }, 5, "2026-11-25"), 'd');
        // Ẩn tài chính với mọi nhân viên.
        t.rights.grants.push(Grant { who: "NV".into(), scope: "all".into(), data: "tc".into(), lv: "h".into(), from: "".into(), to: "".into(), on: true });
        assert_eq!(mode(&t, "b", "NV", "tc", &sc, 5, "2026-11-25"), 'h');
        // Khóa sổ gói G1 từ thời điểm 10: sau đó chỉ xem, kể cả có toàn quyền.
        t.rights.locks.push(LockRow { scope: "G1".into(), ten: "".into(), at: 10 });
        assert_eq!(mode(&t, "a", "TN", "tc", &sc, 9, "2026-11-25"), 'n');
        assert_eq!(mode(&t, "a", "TN", "tc", &sc, 11, "2026-11-25"), 'x');
        assert_eq!(group_of("goiThau", "gt"), "tc");
        assert_eq!(group_of("congViec", "tt"), "tiendo");
        assert_eq!(group_of("keys", "x"), "gd");
    }
}
