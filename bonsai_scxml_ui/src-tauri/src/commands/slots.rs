use crate::core::slots::{resolve_slot_ancestry, types::{SlotAncestryRequestDto, SlotAncestryResponseDto}};

#[tauri::command]
pub(crate) fn resolve_editor_slot_ancestry(
    request: SlotAncestryRequestDto,
) -> SlotAncestryResponseDto {
    resolve_slot_ancestry(&request)
}
