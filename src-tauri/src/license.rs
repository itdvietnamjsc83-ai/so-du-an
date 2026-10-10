//! Key kích hoạt: chữ ký Ed25519, kiểm tra offline bằng khóa gốc cố định.
//!
//! Khóa gốc (MASTER_PUB) cố định trong bộ cài và không bao giờ đổi.
//! Key Giám đốc = chứng nhận do khóa gốc ký + khóa con để Giám đốc cấp key
//! cho Trưởng nhóm và Nhân viên ngay trong phần mềm.
use data_encoding::BASE32_NOPAD;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};

/// Khóa kiểm tra cố định. Thay bằng khóa công khai do `sda-keygen init` tạo, một lần duy nhất.
pub const MASTER_PUB_HEX: &str = include_str!("master_pub.txt");

const EPOCH: (i32, u32, u32) = (2024, 1, 1);
const CERT_LEN: usize = 1 + 1 + 2 + 6 + 32 + 64;
const SUB_LEN: usize = 1 + 1 + 2 + 6 + 4 + 64;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role { GD, TN, NV }

impl Role {
    pub fn code(self) -> &'static str { match self { Role::GD => "GD", Role::TN => "TN", Role::NV => "NV" } }
    fn byte(self) -> u8 { match self { Role::GD => 0, Role::TN => 1, Role::NV => 2 } }
    fn from_byte(b: u8) -> Option<Role> { match b { 0 => Some(Role::GD), 1 => Some(Role::TN), 2 => Some(Role::NV), _ => None } }
    pub fn from_code(s: &str) -> Option<Role> { match s { "GD" => Some(Role::GD), "TN" => Some(Role::TN), "NV" => Some(Role::NV), _ => None } }
}

#[derive(Serialize, Clone, Debug)]
pub struct KeyInfo {
    pub role: &'static str,
    pub exp: String,
    pub machine: String,
    pub serial: String,
    pub director: String,
    pub can_issue: bool,
}

fn epoch() -> chrono::NaiveDate { chrono::NaiveDate::from_ymd_opt(EPOCH.0, EPOCH.1, EPOCH.2).unwrap() }
fn days_to_date(d: u16) -> String { (epoch() + chrono::Duration::days(d as i64)).format("%Y-%m-%d").to_string() }
pub fn date_to_days(s: &str) -> Result<u16, String> {
    let d = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| "Ngày không hợp lệ".to_string())?;
    let n = (d - epoch()).num_days();
    if !(0..=65535).contains(&n) { return Err("Ngày ngoài phạm vi".into()); }
    Ok(n as u16)
}

pub fn master_pub() -> Result<VerifyingKey, String> {
    let bytes = data_encoding::HEXLOWER.decode(MASTER_PUB_HEX.trim().as_bytes()).map_err(|_| "Khóa gốc trong bộ cài bị hỏng".to_string())?;
    let arr: [u8; 32] = bytes.try_into().map_err(|_| "Khóa gốc sai độ dài".to_string())?;
    VerifyingKey::from_bytes(&arr).map_err(|_| "Khóa gốc không hợp lệ".to_string())
}

/// Mã máy: 6 byte đầu của SHA-256(machine-uid), hiển thị dạng XXXX-XXXX-XX.
pub fn machine_bytes() -> [u8; 6] {
    let id = machine_uid::get().unwrap_or_else(|_| "unknown-machine".into());
    let h = Sha256::digest(format!("so-du-an:{id}").as_bytes());
    let mut m = [0u8; 6];
    m.copy_from_slice(&h[..6]);
    m
}
pub fn fmt_machine(m: &[u8; 6]) -> String {
    if m == &[0u8; 6] { return String::new(); }
    let s = BASE32_NOPAD.encode(m); // 10 ký tự
    format!("{}-{}-{}", &s[0..4], &s[4..8], &s[8..10])
}
pub fn parse_machine(s: &str) -> Result<[u8; 6], String> {
    let t: String = s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase();
    if t.is_empty() { return Ok([0u8; 6]); }
    let mut padded = t.clone();
    while padded.len() % 8 != 0 { padded.push('='); }
    let b = data_encoding::BASE32.decode(padded.as_bytes()).map_err(|_| "Mã máy không hợp lệ".to_string())?;
    if b.len() != 6 { return Err("Mã máy không hợp lệ".into()); }
    let mut m = [0u8; 6];
    m.copy_from_slice(&b);
    Ok(m)
}

