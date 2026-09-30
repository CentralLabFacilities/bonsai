use crate::core::editor_export::{build_workflow_from_editor, EditorExportRequestDto};
use crate::core::model::{Workflow, WorkflowDto};
use crate::core::scxml::{parse_scxml, serialize_scxml};
use crate::workspace::inspection::{
    inspect_workflow_source as inspect_workflow_source_impl, WorkflowInspectionResult,
};
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


#[tauri::command]
pub(crate) async fn inspect_workflow_source(
    src: String,
    directories: Vec<BehaviorDirectoryMapping>,
    current_file_path: Option<String>,
) -> Result<WorkflowInspectionResult, String> {
    inspect_workflow_source_impl(&src, &directories, current_file_path.as_deref())
}

#[tauri::command]
pub(crate) async fn parse_scxml_workflow(xml: String) -> Result<WorkflowDto, String> {
    parse_scxml(&xml).map(|workflow| workflow.to_dto())
}

#[tauri::command]
pub(crate) async fn serialize_scxml_workflow(workflow: WorkflowDto) -> Result<String, String> {
    let workflow = Workflow::from_dto(workflow)?;
    serialize_scxml(&workflow)
}

#[tauri::command]
pub(crate) async fn serialize_editor_workflow(
    request: EditorExportRequestDto,
) -> Result<String, String> {
    let workflow = build_workflow_from_editor(&request)?;
    serialize_scxml(&workflow)
}
