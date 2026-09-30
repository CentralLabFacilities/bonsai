use crate::core::model::{AssignmentDto, SlotDto, StateKindDto};

use super::types::{EditorExportAssignmentDto, EditorExportNodeDto, EditorExportSlotDto};

pub(super) fn state_name(node: &EditorExportNodeDto) -> String {
    if !node.full_skill_name.trim().is_empty() {
        node.full_skill_name.trim().to_string()
    } else if !node.label.trim().is_empty() {
        node.label.trim().to_string()
    } else {
        node.id.clone()
    }
}

pub(super) fn node_kind(node: &EditorExportNodeDto) -> StateKindDto {
    if !node.source.trim().is_empty() {
        return StateKindDto::Submachine;
    }

    let name = state_name(node).to_ascii_lowercase();
    if node.is_final || matches!(name.as_str(), "end" | "fatal") {
        return StateKindDto::Final;
    }

    match node.node_type.as_str() {
        "parallel" => StateKindDto::Parallel,
        "compound" => StateKindDto::Compound,
        "parallelLane" => StateKindDto::ParallelLane,
        _ => StateKindDto::Skill,
    }
}

pub(super) fn assignment(value: &EditorExportAssignmentDto) -> AssignmentDto {
    AssignmentDto {
        location: value.location.clone(),
        expression: value.expression.clone(),
    }
}

pub(super) fn slot(value: &EditorExportSlotDto) -> SlotDto {
    SlotDto {
        key: value.key.clone(),
        type_name: value.type_name.clone(),
        description: value.description.clone(),
        path: value.path.clone(),
        inherited: value.inherited.then(|| {
            if !value.inherited_xpath.trim().is_empty() {
                value.inherited_xpath.clone()
            } else {
                value.inherited_state.clone()
            }
        }),
    }
}

pub(super) fn normalize_xpath(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        String::new()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}
