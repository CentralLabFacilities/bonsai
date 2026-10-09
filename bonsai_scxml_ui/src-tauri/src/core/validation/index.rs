use std::collections::{HashMap, HashSet};

use crate::core::transitions::events::normalize_exit_token;

use super::types::{ValidationNodeDto, ValidationRequestDto};

pub(super) struct ValidationIndex<'a> {
    pub nodes_by_id: HashMap<&'a str, &'a ValidationNodeDto>,
    pub children_by_parent: HashMap<&'a str, Vec<&'a ValidationNodeDto>>,
    pub outgoing_events_by_source: HashMap<&'a str, HashSet<&'a str>>,
    pub sources_with_edges: HashSet<&'a str>,
    pub transition_ignored_node_ids: HashSet<&'a str>,
    pub final_states_disabled: bool,
}

fn config_value<'a>(request: &'a ValidationRequestDto, id: &str) -> Option<&'a str> {
    let value = request
        .global_data_model
        .iter()
        .find(|entry| entry.id.trim() == id)?
        .expression
        .trim();
    if value.len() >= 2
        && ((value.starts_with('\'') && value.ends_with('\''))
            || (value.starts_with('"') && value.ends_with('"')))
    {
        Some(value[1..value.len() - 1].trim())
    } else {
        Some(value)
    }
}

impl<'a> ValidationIndex<'a> {
    pub fn new(request: &'a ValidationRequestDto) -> Self {
        let ignored_names: HashSet<&str> = config_value(request, "#_VALIDATE_IGNORE_THESE_STATES")
            .unwrap_or_default()
            .split(';')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .collect();
        let transition_ignored_node_ids = request
            .nodes
            .iter()
            .filter(|node| {
                let full_name = node.full_skill_name.trim();
                let base_name = full_name.split('#').next().unwrap_or(full_name);
                let short_name = base_name.rsplit('.').next().unwrap_or(base_name);
                [
                    node.id.trim(),
                    node.label.trim(),
                    full_name,
                    base_name,
                    short_name,
                ]
                .into_iter()
                .any(|name| !name.is_empty() && ignored_names.contains(name))
            })
            .map(|node| node.id.as_str())
            .collect();
        let final_states_disabled = config_value(request, "#_FINAL_STATES")
            .is_some_and(|value| value.eq_ignore_ascii_case("false"));
        let nodes_by_id: HashMap<_, _> = request
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect();

        let mut children_by_parent: HashMap<&str, Vec<&ValidationNodeDto>> = HashMap::new();
        for node in &request.nodes {
            if let Some(parent_id) = node.parent_id.as_deref() {
                children_by_parent.entry(parent_id).or_default().push(node);
            }
        }

        let mut outgoing_events_by_source: HashMap<&str, HashSet<&str>> = HashMap::new();
        let mut sources_with_edges = HashSet::new();
        for edge in &request.edges {
            sources_with_edges.insert(edge.source.as_str());
            let source_name = nodes_by_id
                .get(edge.source.as_str())
                .map(|node| node.full_skill_name.as_str())
                .unwrap_or_default();
            for event in edge.event.split_whitespace() {
                outgoing_events_by_source
                    .entry(edge.source.as_str())
                    .or_default()
                    .insert(normalize_exit_token(event, source_name));
            }
        }

        Self {
            nodes_by_id,
            children_by_parent,
            outgoing_events_by_source,
            sources_with_edges,
            transition_ignored_node_ids,
            final_states_disabled,
        }
    }
}
