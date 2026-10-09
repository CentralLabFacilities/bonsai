use std::collections::{HashMap, HashSet};

use crate::core::model::{StateKind, Workflow};

use super::types::{
    ActiveValidationRequestDto, ValidationAssignmentDto, ValidationEdgeDto,
    ValidationEventDto, ValidationNodeDto, ValidationParameterDto, ValidationRequestDto,
    ValidationSlotDto, ValidationVariableDto,
};

fn node_type(kind: StateKind) -> &'static str {
    match kind {
        StateKind::Skill => "custom",
        StateKind::Compound => "compound",
        StateKind::Parallel => "parallel",
        StateKind::ParallelLane => "parallelLane",
        StateKind::Submachine => "submachine",
        StateKind::Final => "final",
    }
}

fn assignment(location: &str, expression: &str) -> ValidationAssignmentDto {
    ValidationAssignmentDto {
        location: location.to_string(),
        expression: expression.to_string(),
    }
}

fn variable(id: &str, type_name: Option<&str>, expression: &str) -> ValidationVariableDto {
    ValidationVariableDto {
        id: id.to_string(),
        type_name: type_name.unwrap_or_default().to_string(),
        expression: expression.to_string(),
    }
}

fn collect_inherited_slot_paths(workflow: &Workflow) -> Vec<String> {
    let mut paths = HashSet::new();
    let mut add = |raw: &str| {
        let path = raw.trim().trim_start_matches('/');
        if !path.is_empty() {
            paths.insert(path.to_string());
        }
    };

    for declaration in &workflow.slot_declarations {
        if declaration.inherited {
            add(&declaration.xpath);
        }
    }

    for state in &workflow.states {
        for slot in state.input_slots.iter().chain(state.output_slots.iter()) {
            if let Some(inherited) = slot.inherited.as_deref() {
                if inherited.trim().is_empty() {
                    add(&slot.path);
                } else {
                    add(inherited);
                }
            }
        }
    }

    let mut paths = paths.into_iter().collect::<Vec<_>>();
    paths.sort();
    paths
}

