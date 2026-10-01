use std::collections::{HashMap, HashSet};

use crate::core::model::{EditorEdgeTargetDto, StateKindDto, TransitionDto};
use crate::core::transitions::events::scxml_transition_event;

use super::{
    helpers::{assignment, node_kind, state_name},
    index::ExportIndex,
    types::{
        EditorExportEdgeDto, EditorExportEventDto, EditorExportNodeDto, EditorExportRequestDto,
    },
};

fn edge_event(edge: &EditorExportEdgeDto, source: Option<&&EditorExportNodeDto>) -> String {
    let raw = if !edge.source_handle.trim().is_empty() {
        edge.source_handle.trim()
    } else if !edge.label.trim().is_empty() {
        edge.label.trim()
    } else {
        "success"
    };
    scxml_transition_event(raw, &source.map(|node| state_name(node)).unwrap_or_default())
}

fn edge_logical_sources(
    edge: &EditorExportEdgeDto,
    fallback_state_id: &str,
    fallback_handle: &str,
) -> Vec<crate::core::model::TransitionSourceDto> {
    let mut seen = HashSet::new();
    let mut sources = edge
        .logical_sources
        .iter()
        .filter_map(|source| {
            let state_id = source.state_id.trim();
            let handle = source.handle.trim();
            if state_id.is_empty() || handle.is_empty() {
                return None;
            }
            let key = (state_id.to_string(), handle.to_string());
            seen.insert(key.clone()).then_some(crate::core::model::TransitionSourceDto {
                state_id: key.0,
                handle: key.1,
            })
        })
        .collect::<Vec<_>>();

    if sources.is_empty() && !fallback_state_id.trim().is_empty() {
        sources.push(crate::core::model::TransitionSourceDto {
            state_id: fallback_state_id.trim().to_string(),
            handle: if fallback_handle.trim().is_empty() {
                "success".to_string()
            } else {
                fallback_handle.trim().to_string()
            },
        });
    }

    sources
}

fn direct_logical_source(
    state_id: &str,
    handle: &str,
) -> Vec<crate::core::model::TransitionSourceDto> {
    vec![crate::core::model::TransitionSourceDto {
        state_id: state_id.to_string(),
        handle: handle.to_string(),
    }]
}

fn transition_key(transition: &TransitionDto) -> String {
    let assignments = transition
        .assignments
        .iter()
        .map(|item| format!("{}={}", item.location, item.expression))
        .collect::<Vec<_>>()
        .join("\u{1f}");
    format!(
        "{}\u{1e}{}\u{1e}{}\u{1e}{}",
        transition.event, transition.target_scxml_id, transition.condition, assignments
    )
}

fn push_transition_with_merged_sources(
    result: &mut Vec<TransitionDto>,
    seen: &mut HashMap<String, usize>,
    transition: TransitionDto,
) {
    let key = transition_key(&transition);
    if let Some(existing_index) = seen.get(&key).copied() {
        let existing = &mut result[existing_index];
        for source in transition.logical_sources {
            if !existing.logical_sources.contains(&source) {
                existing.logical_sources.push(source);
            }
        }
        return;
    }

    seen.insert(key, result.len());
    result.push(transition);
}

fn target_details(target_id: &str, index: &ExportIndex<'_>) -> (Option<String>, String) {
    let semantic_target_id = index.semantic_state_id(target_id);
    let target_name = index
        .nodes_by_id
        .get(semantic_target_id.as_str())
        .map(|node| state_name(node))
        .unwrap_or_else(|| target_id.to_string());
    (Some(semantic_target_id), target_name)
}

fn first_event_name(event: &EditorExportEventDto) -> String {
    if !event.raw_event.trim().is_empty() {
        event.raw_event.trim().to_string()
    } else if !event.name.trim().is_empty() {
        event.name.trim().to_string()
    } else {
        event.id.trim().to_string()
    }
}

