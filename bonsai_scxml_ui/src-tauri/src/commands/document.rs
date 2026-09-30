use tauri::State;

use crate::core::document::{
    WorkflowCommandDto, WorkflowCommandResultDto, WorkflowDocumentSnapshotDto,
    WorkflowDocumentStore,
};
use crate::core::model::{Workflow, WorkflowDto};

#[tauri::command]
pub(crate) async fn get_active_workflow_document(
    store: State<'_, WorkflowDocumentStore>,
) -> Result<Option<WorkflowDocumentSnapshotDto>, String> {
    store.snapshot()
}

#[tauri::command]
pub(crate) async fn replace_active_workflow_document(
    workflow: WorkflowDto,
    expected_revision: Option<u64>,
    store: State<'_, WorkflowDocumentStore>,
) -> Result<WorkflowDocumentSnapshotDto, String> {
    let workflow = Workflow::from_dto(workflow)?;
    store.replace_if_revision(workflow, expected_revision)
}

#[tauri::command]
pub(crate) async fn clear_active_workflow_document(
    store: State<'_, WorkflowDocumentStore>,
) -> Result<(), String> {
    store.clear()
}

#[tauri::command]
pub(crate) async fn apply_workflow_command(
    command: WorkflowCommandDto,
    expected_revision: Option<u64>,
    store: State<'_, WorkflowDocumentStore>,
) -> Result<WorkflowCommandResultDto, String> {
    store.apply(expected_revision, command)
}
