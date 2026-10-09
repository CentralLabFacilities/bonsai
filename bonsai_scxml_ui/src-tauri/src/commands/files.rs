use std::path::{Path, PathBuf};

use crate::atomic_file::write_atomic;

use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize, Clone)]
pub(crate) struct SaveResult {
    success: bool,
    path: String,
    file_name: String,
}

#[tauri::command]
pub(crate) async fn open_file(
    app: tauri::AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let title = title.unwrap_or_else(|| "Open Workflow".to_string());

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
pub(crate) async fn pick_directory(
    app: tauri::AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let title = title.unwrap_or_else(|| "Select Directory".to_string());

    let folder = app.dialog().file().set_title(&title).blocking_pick_folder();

    Ok(folder.and_then(|folder| {
        folder
            .as_path()
            .map(|path| path.to_string_lossy().to_string())
    }))
}

#[tauri::command]
pub(crate) async fn save_file(
    app: tauri::AppHandle,
    content: String,
    path: Option<String>,
    title: Option<String>,
) -> Result<SaveResult, String> {
    let title = title.unwrap_or_else(|| "Save Workflow".to_string());

    if let Some(save_path) = path {
        write_atomic(Path::new(&save_path), content.as_bytes())
            .map_err(|error| error.to_string())?;

        return Ok(save_result(true, save_path));
    }

    let file = app
        .dialog()
        .file()
        .set_title(&title)
        .add_filter("Workflow Files", &["xml", "scxml"])
        .set_file_name("workflow.xml")
        .blocking_save_file();

    match file {
        Some(file) => {
            let save_path = file.as_path().ok_or_else(|| {
                "Selected save location does not have a local filesystem path.".to_string()
            })?;
            write_atomic(&save_path, content.as_bytes()).map_err(|error| error.to_string())?;
            Ok(save_result(true, save_path.to_string_lossy().to_string()))
        }
        None => Ok(SaveResult {
            success: false,
            path: String::new(),
            file_name: String::new(),
        }),
    }
}

#[tauri::command]
pub(crate) async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

fn save_result(success: bool, path: String) -> SaveResult {
    let file_name = PathBuf::from(&path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();

    SaveResult {
        success,
        path,
        file_name,
    }
}