fn build_normal_transitions(
    node: &EditorExportNodeDto,
    request: &EditorExportRequestDto,
    index: &ExportIndex<'_>,
) -> Vec<TransitionDto> {
    if node.node_type == "parallelLane" {
        return Vec::new();
    }

    let container_id = index.nearest_container_ancestor(node);
    let mut combined: Vec<(
        String,
        String,
        String,
        Vec<crate::core::model::AssignmentDto>,
        String,
        Vec<crate::core::model::TransitionSourceDto>,
    )> = Vec::new();

    for edge in request.edges.iter().filter(|edge| edge.source == node.id) {
        if let Some(container_id) = container_id {
            if !index.is_strict_descendant(&edge.target, container_id) {
                continue;
            }
        }
        let raw_event = if !edge.source_handle.trim().is_empty() {
            edge.source_handle.clone()
        } else if !edge.label.trim().is_empty() {
            edge.label.clone()
        } else {
            "success".into()
        };
        let logical_sources = edge_logical_sources(edge, &node.id, &raw_event);
        combined.push((
            raw_event,
            edge.target.clone(),
            edge.condition.clone(),
            edge.assignments.iter().map(assignment).collect(),
            edge.id.clone(),
            logical_sources,
        ));
    }

    for (event_index, event) in node.events.iter().enumerate() {
        if event.target.trim().is_empty() {
            continue;
        }
        if let Some(container_id) = container_id {
            if !index.is_strict_descendant(&event.target, container_id) {
                continue;
            }
        }
        let raw_event = first_event_name(event);
        let target_name = index
            .nodes_by_id
            .get(event.target.as_str())
            .map(|target| state_name(target))
            .unwrap_or_else(|| event.target.clone());
        let already_exists = combined.iter().any(|(existing_event, target, _, _, _, _)| {
            let existing_target_name = index
                .nodes_by_id
                .get(target.as_str())
                .map(|target| state_name(target))
                .unwrap_or_else(|| target.clone());
            existing_target_name == target_name
                && (existing_event == &event.id || existing_event == &event.name)
        });
        if already_exists {
            continue;
        }
        let logical_sources = direct_logical_source(&node.id, &raw_event);
        combined.push((
            raw_event,
            event.target.clone(),
            event.condition.clone(),
            event.assignments.iter().map(assignment).collect(),
            format!("event-{}-{event_index}", node.id),
            logical_sources,
        ));
    }

    combined
        .into_iter()
        .filter_map(|(raw_event, target_id, condition, assignments, id, logical_sources)| {
            if target_id.trim().is_empty() {
                return None;
            }
            let (target_state_id, target_scxml_id) = target_details(&target_id, index);
            Some(TransitionDto {
                id,
                source_state_id: node.id.clone(),
                target_state_id,
                target_scxml_id,
                logical_sources,
                event: scxml_transition_event(&raw_event, &state_name(node)),
                condition,
                assignments,
                sent_events: Vec::new(),
                target_instance_id: None,
            })
        })
        .collect()
}

fn build_container_transitions(
    node: &EditorExportNodeDto,
    request: &EditorExportRequestDto,
    index: &ExportIndex<'_>,
) -> Vec<TransitionDto> {
    let order_rank = node
        .container_transition_order
        .iter()
        .enumerate()
        .map(|(position, id)| (id.as_str(), position))
        .collect::<HashMap<_, _>>();

    let mut leaving = request
        .edges
        .iter()
        .enumerate()
        .filter_map(|(edge_index, edge)| {
            let source_inside = index.is_inside_container(&edge.source, &node.id);
            let target_inside = index.is_inside_container(&edge.target, &node.id);
            (source_inside && !target_inside).then_some((edge_index, edge))
        })
        .collect::<Vec<_>>();

    leaving.sort_by_key(|(edge_index, edge)| {
        (
            order_rank
                .get(edge.id.as_str())
                .copied()
                .unwrap_or(usize::MAX),
            *edge_index,
        )
    });

    let mut result = Vec::new();
    let mut seen = HashMap::new();

    for (_, edge) in leaving {
        let source = index.nodes_by_id.get(edge.source.as_str());
        let raw_handle = if !edge.source_handle.trim().is_empty() {
            edge.source_handle.trim()
        } else if !edge.label.trim().is_empty() {
            edge.label.trim()
        } else {
            "success"
        };
        let full_event = if !edge.imported_raw_event.trim().is_empty() {
            edge.imported_raw_event.trim().to_string()
        } else if edge.source == node.id && raw_handle.contains('.') {
            raw_handle.to_string()
        } else {
            scxml_transition_event(
                raw_handle,
                &source.map(|source| state_name(source)).unwrap_or_default(),
            )
        };
        let (target_state_id, target_scxml_id) = target_details(&edge.target, index);
        if full_event.is_empty() || target_scxml_id.is_empty() {
            continue;
        }
        let transition = TransitionDto {
            id: edge.id.clone(),
            source_state_id: node.id.clone(),
            target_state_id,
            target_scxml_id,
            logical_sources: edge_logical_sources(edge, &edge.source, raw_handle),
            event: full_event,
            condition: edge.condition.clone(),
            assignments: edge.assignments.iter().map(assignment).collect(),
            sent_events: Vec::new(),
            target_instance_id: None,
        };
        push_transition_with_merged_sources(&mut result, &mut seen, transition);
    }

    for (event_index, event) in node.events.iter().enumerate() {
        if event.target.trim().is_empty()
            || (!event.source_node_id.trim().is_empty()
                && !event.transition_handle_id.trim().is_empty())
        {
            continue;
        }
        let raw_event = first_event_name(event);
        if raw_event.is_empty() {
            continue;
        }
        let (target_state_id, target_scxml_id) = target_details(&event.target, index);
        let transition = TransitionDto {
            id: format!("event-{}-{event_index}", node.id),
            source_state_id: node.id.clone(),
            target_state_id,
            target_scxml_id,
            logical_sources: direct_logical_source(&node.id, &raw_event),
            event: raw_event,
            condition: event.condition.clone(),
            assignments: event.assignments.iter().map(assignment).collect(),
            sent_events: Vec::new(),
            target_instance_id: None,
        };
        push_transition_with_merged_sources(&mut result, &mut seen, transition);
    }

    result
}

