use std::collections::{HashMap, HashSet};

use crate::core::transitions::events::transition_exit_token;

use super::context::{resolve_runtime_state_in_context, PreparedContext, StateResolution};
use super::types::{ResolvedRuntimeStepDto, RuntimeReplayRequestDto, RuntimeStepDto};

struct StepResolution {
    context_index: usize,
    source: Option<StateResolution>,
    target: Option<StateResolution>,
    source_node_index: Option<usize>,
    target_node_index: Option<usize>,
    matched_edge_index: Option<usize>,
    matched_source_handle: Option<String>,
    collapsed_inside_closed_sub_machine: bool,
    score: i32,
}

fn wildcard_event_matches(pattern: &str, actual: &str) -> bool {
    let pattern = pattern.trim().as_bytes();
    let actual = actual.trim().as_bytes();
    if pattern.is_empty() || actual.is_empty() {
        return false;
    }
    if pattern == b"*" {
        return true;
    }

    fn matches_from(
        pattern: &[u8],
        actual: &[u8],
        p: usize,
        a: usize,
        memo: &mut HashMap<(usize, usize), bool>,
    ) -> bool {
        if let Some(value) = memo.get(&(p, a)) {
            return *value;
        }
        let result = if p == pattern.len() {
            a == actual.len()
        } else if pattern[p] == b'*' {
            if p + 1 < pattern.len() && pattern[p + 1] == b'*' {
                matches_from(pattern, actual, p + 2, a, memo)
                    || (a < actual.len() && matches_from(pattern, actual, p, a + 1, memo))
            } else {
                a < actual.len()
                    && actual[a] != b'.'
                    && (matches_from(pattern, actual, p + 1, a + 1, memo)
                        || matches_from(pattern, actual, p, a + 1, memo))
            }
        } else {
            a < actual.len()
                && pattern[p] == actual[a]
                && matches_from(pattern, actual, p + 1, a + 1, memo)
        };
        memo.insert((p, a), result);
        result
    }

    matches_from(pattern, actual, 0, 0, &mut HashMap::new())
}

fn event_descriptor_matches(handle: &str, step: &RuntimeStepDto, local_source: &str) -> bool {
    let descriptor = handle.trim();
    let raw_event = step.event.trim();
    if descriptor.is_empty() || raw_event.is_empty() {
        return false;
    }
    let actual_token = transition_exit_token(raw_event, local_source);

    descriptor.split_whitespace().any(|candidate| {
        wildcard_event_matches(candidate, raw_event)
            || wildcard_event_matches(candidate, &actual_token)
            || wildcard_event_matches(
                &transition_exit_token(candidate, local_source),
                &actual_token,
            )
    })
}

fn resolve_step_in_context(
    step: &RuntimeStepDto,
    context_index: usize,
    context: &PreparedContext<'_>,
) -> Option<StepResolution> {
    let source = resolve_runtime_state_in_context(&step.source, context);
    let target = resolve_runtime_state_in_context(&step.target, context);
    if source.is_none() && target.is_none() {
        return None;
    }

    let source_ids: HashSet<&str> = source
        .as_ref()
        .map(|resolved| context.source.nodes[resolved.node_index].id.as_str())
        .into_iter()
        .collect();
    let target_ids: HashSet<&str> = target
        .as_ref()
        .map(|resolved| context.source.nodes[resolved.node_index].id.as_str())
        .into_iter()
        .collect();
    let local_source = source
        .as_ref()
        .map(|resolved| resolved.local_name.as_str())
        .unwrap_or(step.source.as_str());

    let mut matched_edge_index = None;
    let mut matched_source_id: Option<String> = None;
    let mut matched_source_handle = None;

    for (edge_index, edge) in context.source.transition_edges.iter().enumerate() {
        if !target_ids.is_empty() && !target_ids.contains(edge.semantic_target_id.as_str()) {
            continue;
        }
        if let Some(source_entry) = edge.semantic_sources.iter().find(|entry| {
            (source_ids.is_empty() || source_ids.contains(entry.source_id.as_str()))
                && event_descriptor_matches(&entry.source_handle, step, local_source)
        }) {
            matched_edge_index = Some(edge_index);
            matched_source_id = Some(source_entry.source_id.clone());
            matched_source_handle = Some(source_entry.source_handle.clone());
            break;
        }
    }

    let source_node_index = matched_source_id
        .as_deref()
        .and_then(|id| context.by_id.get(id).copied())
        .or_else(|| source.as_ref().map(|resolved| resolved.node_index));
    let target_node_index = matched_edge_index
        .and_then(|edge_index| {
            context
                .by_id
                .get(&context.source.transition_edges[edge_index].semantic_target_id)
                .copied()
        })
        .or_else(|| target.as_ref().map(|resolved| resolved.node_index));

    let collapsed_inside_closed_sub_machine = matched_edge_index.is_none()
        && source_node_index.is_some()
        && source_node_index == target_node_index
        && source_node_index
            .is_some_and(|index| context.source.nodes[index].node_type == "submachine")
        && (source.as_ref().is_some_and(|resolved| resolved.collapsed)
            || target.as_ref().is_some_and(|resolved| resolved.collapsed));

    let mut score = (context.source.suffix_parts.len() as i32) * 2;
    if source.as_ref().is_some_and(|resolved| resolved.exact) {
        score += 20;
    } else if source.as_ref().is_some_and(|resolved| resolved.collapsed) {
        score += 5;
    }
    if target.as_ref().is_some_and(|resolved| resolved.exact) {
        score += 20;
    } else if target.as_ref().is_some_and(|resolved| resolved.collapsed) {
        score += 5;
    }
    if matched_edge_index.is_some() {
        score += 100;
    }
    if collapsed_inside_closed_sub_machine {
        score += 15;
    }

    Some(StepResolution {
        context_index,
        source,
        target,
        source_node_index,
        target_node_index,
        matched_edge_index,
        matched_source_handle,
        collapsed_inside_closed_sub_machine,
        score,
    })
}

