//! Đọc bản quét (PDF, ảnh) bằng AI để GỢI Ý thông tin. Người dùng xem, sửa và bấm xác nhận
//! thì phần mềm mới ghi vào dữ liệu. Hỗ trợ Claude (Anthropic), Gemini (Google), ChatGPT (OpenAI).
use serde_json::{json, Value};
use std::time::Duration;

type R<T> = Result<T, String>;

pub fn default_model(provider: &str) -> &'static str {
    match provider { "gemini" => "gemini-2.5-pro", "openai" => "gpt-4.1", _ => "claude-opus-5-5" }
}

pub fn mime_of(name: &str) -> Option<&'static str> {
    let n = name.to_lowercase();
    if n.ends_with(".pdf") { Some("application/pdf") }
    else if n.ends_with(".png") { Some("image/png") }
    else if n.ends_with(".jpg") || n.ends_with(".jpeg") { Some("image/jpeg") }
    else if n.ends_with(".webp") { Some("image/webp") }
    else { None }
}

const PROMPT: &str = r#"Bạn là trợ lý nhập liệu cho phần mềm quản lý dự án xây dựng (tư vấn quản lý dự án). Đọc văn bản đính kèm (bản quét hoặc ảnh chụp, tiếng Việt) và trích thông tin.

Danh sách dự án và gói thầu đang có (dùng để đoán văn bản thuộc gói nào):
{CTX}

Trả về DUY NHẤT một đối tượng JSON, không kèm giải thích, theo mẫu:
{
  "loai": "hopdong | phuluc | tamung | nghiemthu | thanhtoan | bienbanhop | congvan | bangiao | baohanh | quyettoan | khac",
  "tieuDe": "tên ngắn của văn bản",
  "tomTat": "tóm tắt 1-2 câu",
  "gt": "mã id gói thầu trong danh sách nếu xác định được, không thì để trống",
  "doTinCay": 0.0,
  "truong": {
    "so": "số văn bản / số hợp đồng",
    "ngay": "YYYY-MM-DD (ngày ký hoặc ngày lập)",
    "giaTri": 0,
    "dot": 0,
    "nhaThau": "tên nhà thầu hoặc bên B",
    "chungTu": "số chứng từ, ủy nhiệm chi",
    "diaDiem": "",
    "benGiao": "",
    "benNhan": "",
    "noiDung": "nội dung chính, trích yếu"
  }
}
Quy tắc: số tiền ghi bằng số nguyên đồng (không dấu chấm), ngày theo YYYY-MM-DD. Trường nào không thấy thì để trống hoặc 0. Không đoán bừa: doTinCay từ 0 đến 1 thể hiện mức chắc chắn về loại văn bản và gói thầu."#;

fn agent() -> ureq::Agent { ureq::AgentBuilder::new().timeout(Duration::from_secs(240)).build() }

fn http_err(provider: &str, e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body: Value = resp.into_json().unwrap_or(Value::Null);
            let msg = body["error"]["message"].as_str().or(body["error"].as_str()).or(body[0]["error"]["message"].as_str()).unwrap_or("").to_string();
            let hint = match code {
                400 => "Yêu cầu không hợp lệ (tên mô hình sai, hoặc tệp quá lớn/không đọc được)",
                401 | 403 => "Khóa API sai hoặc không có quyền",
                404 => "Không thấy mô hình, kiểm tra lại tên mô hình",
                413 => "Tệp quá lớn",
                429 => "Vượt hạn mức hoặc hết tiền trong tài khoản AI",
                500..=599 => "Máy chủ AI đang bận, thử lại sau",
                _ => "Lỗi khi gọi AI",
            };
            format!("{} ({} {}): {}", hint, provider, code, msg)
        }
        ureq::Error::Transport(t) => format!("Không kết nối được tới {}: {}", provider, t),
    }
}

fn first_json(text: &str) -> R<Value> {
    if let Ok(v) = serde_json::from_str::<Value>(text.trim()) { return Ok(v); }
    let (a, b) = (text.find('{'), text.rfind('}'));
    match (a, b) {
        (Some(a), Some(b)) if b > a => serde_json::from_str(&text[a..=b]).map_err(|_| "AI trả kết quả không đúng dạng, thử lại".to_string()),
        _ => Err("AI không trả kết quả, thử lại".into()),
    }
}