fn build_behavior_exit_transition(node: &EditorExportNodeDto) -> Vec<TransitionDto> {
    if !node.is_behavior_exit || node.node_type == "parallelLane" {
        return Vec::new();
    }

    let configured = if node.behavior_exit_transitions.is_empty() {
        vec![("Nop.fatal".to_string(), node.behavior_exit_events.clone())]
    } else {
        node.behavior_exit_transitions
            .iter()
            .map(|item| {
                (
                    if item.trigger_event.trim().is_empty() {
                        "Nop.fatal".to_string()
                    } else {
                        item.trigger_event.trim().to_string()
                    },
                    item.send_events.clone(),
                )
            })
            .collect()
    };

    let Some((trigger_event, send_event)) = configured.into_iter().find_map(|(trigger, sends)| {
        sends
            .into_iter()
            .find(|event| !event.trim().is_empty())
            .map(|event| (trigger, event))
    }) else {
        return Vec::new();
    };

    vec![TransitionDto {
        id: format!("behavior-exit-{}", node.id),
        source_state_id: node.id.clone(),
        target_state_id: None,
        target_scxml_id: String::new(),
        logical_sources: direct_logical_source(&node.id, &trigger_event),
        event: trigger_event,
        condition: String::new(),
        assignments: Vec::new(),
        sent_events: vec![send_event],
        target_instance_id: None,
    }]
}

pub(super) fn build_edge_target_routes(
    request: &EditorExportRequestDto,
    index: &ExportIndex<'_>,
) -> HashMap<String, Vec<EditorEdgeTargetDto>> {
    let mut occurrences: HashMap<(String, String), u32> = HashMap::new();
    let mut routes: HashMap<String, Vec<EditorEdgeTargetDto>> = HashMap::new();

    for edge in &request.edges {
        if edge.editor_target_instance_id.trim().is_empty() {
            continue;
        }
        let source = index.nodes_by_id.get(edge.source.as_str());
        let semantic_target_id = index.semantic_state_id(&edge.target);
        let Some(target) = index.nodes_by_id.get(semantic_target_id.as_str()) else {
            continue;
        };
        let event = edge_event(edge, source);
        let target_scxml_id = state_name(target);
        let key = (event.clone(), target_scxml_id.clone());
        let occurrence = occurrences.entry(key).or_insert(0);
        routes
            .entry(semantic_target_id)
            .or_default()
            .push(EditorEdgeTargetDto {
                event,
                target_scxml_id,
                occurrence: *occurrence,
                target_instance_id: edge.editor_target_instance_id.clone(),
            });
        *occurrence += 1;
    }

    routes
}

pub(super) fn build_transitions(
    request: &EditorExportRequestDto,
    index: &ExportIndex<'_>,
) -> Vec<TransitionDto> {
    let mut transitions = Vec::new();

    for node in &request.nodes {
        if index.is_flattened_lane(&node.id) {
            continue;
        }

        if matches!(node_kind(node), StateKindDto::Final)
            && index.effective_children(&node.id).is_empty()
        {
            continue;
        } else if node.is_behavior_exit && node.node_type != "parallelLane" {
            transitions.extend(build_behavior_exit_transition(node));
        } else if matches!(node.node_type.as_str(), "compound" | "parallel") {
            transitions.extend(build_container_transitions(node, request, index));
        } else {
            transitions.extend(build_normal_transitions(node, request, index));
        }
    }

    transitions
}
