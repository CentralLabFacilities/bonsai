use super::context::prepare_contexts;
use super::indexes::{build_slot_edge_index, build_trace_indexes};
use super::timelines::{
    build_runtime_changes_timeline, resolve_runtime_parameter_timeline,
    resolve_runtime_slot_timeline,
};
use super::trace::resolve_runtime_trace;
use super::types::{RuntimeReplayCacheDto, RuntimeReplayRequestDto};

pub(crate) fn prepare_runtime_replay(request: RuntimeReplayRequestDto) -> RuntimeReplayCacheDto {
    let contexts = prepare_contexts(&request.contexts);
    let resolved_steps = resolve_runtime_trace(&request, &contexts);
    let slot_timeline = resolve_runtime_slot_timeline(&request, &contexts);
    let parameter_timeline = resolve_runtime_parameter_timeline(&request, &contexts);
    let changes_timeline = build_runtime_changes_timeline(
        &request,
        &contexts,
        &slot_timeline,
        &parameter_timeline,
    );
    let (trace_edge_ids_by_tab, trace_node_ids_by_tab) =
        build_trace_indexes(&resolved_steps, &contexts);
    let slot_edge_ids_by_step = build_slot_edge_index(&changes_timeline);

    RuntimeReplayCacheDto {
        resolved_steps,
        slot_timeline,
        parameter_timeline,
        changes_timeline,
        slot_edge_ids_by_step,
        trace_edge_ids_by_tab,
        trace_node_ids_by_tab,
    }
}

#[cfg(test)]
mod tests {
    use super::prepare_runtime_replay;
    use crate::core::runtime::types::{
        RuntimeDataSampleDto, RuntimeLogDto, RuntimeParameterSampleDto,
        RuntimeReplayContextDto, RuntimeReplayDataModelEntryDto, RuntimeReplayNodeDto,
        RuntimeReplayRequestDto, RuntimeReplaySlotEdgeDto, RuntimeReplayTransitionEdgeDto,
        RuntimeReplayTransitionSourceDto, RuntimeSlotSampleDto, RuntimeStepDto,
    };

    #[test]
    fn resolves_trace_slots_parameters_and_assignments() {
        let request = RuntimeReplayRequestDto {
            runtime_log: RuntimeLogDto {
                steps: vec![RuntimeStepDto {
                    timestamp: "12:00:05".into(),
                    source: "demo.Source#main".into(),
                    target: "demo.Target#main".into(),
                    event: "Source.success".into(),
                    line: 10,
                }],
                slot_samples: vec![RuntimeSlotSampleDto {
                    timestamp: "12:00:02".into(),
                    line: 4,
                    state: "demo.Source#main".into(),
                    value: "model-a".into(),
                    kind: "write".into(),
                    operation: "memorized".into(),
                    slot_key: "Model".into(),
                }],
                parameter_samples: vec![RuntimeParameterSampleDto {
                    timestamp: "12:00:03".into(),
                    line: 5,
                    state: "demo.Source#main".into(),
                    key: "#speed".into(),
                    expr: "2".into(),
                    value: "2".into(),
                }],
                data_samples: vec![RuntimeDataSampleDto {
                    timestamp: "12:00:04".into(),
                    line: 6,
                    state: "demo.Source#main".into(),
                    key: "counter".into(),
                    expr: "counter + 1".into(),
                    value: "counter + 1".into(),
                    kind: "assign".into(),
                }],
                ..Default::default()
            },
            contexts: vec![RuntimeReplayContextDto {
                tab_id: "root".into(),
                title: "Root".into(),
                nodes: vec![
                    RuntimeReplayNodeDto {
                        id: "source".into(),
                        node_type: "custom".into(),
                        names: vec!["demo.Source#main".into(), "Source#main".into()],
                        canonical: true,
                        out_slot_keys: vec!["Model".into()],
                        ..Default::default()
                    },
                    RuntimeReplayNodeDto {
                        id: "target".into(),
                        node_type: "custom".into(),
                        names: vec!["demo.Target#main".into(), "Target#main".into()],
                        canonical: true,
                        ..Default::default()
                    },
                ],
                transition_edges: vec![RuntimeReplayTransitionEdgeDto {
                    id: "transition-1".into(),
                    source: "source".into(),
                    target: "target".into(),
                    semantic_target_id: "target".into(),
                    semantic_sources: vec![RuntimeReplayTransitionSourceDto {
                        source_id: "source".into(),
                        source_handle: "success".into(),
                    }],
                }],
                slot_edges: vec![RuntimeReplaySlotEdgeDto {
                    id: "slot-edge".into(),
                    skill_node_id: "source".into(),
                    access: "write".into(),
                    slot_index: Some(0),
                    path: "/model".into(),
                }],
                global_data_model: vec![RuntimeReplayDataModelEntryDto {
                    id: "counter".into(),
                    expr: "1".into(),
                }],
                ..Default::default()
            }],
        };

        let cache = prepare_runtime_replay(request);
        assert_eq!(cache.resolved_steps[0].edge_id.as_deref(), Some("transition-1"));
        assert_eq!(cache.slot_timeline.samples[0].paths, vec!["model"]);
        assert!(cache.parameter_timeline.samples[0].resolved);
        assert!(cache.changes_timeline.data_samples[0].evaluated);
        assert_eq!(cache.trace_edge_ids_by_tab["root"], vec!["transition-1"]);
        assert_eq!(cache.slot_edge_ids_by_step[0]["root"], vec!["slot-edge"]);
    }
}
