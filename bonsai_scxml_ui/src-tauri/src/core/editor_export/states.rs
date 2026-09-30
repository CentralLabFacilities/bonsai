use std::collections::HashMap;

use crate::core::model::{
    EditorEdgeTargetDto, EditorMetadataDto, EditorPositionDto, ParameterDto, StateDto,
    StateKindDto,
};

use super::{
    helpers::{assignment, node_kind, slot, state_name},
    index::ExportIndex,
    types::EditorExportRequestDto,
};

pub(super) fn build_states(
    request: &EditorExportRequestDto,
    index: &ExportIndex<'_>,
    edge_routes: &HashMap<String, Vec<EditorEdgeTargetDto>>,
) -> Vec<StateDto> {
    let mut states = Vec::new();

    for node in &request.nodes {
        if index.is_flattened_lane(&node.id) {
            continue;
        }

        let children = index.effective_children(&node.id);
        let mut kind = node_kind(node);
        if matches!(kind, StateKindDto::Final) && !children.is_empty() {
            kind = match node.node_type.as_str() {
                "parallel" => StateKindDto::Parallel,
                "compound" => StateKindDto::Compound,
                "parallelLane" => StateKindDto::ParallelLane,
                _ => StateKindDto::Skill,
            };
        }

        let requested_initial_id = node
            .initial_child_id
            .as_deref()
            .map(|id| index.semantic_state_id(id));
        let initial_child = requested_initial_id
            .as_deref()
            .and_then(|id| index.nodes_by_id.get(id).copied())
            .or_else(|| children.iter().copied().find(|child| child.is_initial))
            .or_else(|| {
                (node.node_type == "parallelLane")
                    .then(|| children.first().copied())
                    .flatten()
            });
        let initial_child_id = initial_child.map(|child| child.id.clone());
        let initial_child_scxml_id = initial_child
            .map(state_name)
            .or_else(|| {
                (!node.initial_sub_state.trim().is_empty())
                    .then(|| node.initial_sub_state.clone())
            });

        let is_submachine = matches!(kind, StateKindDto::Submachine);
        let parameters = if is_submachine || matches!(kind, StateKindDto::Final) {
            Vec::new()
        } else {
            node.parameters
                .iter()
                .filter(|parameter| !parameter.expression.trim().is_empty())
                .map(|parameter| ParameterDto {
                    key: parameter.key.clone(),
                    type_name: String::new(),
                    required: false,
                    default_value: None,
                    description: String::new(),
                    expression: parameter.expression.clone(),
                })
                .collect()
        };

        let editor = if node.node_type == "parallelLane" {
            EditorMetadataDto::default()
        } else {
            let positions = if node.editor_positions.is_empty() {
                vec![EditorPositionDto {
                    x: node.x,
                    y: node.y,
                    instance_id: None,
                    clone_type: None,
                }]
            } else {
                node.editor_positions
                    .iter()
                    .map(|position| EditorPositionDto {
                        x: position.x,
                        y: position.y,
                        instance_id: position.instance_id.clone(),
                        clone_type: position.clone_type.clone(),
                    })
                    .collect()
            };
            EditorMetadataDto {
                x: node.x,
                y: node.y,
                positions,
                edge_targets: edge_routes.get(&node.id).cloned().unwrap_or_default(),
                ..EditorMetadataDto::default()
            }
        };

        states.push(StateDto {
            id: node.id.clone(),
            scxml_id: state_name(node),
            label: node.label.clone(),
            kind,
            full_skill_name: (!node.full_skill_name.trim().is_empty())
                .then(|| node.full_skill_name.clone()),
            source: (!node.source.trim().is_empty()).then(|| node.source.clone()),
            parent_id: index.effective_parent_id(node),
            initial_child_id,
            initial_child_scxml_id,
            is_initial: node.is_initial,
            is_final: matches!(kind, StateKindDto::Final),
            events: Vec::new(),
            input_slots: node.input_slots.iter().map(slot).collect(),
            output_slots: node.output_slots.iter().map(slot).collect(),
            parameters,
            on_entry: node.on_entry.iter().map(assignment).collect(),
            on_exit: node.on_exit.iter().map(assignment).collect(),
            editor,
        });
    }

    states
}
