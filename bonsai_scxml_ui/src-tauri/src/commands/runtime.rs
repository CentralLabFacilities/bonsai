use crate::core::runtime::{
    parse_runtime_log, prepare_runtime_replay, RuntimeLogDto, RuntimeReplayCacheDto,
    RuntimeReplayRequestDto,
};

#[tauri::command]
pub(crate) fn parse_runtime_log_text(text: String) -> RuntimeLogDto {
    parse_runtime_log(&text)
}

#[tauri::command]
pub(crate) fn prepare_runtime_replay_cache(
    request: RuntimeReplayRequestDto,
) -> RuntimeReplayCacheDto {
    prepare_runtime_replay(request)
}
