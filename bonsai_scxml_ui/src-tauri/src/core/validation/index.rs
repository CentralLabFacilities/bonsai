use std::collections::{HashMap, HashSet};

use super::types::{ValidationNodeDto, ValidationRequestDto};

pub(super) struct ValidationIndex<'a> {
    pub nodes_by_id: HashMap<&'a str, &'a ValidationNodeDto>,
    pub children_by_parent: HashMap<&'a str, Vec<&'a ValidationNodeDto>>,
    pub outgoing_events_by_source: HashMap<&'a str, HashSet<&'a str>>,
    pub sources_with_edges: HashSet<&'a str>,
}

impl<'a> ValidationIndex<'a> {
    pub fn new(request: &'a ValidationRequestDto) -> Self {
        let nodes_by_id = request
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
            let event = edge.event.trim();
            if !event.is_empty() {
                outgoing_events_by_source
                    .entry(edge.source.as_str())
                    .or_default()
                    .insert(event);
            }
        }

        Self {
            nodes_by_id,
            children_by_parent,
            outgoing_events_by_source,
            sources_with_edges,
        }
    }
}
