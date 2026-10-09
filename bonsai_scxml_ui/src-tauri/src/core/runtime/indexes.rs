use std::collections::{BTreeMap, BTreeSet, HashMap};

use super::context::PreparedContext;
use super::types::{ResolvedRuntimeStepDto, RuntimeChangesTimelineDto};

pub(super) fn build_trace_indexes(
    resolved_steps: &[ResolvedRuntimeStepDto],
    contexts: &[PreparedContext<'_>],
) -> (BTreeMap<String, Vec<String>>, BTreeMap<String, Vec<String>>) {
    let context_by_tab: HashMap<&str, usize> = contexts
        .iter()
        .enumerate()
        .map(|(index, context)| (context.source.tab_id.as_str(), index))
        .collect();
    let mut edge_ids: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut node_ids: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

    for step in resolved_steps {
        let Some(tab_id) = step.tab_id.as_deref() else {
            continue;
        };
        let nodes = node_ids.entry(tab_id.to_string()).or_default();
        let edges = edge_ids.entry(tab_id.to_string()).or_default();
        if let Some(source_node_id) = &step.source_node_id {
            nodes.insert(source_node_id.clone());
        }
        if let Some(target_node_id) = &step.target_node_id {
            nodes.insert(target_node_id.clone());
        }
        if let Some(edge_id) = &step.edge_id {
            edges.insert(edge_id.clone());
            if let Some(context_index) = context_by_tab.get(tab_id) {
                if let Some(edge) = contexts[*context_index]
                    .source
                    .transition_edges
                    .iter()
                    .find(|edge| edge.id == *edge_id)
                {
                    if !edge.source.is_empty() {
                        nodes.insert(edge.source.clone());
                    }
                    if !edge.target.is_empty() {
                        nodes.insert(edge.target.clone());
                    }
                }
            }
        }
    }

    (
        edge_ids
            .into_iter()
            .map(|(tab_id, ids)| (tab_id, ids.into_iter().collect()))
            .collect(),
        node_ids
            .into_iter()
            .map(|(tab_id, ids)| (tab_id, ids.into_iter().collect()))
            .collect(),
    )
}

pub(super) fn build_slot_edge_index(
    changes_timeline: &RuntimeChangesTimelineDto,
) -> Vec<BTreeMap<String, Vec<String>>> {
    changes_timeline
        .steps
        .iter()
        .map(|step| {
            let mut by_tab: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
            for sample in &step.slot_accesses {
                let Some(tab_id) = &sample.tab_id else {
                    continue;
                };
                let ids = by_tab.entry(tab_id.clone()).or_default();
                for edge_id in &sample.edge_ids {
                    if !edge_id.is_empty() {
                        ids.insert(edge_id.clone());
                    }
                }
            }
            by_tab
                .into_iter()
                .map(|(tab_id, ids)| (tab_id, ids.into_iter().collect()))
                .collect()
        })
        .collect()
}
