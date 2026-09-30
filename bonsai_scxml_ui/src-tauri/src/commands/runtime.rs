use crate::core::runtime::{parse_runtime_log, RuntimeLogDto};

#[tauri::command]
pub(crate) fn parse_runtime_log_text(text: String) -> RuntimeLogDto {
    parse_runtime_log(&text)
}
