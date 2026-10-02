use std::sync::OnceLock;

#[derive(serde::Serialize, Clone)]
pub(crate) struct ApiResult {
    status: u16,
    body: String,
}

fn get_api_target() -> &'static str {
    static TARGET: OnceLock<String> = OnceLock::new();
    TARGET.get_or_init(|| {
        std::env::var("API_TARGET")
            .unwrap_or_else(|_| "http://localhost:8080".to_string())
    })
}

fn strip_api_prefix(path: &str) -> String {
    path.strip_prefix("/api/")
        .or_else(|| path.strip_prefix("api/"))
        .map(|suffix| format!("/{suffix}"))
        .unwrap_or_else(|| path.to_string())
}

#[tauri::command]
pub(crate) async fn api_request(
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
        _ => return Err(format!("Unsupported HTTP method: {method}")),
    };

    let request_builder = if let Some(ref body_str) = body {
        request_builder
            .header("Content-Type", "application/json")
            .body(body_str.clone())
    } else {
        request_builder
    };

    let response = request_builder.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let response_body = response.text().await.map_err(|error| error.to_string())?;

    Ok(ApiResult {
        status,
        body: response_body,
    })
}
