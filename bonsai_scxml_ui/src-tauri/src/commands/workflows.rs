use crate::workspace::library::{
    list_behavior_directory as list_behavior_directory_impl, BehaviorDirectoryMapping,
    BehaviorTreeEntry,
};
use crate::workspace::resolver::{
    read_workflow_source as read_workflow_source_impl, WorkflowSourceResult,
};

#[tauri::command]
pub(crate) async fn list_behavior_directory(
    key: String,
    path: String,
) -> Result<Vec<BehaviorTreeEntry>, String> {
    list_behavior_directory_impl(&key, &path)
}

#[tauri::command]
pub(crate) async fn read_workflow_source(
    src: String,
    directories: Vec<BehaviorDirectoryMapping>,
    current_file_path: Option<String>,
) -> Result<WorkflowSourceResult, String> {
    read_workflow_source_impl(&src, &directories, current_file_path.as_deref())
}
