use std::collections::{HashMap, HashSet};

use super::{
    events::transition_exit_token,
    types::{
        ContainerOutgoingTransitionDto, TransitionAnalysisRequestDto, TransitionEdgeDto,
        TransitionNodeDto,
    },
};

fn first_non_empty<'a>(values: impl IntoIterator<Item = &'a str>, fallback: &'a str) -> String {
    values
        .into_iter()
        .find(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn logical_source(edge: &TransitionEdgeDto) -> String {
    first_non_empty(
        [
            edge.boundary_original_source.as_str(),
            edge.compound_original_source.as_str(),
            edge.parallel_original_source.as_str(),
            edge.source.as_str(),
        ],
        "",
    )
}

fn logical_source_handle(edge: &TransitionEdgeDto) -> String {
    first_non_empty(
        [
            edge.boundary_original_source_handle.as_str(),
            edge.compound_original_source_handle.as_str(),
            edge.parallel_original_source_handle.as_str(),
            edge.source_handle.as_str(),
            edge.label.as_str(),
        ],
        "success",
    )
}

fn logical_target(edge: &TransitionEdgeDto) -> String {
    first_non_empty(
        [
            edge.boundary_original_target.as_str(),
            edge.compound_original_target.as_str(),
            edge.parallel_original_target.as_str(),
            edge.target.as_str(),
        ],
        "",
    )
}

fn is_helper_edge(edge: &TransitionEdgeDto) -> bool {
    edge.boundary_internal_edge
        || edge.compound_internal_edge
        || edge.parallel_internal_edge
        || edge.compound_initial_edge
        || edge.parallel_entry_edge
        || edge.id.starts_with("edge-internal-")
}

fn is_inside_container(
    node_id: &str,
    container_id: &str,
    nodes_by_id: &HashMap<&str, &TransitionNodeDto>,
) -> bool {
    if node_id.is_empty() {
        return false;
    }
    if node_id == container_id {
        return true;
    }

    let mut current = nodes_by_id.get(node_id).copied();
    let mut visited = HashSet::new();
    while let Some(node) = current {
        let Some(parent_id) = node.parent_id.as_deref() else {
            return false;
        };
        if !visited.insert(parent_id) {
            return false;
        }
        if parent_id == container_id {
            return true;
        }
        current = nodes_by_id.get(parent_id).copied();
    }
    false
}

fn display_name(node: Option<&&TransitionNodeDto>) -> String {
    let Some(node) = node else {
        return "Unknown".into();
    };

    let full_skill_name = if !node.full_skill_name.trim().is_empty() {
        node.full_skill_name.trim()
    } else if !node.label.trim().is_empty() {
        node.label.trim()
    } else {
        node.id.as_str()
    };

    let base_name = if !node.label.trim().is_empty() {
        node.label.trim().to_string()
    } else {
        full_skill_name
            .split('.')
            .filter(|part| !part.is_empty())
            .last()
            .unwrap_or(node.id.as_str())
            .split('#')
            .next()
            .unwrap_or(node.id.as_str())
            .to_string()
    };

    if !node.editor_instance_id.trim().is_empty() {
        return format!("{}#{}", base_name, node.editor_instance_id.trim());
    }

    if let Some((_, instance_id)) = full_skill_name.rsplit_once('#') {
        if !instance_id.trim().is_empty() {
            return format!("{}#{}", base_name, instance_id.trim());
        }
    }

    base_name
}

fn source_skill_base(node: Option<&&TransitionNodeDto>) -> String {
    let Some(node) = node else {
        return String::new();
    };

    let source = if !node.label.trim().is_empty() {
        node.label.trim()
    } else if !node.full_skill_name.trim().is_empty() {
        node.full_skill_name.trim()
    } else {
        node.id.as_str()
    };

    source
        .split('#')
        .next()
        .unwrap_or(source)
        .split('.')
        .filter(|part| !part.is_empty())
        .last()
        .unwrap_or("")
        .to_string()
}

struct TransitionCollector<'a> {
    selected_container_id: &'a str,
    nodes_by_id: &'a HashMap<&'a str, &'a TransitionNodeDto>,
    seen: HashSet<String>,
    result: Vec<ContainerOutgoingTransitionDto>,
}

