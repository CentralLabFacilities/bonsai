use std::collections::BTreeMap;
use std::sync::OnceLock;

use tauri::State;

use crate::core::editor_export::EditorExportRequestDto;
use crate::workspace::execution::RuntimeWorkflowStaging;

#[derive(serde::Serialize, Clone)]
pub(crate) struct ApiResult {
    status: u16,
    body: String,
    headers: BTreeMap<String, String>,
}

fn get_api_target() -> &'static str {
    static TARGET: OnceLock<String> = OnceLock::new();
    TARGET.get_or_init(|| {
        std::env::var("API_TARGET").unwrap_or_else(|_| "http://localhost:8080".to_string())
    })
}

fn strip_api_prefix(path: &str) -> String {
    path.strip_prefix("/api/")
        .or_else(|| path.strip_prefix("api/"))
        .map(|suffix| format!("/{suffix}"))
        .unwrap_or_else(|| path.to_string())
}

fn api_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

async fn read_api_response(response: reqwest::Response) -> Result<ApiResult, String> {
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .keys()
        .map(|name| {
            let values = response
                .headers()
                .get_all(name)
                .iter()
                .map(|value| {
                    value
                        .as_bytes()
                        .iter()
                        .copied()
                        .map(char::from)
                        .collect::<String>()
                })
                .collect::<Vec<_>>()
                .join(", ");
            (name.as_str().to_string(), values)
        })
        .collect();
    let body = response.text().await.map_err(|error| error.to_string())?;
    Ok(ApiResult {
        status,
        body,
        headers,
    })
}

#[tauri::command]
pub(crate) async fn api_request(
    method: String,
    path: String,
    body: Option<String>,
) -> Result<ApiResult, String> {
    let clean_path = strip_api_prefix(&path);
    let url = format!("{}{}", get_api_target().trim_end_matches('/'), clean_path);
    let client = api_client();

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

    let response = request_builder
        .send()
        .await
        .map_err(|error| error.to_string())?;
    read_api_response(response).await
}

#[tauri::command]
pub(crate) async fn load_runtime_workflow(
    request: EditorExportRequestDto,
    path_to_config: String,
    include_mapping: BTreeMap<String, String>,
    force_configure: bool,
    current_file_path: Option<String>,
    staging: State<'_, RuntimeWorkflowStaging>,
) -> Result<ApiResult, String> {
    staging
        .load(
            &request,
            path_to_config,
            include_mapping,
            force_configure,
            current_file_path.as_deref(),
            |data| async move {
                let url = format!("{}/bonsai/load", get_api_target().trim_end_matches('/'));
                let response = api_client()
                    .post(url)
                    .json(&data)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;
                read_api_response(response).await
            },
        )
        .await
}
