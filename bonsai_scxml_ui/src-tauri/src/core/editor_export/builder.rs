use crate::core::model::{DataModelEntryDto, Workflow, WorkflowDto};

use super::{
    index::ExportIndex,
    slots::build_slot_declarations,
    states::build_states,
    transitions::{build_edge_target_routes, build_transitions},
    types::EditorExportRequestDto,
};

pub(crate) fn build_workflow_from_editor(
    request: &EditorExportRequestDto,
) -> Result<Workflow, String> {
    let index = ExportIndex::new(request);
    let edge_routes = build_edge_target_routes(request, &index);
    let states = build_states(request, &index, &edge_routes);

    let root_nodes = states
        .iter()
        .filter(|state| state.parent_id.is_none())
        .collect::<Vec<_>>();
    let root_initial = root_nodes
        .iter()
        .copied()
        .find(|state| state.is_initial)
        .or_else(|| root_nodes.first().copied());

    Workflow::from_dto(WorkflowDto {
        name: None,
        initial_state_id: root_initial.map(|state| state.id.clone()),
        initial_scxml_state_id: root_initial.map(|state| state.scxml_id.clone()),
        states,
        transitions: build_transitions(request, &index),
        data_model: request
            .data_model
            .iter()
            .map(|entry| DataModelEntryDto {
                id: entry.id.clone(),
                type_name: None,
                expression: entry.expression.clone(),
            })
            .collect(),
        slot_declarations: build_slot_declarations(request),
    })
}

#[cfg(test)]
mod tests {
    use super::build_workflow_from_editor;
    use crate::core::editor_export::types::{
        EditorBehaviorExitTransitionDto, EditorExportEdgeDto, EditorExportNodeDto,
        EditorExportRequestDto,
    };

    fn node(id: &str, node_type: &str, parent: Option<&str>) -> EditorExportNodeDto {
        EditorExportNodeDto {
            id: id.into(),
            node_type: node_type.into(),
            parent_id: parent.map(str::to_string),
            label: id.into(),
            full_skill_name: id.into(),
            ..EditorExportNodeDto::default()
        }
    }

    #[test]
    fn flattens_atomic_parallel_lane() {
        let mut lane = node("Talk", "parallelLane", Some("parallel"));
        lane.full_skill_name = "Talk".into();
        let mut skill = node("talk-skill", "custom", Some("Talk"));
        skill.full_skill_name = "Talk".into();
        let request = EditorExportRequestDto {
            nodes: vec![node("parallel", "parallel", None), lane, skill],
            ..EditorExportRequestDto::default()
        };
        let workflow = build_workflow_from_editor(&request).unwrap();
        assert_eq!(workflow.states.len(), 2);
        let talk = workflow
            .states
            .iter()
            .find(|state| state.id == "talk-skill")
            .unwrap();
        assert_eq!(talk.parent_id.as_deref(), Some("parallel"));
    }

    #[test]
    fn hoists_transition_leaving_compound() {
        let request = EditorExportRequestDto {
            nodes: vec![
                node("compound", "compound", None),
                node("Talk", "custom", Some("compound")),
                node("Outside", "custom", None),
            ],
            edges: vec![EditorExportEdgeDto {
                id: "edge-1".into(),
                source: "Talk".into(),
                target: "Outside".into(),
                source_handle: "error".into(),
                ..EditorExportEdgeDto::default()
            }],
            ..EditorExportRequestDto::default()
        };
        let workflow = build_workflow_from_editor(&request).unwrap();
        assert_eq!(workflow.transitions.len(), 1);
        assert_eq!(workflow.transitions[0].source_state_id, "compound");
        assert_eq!(workflow.transitions[0].event, "Talk.error");
    }

    #[test]
    fn preserves_behavior_exit_send() {
        let mut exit = node("Nop", "custom", None);
        exit.is_behavior_exit = true;
        exit.behavior_exit_transitions = vec![EditorBehaviorExitTransitionDto {
            trigger_event: "Nop.fatal".into(),
            send_events: vec!["behavior.success".into()],
        }];
        let request = EditorExportRequestDto {
            nodes: vec![exit],
            ..EditorExportRequestDto::default()
        };
        let workflow = build_workflow_from_editor(&request).unwrap();
        assert_eq!(workflow.transitions[0].target_state_id, None);
        assert_eq!(workflow.transitions[0].sent_events, vec!["behavior.success"]);
    }
}