impl<'a> TransitionCollector<'a> {
    fn append(
        &mut self,
        edge_id: String,
        source_id: &str,
        source_handle: &str,
        target_id: &str,
        raw_event: &str,
        is_fallback: bool,
    ) {
        if source_id.is_empty()
            || target_id.is_empty()
            || !is_inside_container(source_id, self.selected_container_id, self.nodes_by_id)
            || is_inside_container(target_id, self.selected_container_id, self.nodes_by_id)
        {
            return;
        }

        let normalized_handle = if source_handle.trim().is_empty() {
            "success".to_string()
        } else {
            source_handle.trim().to_string()
        };
        let semantic_key = format!("{source_id}::{normalized_handle}::{target_id}");
        if is_fallback && self.seen.contains(&semantic_key) {
            return;
        }
        self.seen.insert(semantic_key);

        let source_node = self.nodes_by_id.get(source_id);
        let target_node = self.nodes_by_id.get(target_id);
        let skill_base = source_skill_base(source_node);
        let raw_event_name = if raw_event.trim().is_empty() {
            normalized_handle.as_str()
        } else {
            raw_event.trim()
        };
        let event_suffix = transition_exit_token(raw_event_name, &skill_base);
        let event_prefix = if skill_base.is_empty() {
            display_name(source_node)
        } else {
            skill_base
        };
        let event_display_name = format!(
            "{}.{}",
            event_prefix,
            if event_suffix.is_empty() {
                normalized_handle.as_str()
            } else {
                event_suffix.as_str()
            }
        );

        self.result.push(ContainerOutgoingTransitionDto {
            edge_id,
            source_node_id: source_id.to_string(),
            source_display_name: display_name(source_node),
            event_id: normalized_handle,
            event_display_name,
            target_node_id: target_id.to_string(),
            target_display_name: display_name(target_node),
        });
    }
}

pub(crate) fn analyze_container_outgoing_transitions(
    request: &TransitionAnalysisRequestDto,
) -> Vec<ContainerOutgoingTransitionDto> {
    let Some(selected_container_id) = request.selected_container_id.as_deref() else {
        return Vec::new();
    };

    let nodes_by_id = request
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<HashMap<_, _>>();
    let Some(selected_container) = nodes_by_id.get(selected_container_id).copied() else {
        return Vec::new();
    };
    if !matches!(selected_container.node_type.as_str(), "compound" | "parallel") {
        return Vec::new();
    }

    let mut collector = TransitionCollector {
        selected_container_id,
        nodes_by_id: &nodes_by_id,
        seen: HashSet::new(),
        result: Vec::new(),
    };

    for edge in &request.edges {
        if is_helper_edge(edge) {
            continue;
        }

        let source_id = logical_source(edge);
        let source_handle = logical_source_handle(edge);
        let target_id = logical_target(edge);
        collector.append(
            edge.id.clone(),
            &source_id,
            &source_handle,
            &target_id,
            &edge.boundary_imported_raw_event,
            false,
        );
    }

    let boundary_anchor_ids = if selected_container.node_type == "compound" {
        vec![selected_container.id.as_str()]
    } else {
        request
            .nodes
            .iter()
            .filter(|node| {
                node.node_type == "parallelLane"
                    && is_inside_container(&node.id, selected_container_id, &nodes_by_id)
            })
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>()
    };

    for anchor_id in boundary_anchor_ids {
        let Some(anchor) = nodes_by_id.get(anchor_id).copied() else {
            continue;
        };

        for (index, event) in anchor.events.iter().enumerate() {
            if event.source_node_id.is_empty()
                || event.transition_handle_id.is_empty()
                || event.target.is_empty()
            {
                continue;
            }

            let boundary_edge = request.edges.iter().find(|edge| {
                edge.source == anchor.id && edge.source_handle == event.id
            });
            let Some(boundary_edge) = boundary_edge else {
                continue;
            };

            let edge_id = if boundary_edge.id.is_empty() {
                format!("boundary-{}-{}", anchor.id, if event.id.is_empty() { index.to_string() } else { event.id.clone() })
            } else {
                boundary_edge.id.clone()
            };
            let raw_event = if !event.raw_event.trim().is_empty() {
                event.raw_event.as_str()
            } else {
                event.name.as_str()
            };

            collector.append(
                edge_id,
                &event.source_node_id,
                &event.transition_handle_id,
                &event.target,
                raw_event,
                true,
            );
        }
    }

    if !selected_container.container_transition_order.is_empty() {
        let order = selected_container
            .container_transition_order
            .iter()
            .enumerate()
            .map(|(index, edge_id)| (edge_id.as_str(), index))
            .collect::<HashMap<_, _>>();
        collector.result.sort_by_key(|transition| {
            order
                .get(transition.edge_id.as_str())
                .copied()
                .unwrap_or(usize::MAX)
        });
    }

    collector.result
}