pub(super) fn resolve_runtime_trace(
    request: &RuntimeReplayRequestDto,
    contexts: &[PreparedContext<'_>],
) -> Vec<ResolvedRuntimeStepDto> {
    request
        .runtime_log
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            let mut best: Option<StepResolution> = None;
            for (context_index, context) in contexts.iter().enumerate() {
                let Some(candidate) = resolve_step_in_context(step, context_index, context) else {
                    continue;
                };
                if best
                    .as_ref()
                    .map_or(true, |current| candidate.score > current.score)
                {
                    best = Some(candidate);
                }
            }
            let event_token = transition_exit_token(&step.event, &step.source);

            if let Some(best) = best {
                let context = contexts[best.context_index].source;
                let source_node_id = best
                    .source_node_index
                    .map(|node_index| context.nodes[node_index].id.clone());
                let target_node_id = best
                    .target_node_index
                    .map(|node_index| context.nodes[node_index].id.clone());
                let edge_id = best
                    .matched_edge_index
                    .map(|edge_index| context.transition_edges[edge_index].id.clone());
                let resolved = source_node_id.is_some()
                    && target_node_id.is_some()
                    && (edge_id.is_some() || best.collapsed_inside_closed_sub_machine);

                ResolvedRuntimeStepDto {
                    timestamp: step.timestamp.clone(),
                    source: step.source.clone(),
                    target: step.target.clone(),
                    event: step.event.clone(),
                    line: step.line,
                    index,
                    event_token,
                    tab_id: Some(context.tab_id.clone()),
                    tab_title: context.title.clone(),
                    local_source: best
                        .source
                        .as_ref()
                        .map(|resolved| resolved.local_name.clone())
                        .unwrap_or_else(|| step.source.clone()),
                    local_target: best
                        .target
                        .as_ref()
                        .map(|resolved| resolved.local_name.clone())
                        .unwrap_or_else(|| step.target.clone()),
                    matched_event_descriptor: best.matched_source_handle,
                    edge_id,
                    source_node_id,
                    target_node_id,
                    collapsed_into_sub_machine: best.collapsed_inside_closed_sub_machine,
                    resolved,
                }
            } else {
                ResolvedRuntimeStepDto {
                    timestamp: step.timestamp.clone(),
                    source: step.source.clone(),
                    target: step.target.clone(),
                    event: step.event.clone(),
                    line: step.line,
                    index,
                    event_token,
                    tab_id: None,
                    tab_title: String::new(),
                    local_source: step.source.clone(),
                    local_target: step.target.clone(),
                    ..Default::default()
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::wildcard_event_matches;

    #[test]
    fn wildcard_segments_match_like_scxml_descriptors() {
        assert!(wildcard_event_matches("Talk.*", "Talk.success"));
        assert!(!wildcard_event_matches("Talk.*", "Talk.success.more"));
        assert!(wildcard_event_matches("event.**", "event.a.b"));
        assert!(wildcard_event_matches("*", "anything.at.all"));
    }
}
