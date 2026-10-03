use std::collections::{BTreeMap, HashMap, HashSet};

use super::context::{
    best_context_for_runtime_state, normalize, resolve_runtime_state_in_context,
    runtime_data_key_for_context, slot_definition_key, strip_data_suffix_for_context,
    PreparedContext, StateResolution,
};
use super::expressions::evaluate_runtime_expression;
use super::types::{
    ResolvedRuntimeDataSampleDto, ResolvedRuntimeParameterSampleDto, ResolvedRuntimeSlotSampleDto,
    RuntimeChangesStepDto, RuntimeChangesTimelineDto, RuntimeParameterTimelineDto,
    RuntimeReplayRequestDto, RuntimeReplaySlotEdgeDto, RuntimeSlotBindingDto,
    RuntimeSlotTimelineDto, RuntimeValueDto,
};

fn resolve_slot_sample_bindings(
    sample: &super::types::RuntimeSlotSampleDto,
    node: &super::types::RuntimeReplayNodeDto,
    slot_edges: &[RuntimeReplaySlotEdgeDto],
) -> Vec<RuntimeSlotBindingDto> {
    let mut candidates: Vec<&RuntimeReplaySlotEdgeDto> = slot_edges
        .iter()
        .filter(|edge| edge.skill_node_id == node.id)
        .collect();
    if candidates.is_empty() {
        return Vec::new();
    }

    if !sample.slot_key.trim().is_empty() {
        let keyed: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|edge| {
                slot_definition_key(node, &edge.access, edge.slot_index)
                    .is_some_and(|key| normalize(key) == normalize(&sample.slot_key))
            })
            .collect();
        if !keyed.is_empty() {
            candidates = keyed;
        }
    }

    let preferred_access = if sample.kind == "write" {
        "write"
    } else {
        "read"
    };
    let preferred: Vec<_> = candidates
        .iter()
        .copied()
        .filter(|edge| normalize(&edge.access) == preferred_access)
        .collect();
    if !preferred.is_empty() {
        candidates = preferred;
    }

    if sample.slot_key.trim().is_empty() && candidates.len() != 1 {
        return Vec::new();
    }

    candidates
        .into_iter()
        .filter_map(|edge| {
            let path = normalize(&edge.path).trim_start_matches('/').to_string();
            if edge.id.trim().is_empty() || path.is_empty() {
                None
            } else {
                Some(RuntimeSlotBindingDto {
                    edge_id: edge.id.clone(),
                    access: normalize(&edge.access),
                    path,
                })
            }
        })
        .collect()
}

