mod commands;
mod core;
mod workspace;

fn main() {
    tauri::Builder::default()
        .manage(core::document::WorkflowDocumentStore::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::api::api_request,
            commands::files::open_file,
            commands::files::pick_directory,
            commands::workflows::list_behavior_directory,
            commands::files::save_file,
            commands::files::read_file,
            commands::workflows::read_workflow_source,
            commands::workflows::inspect_workflow_source,
            commands::workflows::parse_scxml_workflow,
            commands::workflows::serialize_scxml_workflow,
            commands::workflows::serialize_editor_workflow,
            commands::validation::validate_editor_workflow,
            commands::slots::resolve_editor_slot_ancestry,
            commands::transitions::analyze_editor_transitions,
            commands::runtime::parse_runtime_log_text,
            commands::runtime::prepare_runtime_replay_cache,
            commands::document::get_active_workflow_document,
            commands::document::replace_active_workflow_document,
            commands::document::clear_active_workflow_document,
            commands::document::apply_workflow_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