pub(crate) fn build_active_validation_request(
    workflow: &Workflow,
    context: &ActiveValidationRequestDto,
) -> ValidationRequestDto {
    let overlays = context
        .node_overlays
        .iter()
        .map(|overlay| (overlay.id.as_str(), overlay))
        .collect::<HashMap<_, _>>();

    let behavior_exit_ids = workflow
        .transitions
        .iter()
        .filter(|transition| {
            transition.target_state_id.is_none() && !transition.sent_events.is_empty()
        })
        .map(|transition| transition.source_state_id.as_str())
        .collect::<HashSet<_>>();

    let nodes = workflow
        .states
        .iter()
        .map(|state| {
            let overlay = overlays.get(state.id.as_str()).copied();
            ValidationNodeDto {
                id: state.id.as_str().to_string(),
                node_type: node_type(state.kind).to_string(),
                parent_id: state
                    .parent_id
                    .as_ref()
                    .map(|parent| parent.as_str().to_string()),
                label: state.label.clone(),
                full_skill_name: state.full_skill_name.clone().unwrap_or_default(),
                source: state.source.clone().unwrap_or_default(),
                is_initial: state.is_initial,
                is_final: state.is_final || matches!(state.kind, StateKind::Final),
                is_behavior_exit: overlay
                    .map(|value| value.is_behavior_exit)
                    .unwrap_or(false)
                    || behavior_exit_ids.contains(state.id.as_str()),
                is_collapsed: overlay
                    .map(|value| value.is_collapsed)
                    .unwrap_or(state.editor.collapsed),
                is_reference: state.editor.reference_of.is_some(),
                events: overlay
                    .map(|value| value.events.clone())
                    .unwrap_or_else(|| {
                        state
                            .events
                            .iter()
                            .map(|event| ValidationEventDto {
                                id: event.id.clone(),
                                synthetic: false,
                            })
                            .collect()
                    }),
                parameters: overlay
                    .map(|value| value.parameters.clone())
                    .unwrap_or_else(|| {
                        state
                            .parameters
                            .iter()
                            .map(|parameter| ValidationParameterDto {
                                key: parameter.key.clone(),
                                type_name: parameter.type_name.clone(),
                                required: parameter.required,
                                default_value: parameter.default_value.clone().unwrap_or_default(),
                                expression: parameter.expression.clone(),
                            })
                            .collect()
                    }),
                on_entry: overlay
                    .map(|value| value.on_entry.clone())
                    .unwrap_or_else(|| {
                        state
                            .on_entry
                            .iter()
                            .map(|value| assignment(&value.location, &value.expression))
                            .collect()
                    }),
                on_exit: overlay
                    .map(|value| value.on_exit.clone())
                    .unwrap_or_else(|| {
                        state
                            .on_exit
                            .iter()
                            .map(|value| assignment(&value.location, &value.expression))
                            .collect()
                    }),
                input_slots: state
                    .input_slots
                    .iter()
                    .map(|slot| ValidationSlotDto {
                        key: slot.key.clone(),
                        type_name: slot.type_name.clone(),
                        path: slot.path.clone(),
                    })
                    .collect(),
                output_slots: state
                    .output_slots
                    .iter()
                    .map(|slot| ValidationSlotDto {
                        key: slot.key.clone(),
                        type_name: slot.type_name.clone(),
                        path: slot.path.clone(),
                    })
                    .collect(),
                has_local_data_model: overlay
                    .map(|value| value.has_local_data_model)
                    .unwrap_or(false),
                local_data_model: overlay
                    .map(|value| value.local_data_model.clone())
                    .unwrap_or_default(),
            }
        })
        .collect::<Vec<_>>();

    let mut edges = Vec::new();
    for transition in &workflow.transitions {
        let target = if let Some(target_state_id) = transition.target_state_id.as_ref() {
            target_state_id.as_str().to_string()
        } else if !transition.target_scxml_id.trim().is_empty() {
            // Preserve unresolved editor targets so validation still reports a
            // missing-target problem instead of silently dropping the edge.
            transition.target_scxml_id.clone()
        } else {
            // Behavior forwarding exits are targetless semantic transitions
            // and are intentionally not visual editor edges.
            continue;
        };

        if transition.logical_sources.is_empty() {
            edges.push(ValidationEdgeDto {
                id: transition.id.as_str().to_string(),
                source: transition.source_state_id.as_str().to_string(),
                target: target.clone(),
                event: transition.event.clone(),
                source_handle: transition.event.clone(),
                semantic_source: transition.source_state_id.as_str().to_string(),
                assignments: transition
                    .assignments
                    .iter()
                    .map(|value| assignment(&value.location, &value.expression))
                    .collect(),
            });
            continue;
        }

        for source in &transition.logical_sources {
            edges.push(ValidationEdgeDto {
                id: transition.id.as_str().to_string(),
                source: source.state_id.as_str().to_string(),
                target: target.clone(),
                event: if source.handle.trim().is_empty() {
                    transition.event.clone()
                } else {
                    source.handle.clone()
                },
                source_handle: source.handle.clone(),
                semantic_source: source.state_id.as_str().to_string(),
                assignments: transition
                    .assignments
                    .iter()
                    .map(|value| assignment(&value.location, &value.expression))
                    .collect(),
            });
        }
    }

    let global_data_model = workflow
        .data_model
        .iter()
        .map(|entry| variable(&entry.id, entry.type_name.as_deref(), &entry.expression))
        .collect::<Vec<_>>();

    ValidationRequestDto {
        nodes,
        edges,
        global_data_model: global_data_model.clone(),
        available_data_model: if context.available_data_model.is_empty() {
            global_data_model
        } else {
            context.available_data_model.clone()
        },
        behavior_directory_keys: context.behavior_directory_keys.clone(),
        is_behavior_workflow: context.is_behavior_workflow,
        inherited_slot_paths: collect_inherited_slot_paths(workflow),
        ancestor_writer_slot_paths: context.ancestor_writer_slot_paths.clone(),
    }
}