fn fmt_key(prefix: &str, bytes: &[u8]) -> String {
    let b = BASE32_NOPAD.encode(bytes);
    let groups: Vec<&str> = b.as_bytes().chunks(5).map(|c| std::str::from_utf8(c).unwrap()).collect();
    format!("SDA-{prefix}-{}", groups.join("-"))
}
fn parse_key(key: &str) -> Result<(Role, Vec<u8>), String> {
    let k: String = key.split_whitespace().collect::<String>().to_uppercase();
    let rest = k.strip_prefix("SDA-").ok_or("Key phải bắt đầu bằng SDA-")?;
    let (code, body) = rest.split_once('-').ok_or("Key không đúng dạng")?;
    let role = Role::from_code(code).ok_or("Vai trò trong key không đúng")?;
    let body: String = body.chars().filter(|c| *c != '-').collect();
    let bytes = BASE32_NOPAD.decode(body.as_bytes()).map_err(|_| "Key có ký tự sai, kiểm tra lại".to_string())?;
    Ok((role, bytes))
}

struct Cert { exp: u16, machine: [u8; 6], sub_pub: VerifyingKey }

fn read_cert(b: &[u8]) -> Result<Cert, String> {
    if b.len() < CERT_LEN || b[0] != 1 || b[1] != Role::GD.byte() { return Err("Chứng nhận Giám đốc không hợp lệ".into()); }
    let sig = Signature::from_slice(&b[42..106]).map_err(|_| "Chữ ký hỏng")?;
    master_pub()?.verify(&b[..42], &sig).map_err(|_| "Key không do nhà cung cấp cấp, hoặc đã bị sửa".to_string())?;
    let exp = u16::from_be_bytes([b[2], b[3]]);
    let mut machine = [0u8; 6];
    machine.copy_from_slice(&b[4..10]);
    let sp: [u8; 32] = b[10..42].try_into().unwrap();
    Ok(Cert { exp, machine, sub_pub: VerifyingKey::from_bytes(&sp).map_err(|_| "Khóa con hỏng")? })
}

/// Kiểm tra key, trả thông tin. Không kiểm tra hạn và máy (để báo lỗi rõ ràng ở lớp trên).
pub fn verify(key: &str) -> Result<(KeyInfo, Option<[u8; 32]>), String> {
    let (role, b) = parse_key(key)?;
    let cert = read_cert(&b)?;
    let director = data_encoding::HEXLOWER.encode(&Sha256::digest(&b[..CERT_LEN])[..4]);
    match role {
        Role::GD => {
            if b.len() != CERT_LEN + 32 { return Err("Key Giám đốc sai độ dài".into()); }
            let sk: [u8; 32] = b[CERT_LEN..].try_into().unwrap();
            if SigningKey::from_bytes(&sk).verifying_key() != cert.sub_pub { return Err("Key Giám đốc bị hỏng".into()); }
            Ok((KeyInfo { role: "GD", exp: days_to_date(cert.exp), machine: fmt_machine(&cert.machine), serial: director.clone(), director, can_issue: true }, Some(sk)))
        }
        _ => {
            let s = &b[CERT_LEN..];
            if s.len() != SUB_LEN || s[0] != 1 || Role::from_byte(s[1]) != Some(role) { return Err("Key sai cấu trúc".into()); }
            let sig = Signature::from_slice(&s[14..78]).map_err(|_| "Chữ ký hỏng")?;
            cert.sub_pub.verify(&s[..14], &sig).map_err(|_| "Key không do Giám đốc của đơn vị cấp, hoặc đã bị sửa".to_string())?;
            let exp = u16::from_be_bytes([s[2], s[3]]).min(cert.exp);
            let mut m = [0u8; 6];
            m.copy_from_slice(&s[4..10]);
            let serial = data_encoding::HEXLOWER.encode(&s[10..14]);
            Ok((KeyInfo { role: role.code(), exp: days_to_date(exp), machine: fmt_machine(&m), serial, director, can_issue: false }, None))
        }
    }
}

