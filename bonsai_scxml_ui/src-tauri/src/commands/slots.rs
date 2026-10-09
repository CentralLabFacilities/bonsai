use tauri::State;

use crate::core::{
    document::WorkflowDocumentStore,
    slots::{
        build_active_slot_ancestry_request, resolve_slot_ancestry,
        types::{SlotAncestryRequestDto, SlotAncestryResponseDto},
    },
};

#[tauri::command]
pub(crate) fn resolve_editor_slot_ancestry(
    request: SlotAncestryRequestDto,
) -> SlotAncestryResponseDto {
    resolve_slot_ancestry(&request)
}

#[tauri::command]
pub(crate) fn resolve_active_editor_slot_ancestry(
    request: SlotAncestryRequestDto,
    store: State<'_, WorkflowDocumentStore>,
) -> Result<SlotAncestryResponseDto, String> {
    let active_request =
        store.inspect_active(|_, workflow, _| build_active_slot_ancestry_request(workflow, &request))?;
    Ok(resolve_slot_ancestry(&active_request))
}
