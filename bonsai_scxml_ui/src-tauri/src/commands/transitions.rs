use crate::core::transitions::{
    analyze_container_outgoing_transitions,
    types::{ContainerOutgoingTransitionDto, TransitionAnalysisRequestDto},
};

#[tauri::command]
pub(crate) fn analyze_editor_transitions(
    request: TransitionAnalysisRequestDto,
) -> Vec<ContainerOutgoingTransitionDto> {
    analyze_container_outgoing_transitions(&request)
}
