use std::collections::HashSet;

use super::helpers::{
    behavior_source_key, focus_node, is_valid_behavior_terminal, node_label, problem,
};
use super::index::ValidationIndex;
use super::types::{EditorProblemDto, ValidationNodeDto, ValidationRequestDto};

pub(super) fn validate_behavior_sources(request: &ValidationRequestDto, problems: &mut Vec<EditorProblemDto>) {
    let configured: HashSet<String> = request
        .behavior_directory_keys
        .iter()
        .map(|key| key.trim().to_uppercase())
        .filter(|key| !key.is_empty())
        .collect();

    for node in request.nodes.iter().filter(|node| node.node_type == "submachine") {
        let src = node.source.trim();
        if src.is_empty() {
            continue;
        }
        let Some(source_key) = behavior_source_key(src) else {
            continue;
        };
        if configured.contains(&source_key) {
            continue;
        }

        let mut item = problem(
            format!("behavior-library-key-{}-{source_key}", node.id),
            "warning",
            "Behavior Library",
            "Behavior Library key is not configured",
            format!(
                "{} sources {src}, but {source_key} is not defined in the Behavior Library.",
                node_label(node)
            ),
        );
        focus_node(&mut item, node.id.clone());
        item.detail_tab = Some("allgemein".into());
        item.mode = Some("event".into());
        problems.push(item);
    }
}

pub(super) fn validate_behavior_exits(
    request: &ValidationRequestDto,
    index: &ValidationIndex<'_>,
    problems: &mut Vec<EditorProblemDto>,
) {
    if !request.is_behavior_workflow {
        return;
    }

    let state_nodes: Vec<&ValidationNodeDto> = request
        .nodes
        .iter()
        .filter(|node| node.node_type != "slot" && node.node_type != "parallelLane")
        .collect();

    if !state_nodes.is_empty() && !state_nodes.iter().any(|node| is_valid_behavior_terminal(node)) {
        problems.push(problem(
            "behavior-exit-missing",
            "warning",
            "Behavior exits",
            "State machine has no exit",
            "A sourced state machine must send an event outward through Nop or end in End/Fatal.",
        ));
    }

    for node in state_nodes {
        if index.children_by_parent.get(node.id.as_str()).is_some_and(|children| !children.is_empty()) {
            continue;
        }
        if is_valid_behavior_terminal(node) || index.sources_with_edges.contains(node.id.as_str()) {
            continue;
        }

        let mut item = problem(
            format!("behavior-dead-end-{}", node.id),
            "warning",
            "Behavior exits",
            "State machine can stop without an exit",
            format!(
                "{} has no outgoing transition. Use a Nop forwarding exit or End/Fatal if this path should leave the state machine.",
                node_label(node)
            ),
        );
        focus_node(&mut item, node.id.clone());
        item.detail_tab = Some("allgemein".into());
        item.mode = Some("event".into());
        problems.push(item);
    }
}
