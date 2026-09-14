use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

fn get_api_target() -> &'static str {
    static TARGET: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    TARGET.get_or_init(|| {
        std::env::var("API_TARGET")
            .unwrap_or("http://localhost:8080".to_string())
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

    let response = request_builder
        .send()
        .await
        .map_err(|e| e.to_string())?;

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

#[derive(serde::Deserialize, Clone)]
struct BehaviorDirectoryMapping {
    key: String,
    path: String,
}

#[derive(serde::Serialize, Clone)]
struct BehaviorTreeEntry {
    name: String,
    path: String,
    relative_path: String,
    kind: String,
    source: String,
    key: String,
    children: Vec<BehaviorTreeEntry>,
}

#[derive(serde::Serialize, Clone)]
struct SaveResult {
    success: bool,
    path: String,
    file_name: String,
}

#[derive(serde::Serialize, Clone)]
struct WorkflowSourceResult {
    content: String,
    path: String,
    file_name: String,
    root_key: Option<String>,
}

fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
    }

    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }

    PathBuf::from(path)
}

fn normalize_key(key: &str) -> String {
    key.trim().to_uppercase()
}

fn workflow_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("xml")
                || extension.eq_ignore_ascii_case("scxml")
        })
        .unwrap_or(false)
}

fn build_behavior_tree(
    root: &Path,
    directory: &Path,
    key: &str,
) -> Result<Vec<BehaviorTreeEntry>, String> {
    let mut entries = Vec::new();

    let read_dir = std::fs::read_dir(directory).map_err(|error| {
        format!(
            "Could not read behavior directory '{}': {}",
            directory.display(),
            error
        )
    })?;

    for item in read_dir {
        let item = item.map_err(|error| error.to_string())?;
        let file_type = item
            .file_type()
            .map_err(|error| error.to_string())?;

        // Avoid recursive symlink loops.
        if file_type.is_symlink() {
            continue;
        }

        let path = item.path();
        let name = item.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        if file_type.is_dir() {
            let children =
                build_behavior_tree(root, &path, key)?;

            entries.push(BehaviorTreeEntry {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path: relative.clone(),
                kind: "directory".to_string(),
                source: format!(
                    "${{{}}}/{}",
                    key,
                    relative
                ),
                key: key.to_string(),
                children,
            });
        } else if file_type.is_file() && workflow_extension(&path) {
            entries.push(BehaviorTreeEntry {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path: relative.clone(),
                kind: "file".to_string(),
                source: format!(
                    "${{{}}}/{}",
                    key,
                    relative
                ),
                key: key.to_string(),
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(|left, right| {
        let left_dir = left.kind == "directory";
        let right_dir = right.kind == "directory";

        right_dir
            .cmp(&left_dir)
            .then_with(|| {
                left.name
                    .to_lowercase()
                    .cmp(&right.name.to_lowercase())
            })
    });

    Ok(entries)
}

#[tauri::command]
async fn open_file(
    app: tauri::AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let title =
        title.unwrap_or_else(|| "Open Workflow".to_string());

    let file = app
        .dialog()
        .file()
        .set_title(&title)
        .add_filter("Workflow Files", &["xml", "scxml"])
        .blocking_pick_file();

    Ok(file.and_then(|file| {
        file.as_path()
            .map(|path| path.to_string_lossy().to_string())
    }))
}

#[tauri::command]
async fn pick_directory(
    app: tauri::AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let title =
        title.unwrap_or_else(|| "Select Directory".to_string());

    let folder = app
        .dialog()
        .file()
        .set_title(&title)
        .blocking_pick_folder();

    Ok(folder.and_then(|folder| {
        folder
            .as_path()
            .map(|path| path.to_string_lossy().to_string())
    }))
}

#[tauri::command]
async fn list_behavior_directory(
    key: String,
    path: String,
) -> Result<Vec<BehaviorTreeEntry>, String> {
    let key = normalize_key(&key);
    let root = expand_home(&path);

    let canonical_root = root.canonicalize().map_err(|error| {
        format!(
            "Could not open {} directory '{}': {}",
            key,
            root.display(),
            error
        )
    })?;

    if !canonical_root.is_dir() {
        return Err(format!(
            "{} does not point to a directory: {}",
            key,
            canonical_root.display()
        ));
    }

    build_behavior_tree(
        &canonical_root,
        &canonical_root,
        &key,
    )
}

#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    content: String,
    path: Option<String>,
    title: Option<String>,
) -> Result<SaveResult, String> {
    let title =
        title.unwrap_or_else(|| "Save Workflow".to_string());

    if let Some(save_path) = path {
        std::fs::write(&save_path, content.as_bytes())
            .map_err(|error| error.to_string())?;

        return Ok(SaveResult {
            success: true,
            path: save_path.clone(),
            file_name: PathBuf::from(&save_path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default(),
        });
    }

    let file = app
        .dialog()
        .file()
        .set_title(&title)
        .add_filter("Workflow Files", &["xml", "scxml"])
        .set_file_name("workflow.xml")
        .blocking_save_file();

    match file.and_then(|file| {
        file.as_path()
            .map(|path| path.to_string_lossy().to_string())
    }) {
        Some(save_path) => {
            std::fs::write(&save_path, content.as_bytes())
                .map_err(|error| error.to_string())?;

            Ok(SaveResult {
                success: true,
                path: save_path.clone(),
                file_name: PathBuf::from(&save_path)
                    .file_name()
                    .map(|name| {
                        name.to_string_lossy().to_string()
                    })
                    .unwrap_or_default(),
            })
        }
        None => Ok(SaveResult {
            success: false,
            path: String::new(),
            file_name: String::new(),
        }),
    }
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|error| error.to_string())
}

fn parse_library_source(src: &str) -> Option<(String, String)> {
    if !src.starts_with("${") {
        return None;
    }

    let closing = src.find('}')?;
    let key = normalize_key(&src[2..closing]);
    let relative = src[closing + 1..]
        .trim_start_matches(|character| character == '/' || character == '\\')
        .to_string();

    Some((key, relative))
}

fn resolve_workflow_path(
    src: &str,
    directories: &[BehaviorDirectoryMapping],
    current_file_path: Option<&str>,
) -> Result<(PathBuf, Option<String>, Option<PathBuf>), String> {
    let src = src.trim();

    if src.is_empty() {
        return Err(
            "Workflow source path is empty.".to_string()
        );
    }

    if let Some((key, relative)) = parse_library_source(src) {
        let mapping = directories
            .iter()
            .find(|directory| {
                normalize_key(&directory.key) == key
            })
            .ok_or_else(|| {
                format!(
                    "No Behavior Library directory is configured for key {}.",
                    key
                )
            })?;

        let root = expand_home(&mapping.path);
        let candidate = root.join(relative);

        return Ok((
            candidate,
            Some(key),
            Some(root),
        ));
    }

    let source_path = expand_home(src);

    if source_path.is_absolute() {
        return Ok((source_path, None, None));
    }

    if let Some(current) = current_file_path {
        if let Some(parent) = Path::new(current).parent() {
            return Ok((
                parent.join(source_path),
                None,
                None,
            ));
        }
    }

    Err(format!(
        "Cannot resolve workflow source '{}'. The Behavior Library key must be resolved to a local path before opening the file.",
        src
    ))
}

#[tauri::command]
async fn read_workflow_source(
    src: String,
    directories: Vec<BehaviorDirectoryMapping>,
    current_file_path: Option<String>,
) -> Result<WorkflowSourceResult, String> {
    let (candidate, root_key, root_path) =
        resolve_workflow_path(
            &src,
            &directories,
            current_file_path.as_deref(),
        )?;

    let resolved_path =
        candidate.canonicalize().map_err(|error| {
            format!(
                "Could not resolve workflow file '{}': {}",
                candidate.display(),
                error
            )
        })?;

    if let Some(root) = root_path {
        let canonical_root =
            root.canonicalize().map_err(|error| {
                format!(
                    "Could not resolve Behavior Library directory '{}': {}",
                    root.display(),
                    error
                )
            })?;

        if !resolved_path.starts_with(&canonical_root) {
            return Err(format!(
                "Workflow source '{}' is outside its Behavior Library directory.",
                resolved_path.display()
            ));
        }
    }

    let content =
        std::fs::read_to_string(&resolved_path).map_err(
            |error| {
                format!(
                    "Could not read workflow file '{}': {}",
                    resolved_path.display(),
                    error
                )
            },
        )?;

    let file_name = resolved_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(WorkflowSourceResult {
        content,
        path: resolved_path.to_string_lossy().to_string(),
        file_name,
        root_key,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            api_request,
            open_file,
            pick_directory,
            list_behavior_directory,
            save_file,
            read_file,
            read_workflow_source
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
