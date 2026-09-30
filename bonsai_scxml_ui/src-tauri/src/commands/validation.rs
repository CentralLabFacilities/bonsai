use crate::core::validation::{validate_editor_graph, EditorProblemDto, ValidationRequestDto};

#[tauri::command]
pub(crate) async fn validate_editor_workflow(
    request: ValidationRequestDto,
) -> Result<Vec<EditorProblemDto>, String> {
    Ok(validate_editor_graph(&request))
}