#[cfg(test)]
mod tests {
    use super::analyze_container_outgoing_transitions;
    use crate::core::transitions::types::{
        TransitionAnalysisRequestDto, TransitionEdgeDto, TransitionEventDto, TransitionNodeDto,
    };

    fn node(id: &str, node_type: &str, parent_id: Option<&str>) -> TransitionNodeDto {
        TransitionNodeDto {
            id: id.into(),
            node_type: node_type.into(),
            parent_id: parent_id.map(str::to_string),
            label: id.into(),
            full_skill_name: id.into(),
            ..Default::default()
        }
    }

    #[test]
    fn returns_only_transitions_that_leave_selected_container() {
        let request = TransitionAnalysisRequestDto {
            selected_container_id: Some("compound".into()),
            nodes: vec![
                node("compound", "compound", None),
                node("inside", "custom", Some("compound")),
                node("inside2", "custom", Some("compound")),
                node("outside", "custom", None),
            ],
            edges: vec![
                TransitionEdgeDto {
                    id: "inner".into(),
                    source: "inside".into(),
                    target: "inside2".into(),
                    source_handle: "success".into(),
                    ..Default::default()
                },
                TransitionEdgeDto {
                    id: "out".into(),
                    source: "inside".into(),
                    target: "outside".into(),
                    source_handle: "error.not_found".into(),
                    ..Default::default()
                },
            ],
        };

        let result = analyze_container_outgoing_transitions(&request);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].edge_id, "out");
        assert_eq!(result[0].event_display_name, "inside.error.not_found");
    }

    #[test]
    fn uses_boundary_event_as_fallback_without_duplicating_live_transition() {
        let mut compound = node("compound", "compound", None);
        compound.events = vec![TransitionEventDto {
            id: "boundary-exit".into(),
            source_node_id: "inside".into(),
            transition_handle_id: "success".into(),
            target: "outside".into(),
            raw_event: "inside.success".into(),
            ..Default::default()
        }];

        let request = TransitionAnalysisRequestDto {
            selected_container_id: Some("compound".into()),
            nodes: vec![
                compound,
                node("inside", "custom", Some("compound")),
                node("outside", "custom", None),
            ],
            edges: vec![
                TransitionEdgeDto {
                    id: "semantic".into(),
                    source: "inside".into(),
                    target: "outside".into(),
                    source_handle: "success".into(),
                    ..Default::default()
                },
                TransitionEdgeDto {
                    id: "boundary".into(),
                    source: "compound".into(),
                    target: "outside".into(),
                    source_handle: "boundary-exit".into(),
                    boundary_internal_edge: true,
                    ..Default::default()
                },
            ],
        };

        let result = analyze_container_outgoing_transitions(&request);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].edge_id, "semantic");
    }
}