/// Nhà cung cấp tạo key Giám đốc bằng khóa ký gốc.
pub fn issue_director(master_sk: &[u8; 32], exp: &str, machine: &str) -> Result<String, String> {
    let master = SigningKey::from_bytes(master_sk);
    if master.verifying_key() != master_pub()? { return Err("Tệp khóa gốc không khớp với bộ cài".into()); }
    let sub = SigningKey::generate(&mut OsRng);
    let mut b = vec![1u8, Role::GD.byte()];
    b.extend_from_slice(&date_to_days(exp)?.to_be_bytes());
    b.extend_from_slice(&parse_machine(machine)?);
    b.extend_from_slice(sub.verifying_key().as_bytes());
    let sig = master.sign(&b);
    b.extend_from_slice(&sig.to_bytes());
    b.extend_from_slice(&sub.to_bytes());
    Ok(fmt_key("GD", &b))
}

/// Giám đốc cấp key Trưởng nhóm, Nhân viên bằng khóa con trong key của mình.
pub fn issue_sub(director_key: &str, role: Role, exp: &str, machine: &str) -> Result<(String, String), String> {
    if role == Role::GD { return Err("Giám đốc không cấp được key Giám đốc".into()); }
    let (info, sk) = verify(director_key)?;
    let sk = sk.ok_or("Chỉ key Giám đốc mới cấp được key")?;
    let (_, b) = parse_key(director_key)?;
    let exp_d = date_to_days(exp)?.min(date_to_days(&info.exp)?);
    let mut serial = [0u8; 4];
    OsRng.fill_bytes(&mut serial);
    let mut out = b[..CERT_LEN].to_vec();
    let mut s = vec![1u8, role.byte()];
    s.extend_from_slice(&exp_d.to_be_bytes());
    s.extend_from_slice(&parse_machine(machine)?);
    s.extend_from_slice(&serial);
    let sig = SigningKey::from_bytes(&sk).sign(&s);
    s.extend_from_slice(&sig.to_bytes());
    out.extend_from_slice(&s);
    Ok((fmt_key(role.code(), &out), data_encoding::HEXLOWER.encode(&serial)))
}

pub fn new_master() -> (String, String) {
    let k = SigningKey::generate(&mut OsRng);
    (data_encoding::HEXLOWER.encode(&k.to_bytes()), data_encoding::HEXLOWER.encode(k.verifying_key().as_bytes()))
}

pub fn read_master_file(text: &str) -> Result<[u8; 32], String> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|_| "Tệp khóa gốc không đúng định dạng".to_string())?;
    let hex = v["secret"].as_str().ok_or("Tệp khóa gốc thiếu trường secret")?;
    let b = data_encoding::HEXLOWER.decode(hex.as_bytes()).map_err(|_| "Khóa gốc hỏng".to_string())?;
    b.try_into().map_err(|_| "Khóa gốc sai độ dài".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ma_may_va_ngay() {
        let m = machine_bytes();
        assert_eq!(parse_machine(&fmt_machine(&m)).unwrap(), m);
        assert_eq!(parse_machine("").unwrap(), [0u8; 6]);
        assert!(parse_machine("ABC").is_err());
        assert_eq!(days_to_date(date_to_days("2027-10-10").unwrap()), "2027-10-10");
    }

    #[test]
    fn khoa_goc_trong_bo_cai_hop_le() {
        assert!(master_pub().is_ok());
        assert_ne!(MASTER_PUB_HEX.trim(), "0".repeat(64));
    }

    #[test]
    fn key_sai_bi_tu_choi() {
        assert!(verify("SDA-GD-AAAAA-BBBBB").is_err());
        assert!(verify("không phải key").is_err());
    }
}