pub(super) fn resolve_runtime_slot_timeline(
    request: &RuntimeReplayRequestDto,
    contexts: &[PreparedContext<'_>],
) -> RuntimeSlotTimelineDto {
    let mut samples: Vec<ResolvedRuntimeSlotSampleDto> = request
        .runtime_log
        .slot_samples
        .iter()
        .map(|sample| {
            let best = best_context_for_runtime_state(&sample.state, contexts, true);
            if let Some((context_index, resolved)) = best {
                let context = contexts[context_index].source;
                let node = &context.nodes[resolved.node_index];
                let bindings = resolve_slot_sample_bindings(sample, node, &context.slot_edges);
                let mut seen_paths = HashSet::new();
                let paths = bindings
                    .iter()
                    .filter_map(|binding| {
                        if seen_paths.insert(binding.path.clone()) {
                            Some(binding.path.clone())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>();
                let edge_ids = bindings
                    .iter()
                    .map(|binding| binding.edge_id.clone())
                    .collect::<Vec<_>>();
                let is_resolved = !bindings.is_empty();

                ResolvedRuntimeSlotSampleDto {
                    timestamp: sample.timestamp.clone(),
                    line: sample.line,
                    state: sample.state.clone(),
                    value: sample.value.clone(),
                    kind: sample.kind.clone(),
                    operation: sample.operation.clone(),
                    slot_key: sample.slot_key.clone(),
                    tab_id: Some(context.tab_id.clone()),
                    node_id: Some(node.id.clone()),
                    local_state: resolved.local_name,
                    bindings,
                    edge_ids,
                    paths,
                    resolved: is_resolved,
                }
            } else {
                ResolvedRuntimeSlotSampleDto {
                    timestamp: sample.timestamp.clone(),
                    line: sample.line,
                    state: sample.state.clone(),
                    value: sample.value.clone(),
                    kind: sample.kind.clone(),
                    operation: sample.operation.clone(),
                    slot_key: sample.slot_key.clone(),
                    local_state: sample.state.clone(),
                    ..Default::default()
                }
            }
        })
        .collect();
    samples.sort_by_key(|sample| sample.line);

    let mut snapshots = Vec::with_capacity(request.runtime_log.steps.len());
    let mut current_values: BTreeMap<String, BTreeMap<String, ResolvedRuntimeSlotSampleDto>> =
        BTreeMap::new();
    let mut sample_index = 0usize;

    for step in &request.runtime_log.steps {
        while sample_index < samples.len() && samples[sample_index].line <= step.line {
            let sample = &samples[sample_index];
            if let Some(tab_id) = &sample.tab_id {
                for path in &sample.paths {
                    current_values
                        .entry(tab_id.clone())
                        .or_default()
                        .insert(path.clone(), sample.clone());
                }
            }
            sample_index += 1;
        }
        snapshots.push(current_values.clone());
    }

    RuntimeSlotTimelineDto {
        unresolved_count: samples.iter().filter(|sample| !sample.resolved).count(),
        snapshots,
        samples,
    }
}

pub(super) fn resolve_runtime_parameter_timeline(
    request: &RuntimeReplayRequestDto,
    contexts: &[PreparedContext<'_>],
) -> RuntimeParameterTimelineDto {
    let mut samples: Vec<ResolvedRuntimeParameterSampleDto> = request
        .runtime_log
        .parameter_samples
        .iter()
        .map(|sample| {
            if let Some((context_index, resolved)) =
                best_context_for_runtime_state(&sample.state, contexts, true)
            {
                let context = contexts[context_index].source;
                let node = &context.nodes[resolved.node_index];
                ResolvedRuntimeParameterSampleDto {
                    timestamp: sample.timestamp.clone(),
                    line: sample.line,
                    state: sample.state.clone(),
                    key: sample.key.clone(),
                    expr: sample.expr.clone(),
                    value: sample.value.clone(),
                    tab_id: Some(context.tab_id.clone()),
                    node_id: Some(node.id.clone()),
                    local_state: resolved.local_name,
                    resolved: true,
                }
            } else {
                ResolvedRuntimeParameterSampleDto {
                    timestamp: sample.timestamp.clone(),
                    line: sample.line,
                    state: sample.state.clone(),
                    key: sample.key.clone(),
                    expr: sample.expr.clone(),
                    value: sample.value.clone(),
                    local_state: sample.state.clone(),
                    ..Default::default()
                }
            }
        })
        .collect();
    samples.sort_by_key(|sample| sample.line);

    let mut snapshots = Vec::with_capacity(request.runtime_log.steps.len());
    let mut current_values: BTreeMap<
        String,
        BTreeMap<String, BTreeMap<String, ResolvedRuntimeParameterSampleDto>>,
    > = BTreeMap::new();
    let mut sample_index = 0usize;

    for step in &request.runtime_log.steps {
        while sample_index < samples.len() && samples[sample_index].line <= step.line {
            let sample = &samples[sample_index];
            if let (Some(tab_id), Some(node_id)) = (&sample.tab_id, &sample.node_id) {
                if !sample.key.is_empty() {
                    current_values
                        .entry(tab_id.clone())
                        .or_default()
                        .entry(node_id.clone())
                        .or_default()
                        .insert(sample.key.clone(), sample.clone());
                }
            }
            sample_index += 1;
        }
        snapshots.push(current_values.clone());
    }

    RuntimeParameterTimelineDto {
        unresolved_count: samples.iter().filter(|sample| !sample.resolved).count(),
        snapshots,
        samples,
    }
}

fn resolve_runtime_data_samples(
    data_samples: &[super::types::RuntimeDataSampleDto],
    contexts: &[PreparedContext<'_>],
) -> Vec<ResolvedRuntimeDataSampleDto> {
    data_samples
        .iter()
        .map(|sample| {
            let mut best: Option<(usize, String, bool, Option<StateResolution>, i32)> = None;
            for (context_index, context) in contexts.iter().enumerate() {
                let local_key = strip_data_suffix_for_context(&sample.key, context.source);
                let known_variable = context
                    .source
                    .global_data_model
                    .iter()
                    .any(|entry| normalize(&entry.id) == normalize(&local_key));
                let state_resolution = resolve_runtime_state_in_context(&sample.state, context);
                let suffix = if context.source.suffix_parts.is_empty() {
                    String::new()
                } else {
                    format!("_{}", context.source.suffix_parts.join("_"))
                };
                let data_suffix_matches = context.source.suffix_parts.is_empty()
                    || normalize(&sample.key).ends_with(&suffix);

                if !known_variable && state_resolution.is_none() {
                    continue;
                }

                let mut score = (context.source.suffix_parts.len() as i32) * 2;
                if data_suffix_matches {
                    score += 10;
                }
                if known_variable {
                    score += 100;
                }
                if state_resolution
                    .as_ref()
                    .is_some_and(|resolved| resolved.exact)
                {
                    score += 20;
                } else if state_resolution
                    .as_ref()
                    .is_some_and(|resolved| resolved.collapsed)
                {
                    score += 5;
                }

                if best.as_ref().map_or(true, |current| score > current.4) {
                    best = Some((
                        context_index,
                        local_key,
                        known_variable,
                        state_resolution,
                        score,
                    ));
                }
            }

            if let Some((context_index, local_key, known_variable, state_resolution, _)) = best {
                let context = contexts[context_index].source;
                ResolvedRuntimeDataSampleDto {
                    timestamp: sample.timestamp.clone(),
                    line: sample.line,
                    state: sample.state.clone(),
                    key: sample.key.clone(),
                    expr: sample.expr.clone(),
                    kind: sample.kind.clone(),
                    tab_id: Some(context.tab_id.clone()),
                    local_state: state_resolution
                        .as_ref()
                        .map(|resolved| resolved.local_name.clone())
                        .unwrap_or_else(|| sample.state.clone()),
                    local_key: local_key.clone(),
                    runtime_key: if sample.key.trim().is_empty() {
                        runtime_data_key_for_context(&local_key, context)
                    } else {
                        normalize(&sample.key)
                    },
                    resolved: known_variable || state_resolution.is_some(),
                    known_variable,
                    evaluated: false,
                    value: RuntimeValueDto::String(sample.value.clone()),
                    previous_value: None,
                    evaluated_value: None,
                    evaluation_error: String::new(),
                }
            } else {
                ResolvedRuntimeDataSampleDto {
                    timestamp: sample.timestamp.clone(),
                    line: sample.line,
                    state: sample.state.clone(),
                    key: sample.key.clone(),
                    expr: sample.expr.clone(),
                    kind: sample.kind.clone(),
                    local_state: sample.state.clone(),
                    local_key: sample.key.clone(),
                    runtime_key: normalize(&sample.key),
                    value: RuntimeValueDto::String(sample.value.clone()),
                    ..Default::default()
                }
            }
        })
        .collect()
}

fn build_initial_runtime_data_values(
    contexts: &[PreparedContext<'_>],
) -> HashMap<String, RuntimeValueDto> {
    #[derive(Clone)]
    struct PendingInitializer {
        context_index: usize,
        runtime_key: String,
        expression: String,
    }

    let mut values = HashMap::new();
    let mut pending = Vec::new();
    for (context_index, context) in contexts.iter().enumerate() {
        for entry in &context.source.global_data_model {
            let local_key = normalize(&entry.id);
            if local_key.is_empty() || local_key.starts_with('#') {
                continue;
            }
            pending.push(PendingInitializer {
                context_index,
                runtime_key: runtime_data_key_for_context(&local_key, context.source),
                expression: entry.expr.clone(),
            });
        }
    }

    let max_passes = pending.len() + 1;
    for _ in 0..max_passes {
        if pending.is_empty() {
            break;
        }
        let mut progress = false;
        let mut index = pending.len();
        while index > 0 {
            index -= 1;
            let item = &pending[index];
            let expression = normalize(&item.expression);
            if expression.is_empty() {
                continue;
            }
            let suffix_parts = &contexts[item.context_index].source.suffix_parts;
            if let Ok(value) = evaluate_runtime_expression(&expression, &values, suffix_parts) {
                values.insert(item.runtime_key.clone(), value);
                pending.remove(index);
                progress = true;
            }
        }
        if !progress {
            break;
        }
    }

    values
}

fn evaluate_runtime_data_samples(
    samples: Vec<ResolvedRuntimeDataSampleDto>,
    contexts: &[PreparedContext<'_>],
) -> Vec<ResolvedRuntimeDataSampleDto> {
    let mut values = build_initial_runtime_data_values(contexts);
    let context_by_tab: HashMap<&str, usize> = contexts
        .iter()
        .enumerate()
        .map(|(index, context)| (context.source.tab_id.as_str(), index))
        .collect();
    let mut samples = samples;
    samples.sort_by_key(|sample| sample.line);

    samples
        .into_iter()
        .map(|mut sample| {
            let context_index = sample
                .tab_id
                .as_deref()
                .and_then(|tab_id| context_by_tab.get(tab_id).copied());
            if sample.runtime_key.is_empty() {
                sample.runtime_key = context_index
                    .map(|index| {
                        runtime_data_key_for_context(&sample.local_key, contexts[index].source)
                    })
                    .unwrap_or_else(|| sample.local_key.clone());
            }

            sample.previous_value = values.get(&sample.runtime_key).cloned();
            let suffix_parts = context_index
                .map(|index| contexts[index].source.suffix_parts.as_slice())
                .unwrap_or(&[]);
            match evaluate_runtime_expression(&sample.expr, &values, suffix_parts) {
                Ok(value) => {
                    if !sample.runtime_key.is_empty() {
                        values.insert(sample.runtime_key.clone(), value.clone());
                    }
                    sample.evaluated = true;
                    sample.evaluated_value = Some(value.clone());
                    sample.value = value;
                    sample.evaluation_error.clear();
                }
                Err(error) => {
                    sample.evaluated = false;
                    sample.evaluated_value = None;
                    sample.evaluation_error = error;
                }
            }
            sample
        })
        .collect()
}

struct StepLineIndex {
    endpoints: Vec<(usize, usize)>,
}

impl StepLineIndex {
    fn new(steps: &[super::types::RuntimeStepDto]) -> Self {
        let mut endpoints = Vec::new();
        let mut max_line = 0;
        for (index, step) in steps.iter().enumerate() {
            // Only record highs can be the first covering interval. This also
            // preserves first-match behavior for duplicate or unsorted steps.
            if step.line > max_line {
                endpoints.push((step.line, index));
                max_line = step.line;
            }
        }
        Self { endpoints }
    }

    fn step_for_line(&self, line: usize) -> Option<usize> {
        if line == 0 {
            return None;
        }
        let position = self.endpoints.partition_point(|(end, _)| *end < line);
        self.endpoints.get(position).map(|(_, index)| *index)
    }
}

pub(super) fn build_runtime_changes_timeline(
    request: &RuntimeReplayRequestDto,
    contexts: &[PreparedContext<'_>],
    slot_timeline: &RuntimeSlotTimelineDto,
    parameter_timeline: &RuntimeParameterTimelineDto,
) -> RuntimeChangesTimelineDto {
    let resolved_data_samples = evaluate_runtime_data_samples(
        resolve_runtime_data_samples(&request.runtime_log.data_samples, contexts),
        contexts,
    );

    let mut parameter_lines: HashMap<(&str, &str), Vec<usize>> = HashMap::new();
    for parameter in &parameter_timeline.samples {
        parameter_lines
            .entry((parameter.state.trim(), parameter.key.trim()))
            .or_default()
            .push(parameter.line);
    }
    for lines in parameter_lines.values_mut() {
        lines.sort_unstable();
    }
    let mirrored_parameter_data_lines: HashSet<usize> = resolved_data_samples
        .iter()
        .filter(|data_sample| {
            parameter_lines
                .get(&(data_sample.state.trim(), data_sample.key.trim()))
                .is_some_and(|lines| {
                    let position =
                        lines.partition_point(|line| *line < data_sample.line.saturating_sub(2));
                    lines
                        .get(position)
                        .is_some_and(|line| *line <= data_sample.line.saturating_add(2))
                })
        })
        .map(|sample| sample.line)
        .collect();

    let mut steps: Vec<RuntimeChangesStepDto> = request
        .runtime_log
        .steps
        .iter()
        .enumerate()
        .map(|(step_index, step)| RuntimeChangesStepDto {
            step_index,
            timestamp: step.timestamp.clone(),
            ..Default::default()
        })
        .collect();

    let step_index = StepLineIndex::new(&request.runtime_log.steps);
    for sample in &slot_timeline.samples {
        if let Some(index) = step_index.step_for_line(sample.line) {
            steps[index].slot_accesses.push(sample.clone());
            if sample.kind == "write" {
                steps[index].slot_writes.push(sample.clone());
            } else if sample.kind == "read" {
                steps[index].slot_reads.push(sample.clone());
            }
        }
    }
    for sample in &parameter_timeline.samples {
        if let Some(index) = step_index.step_for_line(sample.line) {
            steps[index].parameters.push(sample.clone());
        }
    }
    for sample in &resolved_data_samples {
        if sample.key.trim().starts_with('#')
            || mirrored_parameter_data_lines.contains(&sample.line)
        {
            continue;
        }
        if let Some(index) = step_index.step_for_line(sample.line) {
            steps[index].variables.push(sample.clone());
        }
    }

    RuntimeChangesTimelineDto {
        steps,
        data_samples: resolved_data_samples,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::runtime::types::{RuntimeDataSampleDto, RuntimeLogDto, RuntimeStepDto};

    #[test]
    fn step_intervals_match_linear_scan_for_zero_duplicates_and_unsorted_lines() {
        for encoded in 0..625usize {
            let mut encoded = encoded;
            let steps = (0..4)
                .map(|_| {
                    let line = encoded % 5;
                    encoded /= 5;
                    RuntimeStepDto {
                        line,
                        ..Default::default()
                    }
                })
                .collect::<Vec<_>>();
            let index = StepLineIndex::new(&steps);
            for line in [0, 1, 2, 3, 4, 5, usize::MAX] {
                let mut previous_line = 0;
                let expected = steps.iter().position(|step| {
                    let contains = line > previous_line && line <= step.line;
                    previous_line = step.line;
                    contains
                });
                assert_eq!(
                    index.step_for_line(line),
                    expected,
                    "steps={steps:?}, line={line}"
                );
            }
        }
        assert_eq!(StepLineIndex::new(&[]).step_for_line(1), None);
    }

    #[test]
    fn changes_keep_exact_boundaries_sample_order_and_duplicates() {
        let request = RuntimeReplayRequestDto {
            runtime_log: RuntimeLogDto {
                steps: [0, 10, 10, 20]
                    .into_iter()
                    .map(|line| RuntimeStepDto {
                        line,
                        timestamp: line.to_string(),
                        ..Default::default()
                    })
                    .collect(),
                data_samples: [0, 10, 10, 11, 20, 21]
                    .into_iter()
                    .map(|line| RuntimeDataSampleDto {
                        line,
                        key: "variable".into(),
                        expr: line.to_string(),
                        ..Default::default()
                    })
                    .collect(),
                ..Default::default()
            },
            ..Default::default()
        };
        let slots = RuntimeSlotTimelineDto {
            samples: [
                (21, "write"),
                (0, "read"),
                (11, "write"),
                (10, "read"),
                (1, "other"),
                (11, "write"),
                (20, "read"),
            ]
            .into_iter()
            .map(|(line, kind)| ResolvedRuntimeSlotSampleDto {
                line,
                kind: kind.into(),
                ..Default::default()
            })
            .collect(),
            ..Default::default()
        };
        let parameters = RuntimeParameterTimelineDto {
            samples: [20, 10, 10, 21, 0]
                .into_iter()
                .map(|line| ResolvedRuntimeParameterSampleDto {
                    line,
                    key: "parameter".into(),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let changes = build_runtime_changes_timeline(&request, &[], &slots, &parameters);
        assert_eq!(
            changes
                .steps
                .iter()
                .map(|step| step.step_index)
                .collect::<Vec<_>>(),
            [0, 1, 2, 3]
        );
        assert_eq!(
            changes
                .steps
                .iter()
                .map(|step| step.timestamp.as_str())
                .collect::<Vec<_>>(),
            ["0", "10", "10", "20"]
        );
        for index in [0, 2] {
            assert!(changes.steps[index].slot_accesses.is_empty());
            assert!(changes.steps[index].parameters.is_empty());
            assert!(changes.steps[index].variables.is_empty());
        }
        assert_eq!(
            changes.steps[1]
                .slot_accesses
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [10, 1]
        );
        assert_eq!(
            changes.steps[1]
                .slot_reads
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [10]
        );
        assert!(changes.steps[1].slot_writes.is_empty());
        assert_eq!(
            changes.steps[3]
                .slot_accesses
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [11, 11, 20]
        );
        assert_eq!(
            changes.steps[3]
                .slot_writes
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [11, 11]
        );
        assert_eq!(
            changes.steps[3]
                .slot_reads
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [20]
        );
        assert_eq!(
            changes.steps[1]
                .parameters
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [10, 10]
        );
        assert_eq!(
            changes.steps[3]
                .parameters
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [20]
        );
        assert_eq!(
            changes.steps[1]
                .variables
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [10, 10]
        );
        assert_eq!(
            changes.steps[3]
                .variables
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [11, 20]
        );
        assert_eq!(
            changes
                .data_samples
                .iter()
                .map(|sample| sample.line)
                .collect::<Vec<_>>(),
            [0, 10, 10, 11, 20, 21]
        );
        assert!(changes.data_samples.iter().all(|sample| sample.evaluated));
        assert_eq!(
            changes.data_samples[2].previous_value,
            Some(RuntimeValueDto::Number(10.0))
        );
    }

    #[test]
    fn mirrored_variables_keep_trimmed_keys_two_line_window_and_line_wide_suppression() {
        let data = |line, state: &str, key: &str, name: &str| RuntimeDataSampleDto {
            line,
            state: state.into(),
            key: key.into(),
            timestamp: name.into(),
            expr: "1".into(),
            ..Default::default()
        };
        let request = RuntimeReplayRequestDto {
            runtime_log: RuntimeLogDto {
                steps: vec![RuntimeStepDto {
                    line: usize::MAX,
                    ..Default::default()
                }],
                data_samples: vec![
                    data(13, "S", "counter", "after-window"),
                    data(8, "S", "counter", "lower-bound"),
                    data(8, "Other", "unrelated", "same-line-other-state"),
                    data(12, " S ", " counter ", "upper-bound"),
                    data(12, "S", "unrelated", "same-line-other-key"),
                    data(7, "S", "counter", "before-window"),
                    data(10, "S", "counter", "exact"),
                    data(14, "s", "Counter", "case-sensitive"),
                    data(2, "S", "low", "low-bound"),
                    data(3, "S", "low", "outside-low"),
                    data(5, "S", " #internal ", "internal"),
                    data(usize::MAX - 2, "S", "high", "high-bound"),
                    data(usize::MAX - 3, "S", "high", "outside-high"),
                    data(usize::MAX, "S", "high", "high-exact"),
                ],
                ..Default::default()
            },
            ..Default::default()
        };
        let parameters = RuntimeParameterTimelineDto {
            samples: [
                (10, " counter "),
                (usize::MAX, "high"),
                (0, "low"),
                (10, "counter"),
            ]
            .into_iter()
            .map(|(line, key)| ResolvedRuntimeParameterSampleDto {
                line,
                state: " S ".into(),
                key: key.into(),
                ..Default::default()
            })
            .collect(),
            ..Default::default()
        };
        let changes = build_runtime_changes_timeline(
            &request,
            &[],
            &RuntimeSlotTimelineDto::default(),
            &parameters,
        );
        assert_eq!(
            changes.steps[0]
                .variables
                .iter()
                .map(|sample| sample.timestamp.as_str())
                .collect::<Vec<_>>(),
            [
                "outside-low",
                "before-window",
                "after-window",
                "case-sensitive",
                "outside-high"
            ]
        );
        assert_eq!(changes.steps[0].parameters.len(), 3);
        assert_eq!(
            changes.data_samples.len(),
            request.runtime_log.data_samples.len()
        );
        assert!(changes.data_samples.iter().all(|sample| sample.evaluated));
    }
}
