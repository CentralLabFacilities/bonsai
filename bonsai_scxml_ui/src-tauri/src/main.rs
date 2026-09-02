use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

fn get_api_target() -> &'static str {
    static TARGET: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    TARGET.get_or_init(|| {
        std::env::var("API_TARGET").unwrap_or("http://localhost:8080".to_string())
    })
}

fn strip_api_prefix(path: &str) -> String {
    path.strip_prefix("/api/")
        .or_else(|| path.strip_prefix("api/"))
        .map(|s| format!("/{}", s))
        .unwrap_or_else(|| path.to_string())
}

#[tauri::command]
async fn api_request(
  method: String,
  path: String,
  body: Option<String>,
) -> Result<ApiResult, String> {
  let clean_path = strip_api_prefix(&path);
  let url = format!("{}{}", get_api_target(), clean_path);
  let client = reqwest::Client::new();

  let request_builder = match method.to_uppercase().as_str() {
    "GET" => client.get(&url),
    "POST" => client.post(&url),
    "PUT" => client.put(&url),
    "DELETE" => client.delete(&url),
    _ => return Err(format!("Unsupported HTTP method: {}", method)),
  };

  let request_builder = if let Some(ref body_str) = body {
    request_builder
      .header("Content-Type", "application/json")
      .body(body_str.clone())
  } else {
    request_builder
  };

  let response = match request_builder.send().await {
    Ok(resp) => resp,
    Err(e) => return Err(e.to_string()),
  };

  let status = response.status().as_u16();
  let response_body = response.text().await.map_err(|e| e.to_string())?;

  Ok(ApiResult {
    status,
    body: response_body,
  })
}

#[derive(serde::Serialize, Clone)]
struct ApiResult {
  status: u16,
  body: String,
}

#[tauri::command]
async fn open_file(
  app: tauri::AppHandle,
  title: Option<String>,
) -> Result<Option<String>, String> {
  let title = title.unwrap_or_else(|| "Open Workflow".to_string());

  let file = app.dialog().file()
    .set_title(&title)
    .add_filter("Workflow Files", &["xml", "scxml"])
    .blocking_pick_file();

  Ok(file.and_then(|f| f.as_path().map(|p| p.to_string_lossy().to_string())))
}

#[tauri::command]
async fn save_file(
  app: tauri::AppHandle,
  content: String,
  path: Option<String>,
  title: Option<String>,
) -> Result<SaveResult, String> {
  let title = title.unwrap_or_else(|| "Save Workflow".to_string());

  if let Some(save_path) = path {
    // Direct save to existing file (no dialog)
    match std::fs::write(&save_path, content.as_bytes()) {
      Ok(_) => Ok(SaveResult {
        success: true,
        path: save_path.clone(),
        file_name: PathBuf::from(&save_path).file_name()
          .map(|n| n.to_string_lossy().to_string())
          .unwrap_or_default(),
      }),
      Err(e) => Err(e.to_string()),
    }
  } else {
    // Save as dialog
    let file = app.dialog().file()
      .set_title(&title)
      .add_filter("Workflow Files", &["xml", "scxml"])
      .set_file_name("workflow.xml")
      .blocking_save_file();

    match file.and_then(|f| f.as_path().map(|p| p.to_string_lossy().to_string())) {
      Some(save_path) => match std::fs::write(&save_path, content.as_bytes()) {
        Ok(_) => Ok(SaveResult {
          success: true,
          path: save_path.clone(),
          file_name: PathBuf::from(&save_path).file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        }),
        Err(e) => Err(e.to_string()),
      },
      None => Ok(SaveResult {
        success: false,
        path: String::new(),
        file_name: String::new(),
      }),
    }
  }
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Clone)]
struct SaveResult {
  success: bool,
  path: String,
  file_name: String,
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![api_request, open_file, save_file, read_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
