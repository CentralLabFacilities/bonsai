use std::collections::HashMap;

use super::types::{RuntimeReplayContextDto, RuntimeReplayNodeDto};

pub(super) fn normalize(value: &str) -> String {
    value.trim().to_string()
}

pub(super) struct PreparedContext<'a> {
    pub source: &'a RuntimeReplayContextDto,
    pub by_name: HashMap<String, Vec<usize>>,
    pub by_id: HashMap<String, usize>,
}

#[derive(Clone)]
pub(super) struct StateResolution {
    pub node_index: usize,
    pub local_name: String,
    pub exact: bool,
    pub collapsed: bool,
}

pub(super) fn prepare_contexts(contexts: &[RuntimeReplayContextDto]) -> Vec<PreparedContext<'_>> {
    contexts
        .iter()
        .map(|context| {
            let mut by_name: HashMap<String, Vec<usize>> = HashMap::new();
            let mut by_id = HashMap::new();
            for (index, node) in context.nodes.iter().enumerate() {
                by_id.insert(node.id.clone(), index);
                for name in &node.names {
                    let name = normalize(name);
                    if !name.is_empty() {
                        by_name.entry(name).or_default().push(index);
                    }
                }
            }
            PreparedContext {
                source: context,
                by_name,
                by_id,
            }
        })
        .collect()
}

fn prefer_canonical_node(indices: &[usize], context: &PreparedContext<'_>) -> Option<usize> {
    indices
        .iter()
        .copied()
        .find(|index| context.source.nodes[*index].canonical)
        .or_else(|| indices.first().copied())
}

fn strip_state_suffix_for_context(
    runtime_name: &str,
    context: &RuntimeReplayContextDto,
) -> Option<String> {
    let raw = normalize(runtime_name);
    if context.suffix_parts.is_empty() {
        return Some(raw);
    }
    let suffix = format!("#{}", context.suffix_parts.join("#"));
    raw.strip_suffix(&suffix).map(str::to_string)
}

pub(super) fn strip_data_suffix_for_context(
    runtime_name: &str,
    context: &RuntimeReplayContextDto,
) -> String {
    let raw = normalize(runtime_name);
    if context.suffix_parts.is_empty() {
        return raw;
    }
    let suffix = format!("_{}", context.suffix_parts.join("_"));
    raw.strip_suffix(&suffix).unwrap_or(&raw).to_string()
}

pub(super) fn runtime_data_key_for_context(
    local_key: &str,
    context: &RuntimeReplayContextDto,
) -> String {
    let key = normalize(local_key);
    if key.is_empty() || context.suffix_parts.is_empty() {
        return key;
    }
    format!("{}_{}", key, context.suffix_parts.join("_"))
}

pub(super) fn resolve_runtime_state_in_context(
    runtime_name: &str,
    context: &PreparedContext<'_>,
) -> Option<StateResolution> {
    let local_name = strip_state_suffix_for_context(runtime_name, context.source)?;

    if let Some(indices) = context.by_name.get(&local_name) {
        if let Some(node_index) = prefer_canonical_node(indices, context) {
            return Some(StateResolution {
                node_index,
                local_name,
                exact: true,
                collapsed: false,
            });
        }
    }

    let mut wrappers: Vec<(usize, usize)> = Vec::new();
    for (node_index, node) in context.source.nodes.iter().enumerate() {
        if node.node_type != "submachine" {
            continue;
        }
        for name in &node.names {
            let name = normalize(name);
            if name.is_empty() {
                continue;
            }
            if local_name == name || local_name.ends_with(&format!("#{name}")) {
                wrappers.push((node_index, name.len()));
            }
        }
    }
    wrappers.sort_by_key(|(_, length)| std::cmp::Reverse(*length));

    wrappers.first().map(|(node_index, _)| StateResolution {
        node_index: *node_index,
        local_name,
        exact: false,
        collapsed: true,
    })
}

pub(super) fn best_context_for_runtime_state(
    runtime_state: &str,
    contexts: &[PreparedContext<'_>],
    exact_only: bool,
) -> Option<(usize, StateResolution)> {
    let mut best: Option<(usize, StateResolution, (i32, i32))> = None;
    for (context_index, context) in contexts.iter().enumerate() {
        let Some(resolved) = resolve_runtime_state_in_context(runtime_state, context) else {
            continue;
        };
        if exact_only && !resolved.exact {
            continue;
        }
        let score = (
            i32::from(resolved.exact),
            context.source.suffix_parts.len() as i32,
        );
        if best.as_ref().map_or(true, |current| score > current.2) {
            best = Some((context_index, resolved, score));
        }
    }
    best.map(|(context_index, resolved, _)| (context_index, resolved))
}

pub(super) fn slot_definition_key<'a>(
    node: &'a RuntimeReplayNodeDto,
    access: &str,
    slot_index: Option<usize>,
) -> Option<&'a str> {
    let slot_index = slot_index?;
    match access {
        "read" => node.in_slot_keys.get(slot_index).map(String::as_str),
        "write" => node.out_slot_keys.get(slot_index).map(String::as_str),
        _ => None,
    }
}
