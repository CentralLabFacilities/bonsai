use std::collections::HashSet;

use super::helpers::{
    exposes_implicit_fatal, focus_node, is_valid_behavior_terminal, node_label, problem,
};
use super::index::ValidationIndex;
use super::types::{EditorProblemDto, ValidationRequestDto};

pub(super) fn validate_transitions(
    request: &ValidationRequestDto,
    index: &ValidationIndex<'_>,
    problems: &mut Vec<EditorProblemDto>,
) {
    for edge in &request.edges {
        let source = index.nodes_by_id.get(edge.source.as_str()).copied();
        let target = index.nodes_by_id.get(edge.target.as_str()).copied();
        let event_name = if edge.event.trim().is_empty() {
            "transition"
        } else {
            edge.event.trim()
        };

        let Some(source) = source else {
            let mut item = problem(
                format!("transition-missing-source-{}", edge.id),
                "error",
                "Transitions",
                "Missing transition source",
                format!("{event_name} starts from a state that no longer exists."),
            );
            item.edge_id = Some(edge.id.clone());
            item.mode = Some("event".into());
            if let Some(target) = target {
                item.focus_node_ids.push(target.id.clone());
            }
            problems.push(item);
            continue;
        };

        if target.is_none() {
            let mut item = problem(
                format!("transition-missing-target-{}", edge.id),
                "error",
                "Transitions",
                "Missing transition target",
                format!(
                    "{}.{} points to a state that no longer exists.",
                    node_label(source),
                    event_name
                ),
            );
            focus_node(&mut item, source.id.clone());
            item.edge_id = Some(edge.id.clone());
            item.detail_tab = Some("allgemein".into());
            item.mode = Some("event".into());
            problems.push(item);
        }

        let source_handle = edge.source_handle.trim();
        if !source_handle.is_empty()
            && source_handle != "*"
            && !(source_handle == "fatal" && exposes_implicit_fatal(source))
            && !source
                .events
                .iter()
                .any(|event| event.id == source_handle && !event.synthetic)
        {
            let mut item = problem(
                format!("transition-unknown-event-{}", edge.id),
                "warning",
                "Transitions",
                "Unknown exit token",
                format!("{} does not expose {source_handle}.", node_label(source)),
            );
            item.node_id = Some(source.id.clone());
            item.edge_id = Some(edge.id.clone());
            item.detail_tab = Some("allgemein".into());
            item.mode = Some("event".into());
            item.focus_node_ids.push(source.id.clone());
            if let Some(target) = target {
                item.focus_node_ids.push(target.id.clone());
            }
            problems.push(item);
        }
    }

    for node in &request.nodes {
        if is_valid_behavior_terminal(node) {
            continue;
        }

        let mut exposed = HashSet::new();
        for event in node.events.iter().filter(|event| !event.synthetic) {
            let id = event.id.trim();
            if !id.is_empty() {
                exposed.insert(id.to_string());
            }
        }
        if exposes_implicit_fatal(node) {
            exposed.insert("fatal".to_string());
        }
        if exposed.is_empty() {
            continue;
        }

        let outgoing = index.outgoing_events_by_source.get(node.id.as_str());
        if outgoing.is_some_and(|events| events.contains("*")) {
            continue;
        }

        for event_id in exposed {
            if event_id == "*" {
                continue;
            }
            if outgoing.is_some_and(|events| events.contains(event_id.as_str())) {
                continue;
            }

            let mut item = problem(
                format!("transition-missing-{}-{event_id}", node.id),
                "error",
                "Transitions",
                "Missing transition",
                format!("{}.{event_id} has no transition.", node_label(node)),
            );
            focus_node(&mut item, node.id.clone());
            item.detail_tab = Some("allgemein".into());
            item.mode = Some("event".into());
            problems.push(item);
        }
    }
}
