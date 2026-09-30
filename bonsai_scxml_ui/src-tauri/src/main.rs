mod commands;
mod core;
mod workspace;

fn main() {
    tauri::Builder::default()
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
            commands::workflows::parse_scxml_workflow,
            commands::workflows::serialize_scxml_workflow
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
