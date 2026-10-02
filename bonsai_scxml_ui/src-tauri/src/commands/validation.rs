use tauri::State;

use crate::core::{
    document::WorkflowDocumentStore,
    validation::{
        build_active_validation_request, validate_editor_graph, ActiveValidationRequestDto,
        EditorProblemDto, ValidationRequestDto,
    },
};

#[tauri::command]
pub(crate) async fn validate_editor_workflow(
    request: ValidationRequestDto,
) -> Result<Vec<EditorProblemDto>, String> {
    Ok(validate_editor_graph(&request))
}

/// Validate the workflow already stored in Rust. The frontend only supplies
/// metadata that is not yet part of the semantic document (for example skill
/// definition defaults and inherited parent-scope variables).
#[tauri::command]
pub(crate) async fn validate_active_workflow(
    request: ActiveValidationRequestDto,
    store: State<'_, WorkflowDocumentStore>,
) -> Result<Vec<EditorProblemDto>, String> {
    let active_request =
        store.inspect_active(|_, workflow, _| build_active_validation_request(workflow, &request))?;
    Ok(validate_editor_graph(&active_request))
}