/// Gọi AI với một tệp. `ctx` là danh sách dự án, gói thầu dạng văn bản.
pub fn scan(provider: &str, key: &str, model: &str, name: &str, bytes: &[u8], ctx: &str) -> R<Value> {
    if key.trim().is_empty() { return Err("Chưa nhập khóa API. Vào Cài đặt > AI quét tài liệu.".into()); }
    let mime = mime_of(name).ok_or("Chỉ quét được tệp PDF hoặc ảnh (PNG, JPG, WEBP)")?;
    if bytes.len() > 30 * 1024 * 1024 { return Err("Tệp lớn hơn 30 MB, hãy tách nhỏ hoặc giảm độ phân giải".into()); }
    let data = crate::team::b64(bytes);
    let prompt = PROMPT.replace("{CTX}", ctx);
    let model = if model.trim().is_empty() { default_model(provider) } else { model.trim() };
    let a = agent();
    let text = match provider {
        "gemini" => {
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent", model);
            let body = json!({"contents": [{"role": "user", "parts": [{"inline_data": {"mime_type": mime, "data": data}}, {"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"}});
            let v: Value = a.post(&url).set("x-goog-api-key", key.trim()).send_json(body).map_err(|e| http_err("Gemini", e))?.into_json().map_err(|e| e.to_string())?;
            v["candidates"][0]["content"]["parts"].as_array().map(|p| p.iter().filter_map(|x| x["text"].as_str()).collect::<String>()).unwrap_or_default()
        }
        "openai" => {
            let part = if mime == "application/pdf" {
                json!({"type": "file", "file": {"filename": name, "file_data": format!("data:{mime};base64,{data}")}})
            } else {
                json!({"type": "image_url", "image_url": {"url": format!("data:{mime};base64,{data}")}})
            };
            let body = json!({"model": model, "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": [part, {"type": "text", "text": prompt}]}]});
            let v: Value = a.post("https://api.openai.com/v1/chat/completions").set("Authorization", &format!("Bearer {}", key.trim()))
                .send_json(body).map_err(|e| http_err("ChatGPT", e))?.into_json().map_err(|e| e.to_string())?;
            v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string()
        }
        _ => {
            let block = if mime == "application/pdf" {
                json!({"type": "document", "source": {"type": "base64", "media_type": mime, "data": data}})
            } else {
                json!({"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}})
            };
            let body = json!({"model": model, "max_tokens": 4096, "messages": [{"role": "user", "content": [block, {"type": "text", "text": prompt}]}]});
            let v: Value = a.post("https://api.anthropic.com/v1/messages").set("x-api-key", key.trim()).set("anthropic-version", "2023-06-01")
                .send_json(body).map_err(|e| http_err("Claude", e))?.into_json().map_err(|e| e.to_string())?;
            v["content"].as_array().map(|p| p.iter().filter(|x| x["type"] == "text").filter_map(|x| x["text"].as_str()).collect::<String>()).unwrap_or_default()
        }
    };
    first_json(&text)
}

/// Kiểm tra khóa API bằng một câu hỏi ngắn.
pub fn test(provider: &str, key: &str, model: &str) -> R<String> {
    if key.trim().is_empty() { return Err("Chưa nhập khóa API".into()); }
    let model = if model.trim().is_empty() { default_model(provider) } else { model.trim() };
    let a = agent();
    let q = "Trả lời đúng một từ: OK";
    match provider {
        "gemini" => {
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent", model);
            a.post(&url).set("x-goog-api-key", key.trim()).send_json(json!({"contents": [{"role": "user", "parts": [{"text": q}]}]})).map_err(|e| http_err("Gemini", e))?;
        }
        "openai" => {
            a.post("https://api.openai.com/v1/chat/completions").set("Authorization", &format!("Bearer {}", key.trim()))
                .send_json(json!({"model": model, "messages": [{"role": "user", "content": q}]})).map_err(|e| http_err("ChatGPT", e))?;
        }
        _ => {
            a.post("https://api.anthropic.com/v1/messages").set("x-api-key", key.trim()).set("anthropic-version", "2023-06-01")
                .send_json(json!({"model": model, "max_tokens": 16, "messages": [{"role": "user", "content": q}]})).map_err(|e| http_err("Claude", e))?;
        }
    }
    Ok(format!("Kết nối được, mô hình {model}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn doc_json_tu_cau_tra_loi() {
        assert_eq!(first_json("```json\n{\"loai\":\"hopdong\"}\n```").unwrap()["loai"], "hopdong");
        assert!(first_json("không có").is_err());
        assert_eq!(mime_of("A.PDF"), Some("application/pdf"));
    }
}
