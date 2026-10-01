use std::sync::RwLock;

use crate::core::model::{StateId, TransitionId, Workflow, WorkflowIndex};

use super::commands::{apply_command, WorkflowCommandChanges};
use super::types::{
    WorkflowCommandDto, WorkflowCommandResultDto, WorkflowDocumentSnapshotDto,
    WorkflowMetadataPatchDto, WorkflowPatchDto,
};

#[derive(Default)]
pub(crate) struct WorkflowDocumentStore {
    inner: RwLock<StoreState>,
}

#[derive(Default)]
struct StoreState {
    revision: u64,
    active: Option<StoredWorkflow>,
}

struct StoredWorkflow {
    workflow: Workflow,
    index: WorkflowIndex,
}

impl StoredWorkflow {
    fn new(workflow: Workflow) -> Self {
        let index = WorkflowIndex::new(&workflow);
        Self { workflow, index }
    }
}

impl WorkflowDocumentStore {
    pub(crate) fn replace(&self, workflow: Workflow) -> Result<u64, String> {
        let mut state = self.write()?;
        state.revision = state.revision.saturating_add(1).max(1);
        state.active = Some(StoredWorkflow::new(workflow));
        Ok(state.revision)
    }

    pub(crate) fn replace_if_revision(
        &self,
        workflow: Workflow,
        expected_revision: Option<u64>,
    ) -> Result<WorkflowDocumentSnapshotDto, String> {
        let mut state = self.write()?;
        check_revision(&state, expected_revision)?;
        state.revision = state.revision.saturating_add(1).max(1);
        state.active = Some(StoredWorkflow::new(workflow));
        snapshot_from_state(&state).ok_or_else(|| "Workflow document was not stored".to_string())
    }

    pub(crate) fn clear(&self) -> Result<(), String> {
        let mut state = self.write()?;
        state.revision = state.revision.saturating_add(1).max(1);
        state.active = None;
        Ok(())
    }

    pub(crate) fn snapshot(&self) -> Result<Option<WorkflowDocumentSnapshotDto>, String> {
        let state = self.read()?;
        Ok(snapshot_from_state(&state))
    }

    pub(crate) fn apply(
        &self,
        expected_revision: Option<u64>,
        command: WorkflowCommandDto,
    ) -> Result<WorkflowCommandResultDto, String> {
        let mut state = self.write()?;
        check_revision(&state, expected_revision)?;

        let stored = state
            .active
            .as_mut()
            .ok_or_else(|| "No active workflow document is loaded".to_string())?;
        let changes = apply_command(&mut stored.workflow, &stored.index, command)?;
        if changes.index_changed {
            stored.index = WorkflowIndex::new(&stored.workflow);
        }
        state.revision = state.revision.saturating_add(1).max(1);

        command_result(&state, changes)
    }

    fn read(&self) -> Result<std::sync::RwLockReadGuard<'_, StoreState>, String> {
        self.inner
            .read()
            .map_err(|_| "Workflow document store lock is poisoned".to_string())
    }

    fn write(&self) -> Result<std::sync::RwLockWriteGuard<'_, StoreState>, String> {
        self.inner
            .write()
            .map_err(|_| "Workflow document store lock is poisoned".to_string())
    }
}

fn check_revision(state: &StoreState, expected_revision: Option<u64>) -> Result<(), String> {
    if let Some(expected) = expected_revision {
        if expected != state.revision {
            return Err(format!(
                "Workflow revision conflict: expected {expected}, current {}",
                state.revision
            ));
        }
    }
    Ok(())
}

fn snapshot_from_state(state: &StoreState) -> Option<WorkflowDocumentSnapshotDto> {
    state.active.as_ref().map(|stored| WorkflowDocumentSnapshotDto {
        revision: state.revision,
        workflow: stored.workflow.to_dto(),
    })
}

fn command_result(
    state: &StoreState,
    mut changes: WorkflowCommandChanges,
) -> Result<WorkflowCommandResultDto, String> {
    let stored = state
        .active
        .as_ref()
        .ok_or_else(|| "No active workflow document is loaded".to_string())?;

    changes.changed_state_ids.sort();
    changes.changed_state_ids.dedup();
    changes.changed_transition_ids.sort();
    changes.changed_transition_ids.dedup();

    let mut changed_states = Vec::new();
    let mut removed_state_ids = Vec::new();
    for raw_id in &changes.changed_state_ids {
        let id = StateId::from(raw_id.as_str());
        if let Some(state) = stored.index.state(&stored.workflow, &id) {
            changed_states.push(state.to_dto());
        } else {
            removed_state_ids.push(raw_id.clone());
        }
    }

    let mut changed_transitions = Vec::new();
    let mut removed_transition_ids = Vec::new();
    for raw_id in &changes.changed_transition_ids {
        let id = TransitionId::from(raw_id.as_str());
        if let Some(transition) = stored.index.transition(&stored.workflow, &id) {
            changed_transitions.push(transition.to_dto());
        } else {
            removed_transition_ids.push(raw_id.clone());
        }
    }

    let data_model = changes.data_model_changed.then(|| {
        stored
            .workflow
            .data_model
            .iter()
            .map(|entry| entry.to_dto())
            .collect::<Vec<_>>()
    });
    let slot_declarations = changes.slot_declarations_changed.then(|| {
        stored
            .workflow
            .slot_declarations
            .iter()
            .map(|slot| slot.to_dto())
            .collect::<Vec<_>>()
    });

    let patch = WorkflowPatchDto {
        metadata: WorkflowMetadataPatchDto {
            name: stored.workflow.name.clone(),
            initial_state_id: stored
                .workflow
                .initial_state_id
                .as_ref()
                .map(|id| id.as_str().to_string()),
            initial_scxml_state_id: stored.workflow.initial_scxml_state_id.clone(),
        },
        states: changed_states,
        removed_state_ids,
        transitions: changed_transitions,
        removed_transition_ids,
        data_model,
        slot_declarations,
        parallel_lane_updates: changes.parallel_lane_updates,
    };

    Ok(WorkflowCommandResultDto {
        revision: state.revision,
        patch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::{
        ParallelLaneMoveContextDto, StateSlotsCommandDto, TargetedTransitionCommandDto,
        WrapEditorGroupDto,
    };
    use crate::core::editor_export::{
        build_workflow_from_editor,
        types::{
            EditorExportEdgeDto, EditorExportNodeDto, EditorExportRequestDto,
            EditorExportSlotDeclarationDto, EditorExportSlotDto,
        },
    };
    use crate::core::model::{
        AssignmentDto, DataModelEntry, EditorMetadataDto, EditorPositionDto, ParameterDto,
        SlotDeclaration, State, StateDto, StateId, StateKind, StateKindDto, Transition,
        TransitionId, TransitionSource,
    };

    fn sample_workflow() -> Workflow {
        Workflow {
            states: vec![
                State {
                    id: StateId::from("a"),
                    scxml_id: "A".into(),
                    label: "A".into(),
                    kind: StateKind::Skill,
                    parent_id: None,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("b"),
                    scxml_id: "B".into(),
                    label: "B".into(),
                    kind: StateKind::Skill,
                    parent_id: None,
                    ..sample_state_defaults()
                },
            ],
            ..Workflow::default()
        }
    }

    fn sample_state_defaults() -> State {
        State {
            id: StateId::default(),
            scxml_id: String::new(),
            label: String::new(),
            kind: StateKind::Skill,
            full_skill_name: None,
            source: None,
            parent_id: None,
            initial_child_id: None,
            initial_child_scxml_id: None,
            is_initial: false,
            is_final: false,
            events: vec![],
            input_slots: vec![],
            output_slots: vec![],
            parameters: vec![],
            on_entry: vec![],
            on_exit: vec![],
            editor: Default::default(),
        }
    }

    #[test]
    fn revisions_increase_and_conflicts_are_rejected() {
        let store = WorkflowDocumentStore::default();
        assert_eq!(store.replace(sample_workflow()).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::SetRootInitial {
                    state_id: Some("b".into()),
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);
        let snapshot = store.snapshot().unwrap().unwrap();
        assert_eq!(snapshot.workflow.initial_state_id.as_deref(), Some("b"));

        let error = store
            .apply(
                Some(1),
                WorkflowCommandDto::SetRootInitial {
                    state_id: Some("a".into()),
                },
            )
            .unwrap_err();
        assert!(error.contains("revision conflict"));
    }
    #[test]
    fn inserting_editor_states_builds_semantic_states_incrementally() {
        let store = WorkflowDocumentStore::default();
        assert_eq!(store.replace(Workflow::default()).unwrap(), 1);

        let parallel = EditorExportNodeDto {
            id: "parallel".into(),
            node_type: "parallel".into(),
            label: "parallel_1".into(),
            full_skill_name: "parallel_1".into(),
            is_initial: true,
            x: 100.0,
            y: 200.0,
            ..EditorExportNodeDto::default()
        };
        let lane_1 = EditorExportNodeDto {
            id: "lane-1".into(),
            node_type: "parallelLane".into(),
            parent_id: Some("parallel".into()),
            label: "Lane_1".into(),
            full_skill_name: "Lane_1".into(),
            ..EditorExportNodeDto::default()
        };
        let lane_2 = EditorExportNodeDto {
            id: "lane-2".into(),
            node_type: "parallelLane".into(),
            parent_id: Some("parallel".into()),
            label: "Lane_2".into(),
            full_skill_name: "Lane_2".into(),
            ..EditorExportNodeDto::default()
        };

        // Children deliberately precede their parent: the command must resolve
        // the insertion order itself instead of relying on React Flow ordering.
        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::InsertEditorStates {
                    nodes: vec![lane_1, lane_2, parallel],
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);

        let snapshot = store.snapshot().unwrap().unwrap();
        assert_eq!(snapshot.workflow.initial_state_id.as_deref(), Some("parallel"));
        assert_eq!(snapshot.workflow.states.len(), 3);
        for lane_id in ["lane-1", "lane-2"] {
            let lane = snapshot
                .workflow
                .states
                .iter()
                .find(|state| state.id == lane_id)
                .unwrap();
            assert_eq!(lane.parent_id.as_deref(), Some("parallel"));
        }

        let parallel = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "parallel")
            .unwrap();
        assert_eq!(parallel.editor.x, 100.0);
        assert_eq!(parallel.editor.y, 200.0);
    }

    #[test]
    fn replacing_targeted_transitions_preserves_targetless_behavior_exits() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.transitions = vec![
            Transition {
                id: TransitionId::from("old"),
                source_state_id: StateId::from("a"),
                target_state_id: Some(StateId::from("b")),
                target_scxml_id: "B".into(),
                logical_sources: vec![],
                event: "A.success".into(),
                condition: String::new(),
                assignments: vec![],
                sent_events: vec![],
                target_instance_id: None,
            },
            Transition {
                id: TransitionId::from("exit"),
                source_state_id: StateId::from("a"),
                target_state_id: None,
                target_scxml_id: String::new(),
                logical_sources: vec![],
                event: "Nop.fatal".into(),
                condition: String::new(),
                assignments: vec![],
                sent_events: vec!["behavior.success".into()],
                target_instance_id: None,
            },
        ];
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceTargetedTransitions {
                    source_state_id: "a".into(),
                    transitions: vec![TargetedTransitionCommandDto {
                        id: "new".into(),
                        target_state_id: "b".into(),
                        event: "A.error".into(),
                        source_handle: "error".into(),
                        condition: "@retry".into(),
                        assignments: vec![AssignmentDto {
                            location: "counter".into(),
                            expression: "1".into(),
                        }],
                        target_instance_id: Some("ref-1".into()),
                    }],
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);

        let snapshot = store.snapshot().unwrap().unwrap();
        assert_eq!(snapshot.workflow.transitions.len(), 2);
        assert!(snapshot
            .workflow
            .transitions
            .iter()
            .any(|transition| transition.id == "exit" && transition.target_state_id.is_none()));
        let replacement = snapshot
            .workflow
            .transitions
            .iter()
            .find(|transition| transition.id == "new")
            .unwrap();
        assert_eq!(replacement.event, "A.error");
        assert_eq!(replacement.target_state_id.as_deref(), Some("b"));
        assert_eq!(replacement.target_instance_id.as_deref(), Some("ref-1"));
        assert_eq!(replacement.logical_sources.len(), 1);
        assert_eq!(replacement.logical_sources[0].state_id, "a");
        assert_eq!(replacement.logical_sources[0].handle, "error");
    }


    #[test]
    fn replacing_nested_targeted_transitions_lets_rust_own_hoisting() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.states.push(State {
            id: StateId::from("compound"),
            scxml_id: "Group".into(),
            label: "Group".into(),
            kind: StateKind::Compound,
            initial_child_id: Some(StateId::from("a")),
            initial_child_scxml_id: Some("A".into()),
            ..sample_state_defaults()
        });
        workflow
            .states
            .iter_mut()
            .find(|state| state.id == StateId::from("a"))
            .unwrap()
            .parent_id = Some(StateId::from("compound"));
        assert_eq!(store.replace(workflow).unwrap(), 1);

        store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceTargetedTransitions {
                    source_state_id: "a".into(),
                    transitions: vec![TargetedTransitionCommandDto {
                        id: "nested".into(),
                        target_state_id: "b".into(),
                        event: "success".into(),
                        source_handle: "success".into(),
                        condition: String::new(),
                        assignments: vec![],
                        target_instance_id: None,
                    }],
                },
            )
            .unwrap();

        let snapshot = store.snapshot().unwrap().unwrap();
        let transition = snapshot
            .workflow
            .transitions
            .iter()
            .find(|transition| transition.id == "nested")
            .unwrap();
        assert_eq!(transition.source_state_id.as_str(), "compound");
        assert_eq!(transition.event, "A.success");
        assert_eq!(transition.logical_sources.len(), 1);
        assert_eq!(transition.logical_sources[0].state_id.as_str(), "a");
        assert_eq!(transition.logical_sources[0].handle, "success");
    }

    #[test]
    fn add_state_and_position_updates_are_incremental() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.states[0].kind = StateKind::Compound;
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::AddState {
                    state: StateDto {
                        id: "child".into(),
                        scxml_id: "state_1".into(),
                        label: "state_1".into(),
                        kind: StateKindDto::Compound,
                        full_skill_name: Some("state_1".into()),
                        source: None,
                        parent_id: Some("a".into()),
                        initial_child_id: None,
                        initial_child_scxml_id: None,
                        is_initial: true,
                        is_final: false,
                        events: vec![],
                        input_slots: vec![],
                        output_slots: vec![],
                        parameters: vec![],
                        on_entry: vec![],
                        on_exit: vec![],
                        editor: EditorMetadataDto {
                            x: 10.0,
                            y: 20.0,
                            positions: vec![EditorPositionDto {
                                x: 10.0,
                                y: 20.0,
                                instance_id: None,
                                clone_type: None,
                            }],
                            ..EditorMetadataDto::default()
                        },
                    },
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);

        let result = store
            .apply(
                Some(2),
                WorkflowCommandDto::UpdateStateEditorPosition {
                    state_id: "child".into(),
                    x: 42.0,
                    y: 84.0,
                },
            )
            .unwrap();
        assert_eq!(result.revision, 3);

        let snapshot = store.snapshot().unwrap().unwrap();
        let child = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "child")
            .unwrap();
        assert_eq!(child.parent_id.as_deref(), Some("a"));
        assert!(child.is_initial);
        assert_eq!(child.editor.x, 42.0);
        assert_eq!(child.editor.y, 84.0);
        assert_eq!(snapshot.workflow.states[0].initial_child_id.as_deref(), Some("child"));
    }

    #[test]
    fn removing_nested_state_removes_hoisted_container_transition() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.states[0].kind = StateKind::Compound;
        workflow.states.push(State {
            id: StateId::from("child"),
            scxml_id: "Talk".into(),
            label: "Talk".into(),
            kind: StateKind::Skill,
            parent_id: Some(StateId::from("a")),
            ..sample_state_defaults()
        });
        workflow.states[0].initial_child_id = Some(StateId::from("child"));
        workflow.states[0].initial_child_scxml_id = Some("Talk".into());
        workflow.transitions.push(Transition {
            id: TransitionId::from("hoisted"),
            source_state_id: StateId::from("a"),
            target_state_id: Some(StateId::from("b")),
            target_scxml_id: "B".into(),
            logical_sources: vec![TransitionSource {
                state_id: StateId::from("child"),
                handle: "success".into(),
            }],
            event: "Talk.success".into(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec![],
            target_instance_id: None,
        });
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::RemoveStates {
                    state_ids: vec!["child".into()],
                },
            )
            .unwrap();

        assert_eq!(result.patch.removed_state_ids, vec!["child"]);
        assert_eq!(result.patch.removed_transition_ids, vec!["hoisted"]);
        assert!(result
            .patch
            .states
            .iter()
            .any(|state| state.id == "a"));

        let snapshot = store.snapshot().unwrap().unwrap();
        assert!(snapshot.workflow.states.iter().all(|state| state.id != "child"));
        assert!(snapshot
            .workflow
            .transitions
            .iter()
            .all(|transition| transition.id != "hoisted"));
        let parent = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "a")
            .unwrap();
        assert!(parent.initial_child_id.is_none());
    }

    #[test]
    fn removing_one_of_multiple_logical_sources_keeps_shared_transition() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.states[0].kind = StateKind::Compound;
        workflow.states.extend([
            State {
                id: StateId::from("child-a"),
                scxml_id: "Talk".into(),
                label: "Talk A".into(),
                kind: StateKind::Skill,
                parent_id: Some(StateId::from("a")),
                ..sample_state_defaults()
            },
            State {
                id: StateId::from("child-b"),
                scxml_id: "Talk".into(),
                label: "Talk B".into(),
                kind: StateKind::Skill,
                parent_id: Some(StateId::from("a")),
                ..sample_state_defaults()
            },
        ]);
        workflow.transitions.push(Transition {
            id: TransitionId::from("shared"),
            source_state_id: StateId::from("a"),
            target_state_id: Some(StateId::from("b")),
            target_scxml_id: "B".into(),
            logical_sources: vec![
                TransitionSource {
                    state_id: StateId::from("child-a"),
                    handle: "success".into(),
                },
                TransitionSource {
                    state_id: StateId::from("child-b"),
                    handle: "success".into(),
                },
            ],
            event: "Talk.success".into(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec![],
            target_instance_id: None,
        });
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::RemoveStates {
                    state_ids: vec!["child-a".into()],
                },
            )
            .unwrap();
        let patched_transition = result
            .patch
            .transitions
            .iter()
            .find(|transition| transition.id == "shared")
            .expect("retained shared transition should be patched");
        assert_eq!(patched_transition.logical_sources.len(), 1);
        assert_eq!(patched_transition.logical_sources[0].state_id, "child-b");

        let snapshot = store.snapshot().unwrap().unwrap();
        let transition = snapshot
            .workflow
            .transitions
            .iter()
            .find(|transition| transition.id == "shared")
            .unwrap();
        assert_eq!(transition.logical_sources.len(), 1);
        assert_eq!(transition.logical_sources[0].state_id, "child-b");
    }

    #[test]
    fn renaming_nested_state_updates_hoisted_transition_event() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.states[0].kind = StateKind::Compound;
        workflow.states.push(State {
            id: StateId::from("child"),
            scxml_id: "Talk".into(),
            label: "Talk".into(),
            kind: StateKind::Skill,
            full_skill_name: Some("skills.Talk#Talk".into()),
            parent_id: Some(StateId::from("a")),
            ..sample_state_defaults()
        });
        workflow.transitions.push(Transition {
            id: TransitionId::from("hoisted"),
            source_state_id: StateId::from("a"),
            target_state_id: Some(StateId::from("b")),
            target_scxml_id: "B".into(),
            logical_sources: vec![TransitionSource {
                state_id: StateId::from("child"),
                handle: "success".into(),
            }],
            event: "Talk.success".into(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec![],
            target_instance_id: None,
        });
        assert_eq!(store.replace(workflow).unwrap(), 1);

        store
            .apply(
                Some(1),
                WorkflowCommandDto::RenameState {
                    state_id: "child".into(),
                    scxml_id: "Speak".into(),
                    label: None,
                    full_skill_name: Some("skills.Talk#Speak".into()),
                },
            )
            .unwrap();

        let snapshot = store.snapshot().unwrap().unwrap();
        let child = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "child")
            .unwrap();
        assert_eq!(child.scxml_id, "Speak");
        assert_eq!(child.full_skill_name.as_deref(), Some("skills.Talk#Speak"));
        assert_eq!(snapshot.workflow.transitions[0].event, "Speak.success");
    }

    #[test]
    fn parameter_and_slot_snapshots_update_without_replacing_workflow() {
        let store = WorkflowDocumentStore::default();
        assert_eq!(store.replace(sample_workflow()).unwrap(), 1);

        let parameter_result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceStateParameters {
                    state_id: "a".into(),
                    parameters: vec![ParameterDto {
                        key: "speed".into(),
                        expression: "2".into(),
                        ..ParameterDto::default()
                    }],
                },
            )
            .unwrap();
        assert_eq!(parameter_result.revision, 2);
        assert_eq!(parameter_result.patch.states.len(), 1);
        assert_eq!(parameter_result.patch.states[0].id, "a");
        assert_eq!(parameter_result.patch.states[0].parameters.len(), 1);
        assert!(parameter_result.patch.data_model.is_none());
        assert!(parameter_result.patch.slot_declarations.is_none());

        let slot_result = store
            .apply(
                Some(2),
                WorkflowCommandDto::ReplaceSlotsSnapshot {
                    states: vec![StateSlotsCommandDto {
                        state_id: "a".into(),
                        state_name: "A".into(),
                        input_slots: vec![EditorExportSlotDto {
                            key: "Model".into(),
                            type_name: "Object".into(),
                            path: "/model".into(),
                            ..EditorExportSlotDto::default()
                        }],
                        output_slots: vec![],
                    }],
                    extra_slot_declarations: vec![EditorExportSlotDeclarationDto {
                        key: "Manual".into(),
                        state: "A".into(),
                        xpath: "/manual".into(),
                        inherited: false,
                    }],
                },
            )
            .unwrap();
        assert_eq!(slot_result.revision, 3);
        assert_eq!(slot_result.patch.states.len(), 1);
        assert_eq!(slot_result.patch.states[0].id, "a");
        assert_eq!(
            slot_result
                .patch
                .slot_declarations
                .as_ref()
                .map(Vec::len),
            Some(2)
        );

        let snapshot = store.snapshot().unwrap().unwrap();
        let state = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "a")
            .unwrap();
        assert_eq!(state.parameters.len(), 1);
        assert_eq!(state.parameters[0].key, "speed");
        assert_eq!(state.input_slots.len(), 1);
        assert_eq!(state.input_slots[0].path, "/model");
        assert_eq!(snapshot.workflow.slot_declarations.len(), 2);
        assert!(snapshot
            .workflow
            .slot_declarations
            .iter()
            .any(|slot| slot.key == "Model" && slot.xpath == "/model"));
        assert!(snapshot
            .workflow
            .slot_declarations
            .iter()
            .any(|slot| slot.key == "Manual" && slot.xpath == "/manual"));
    }

    #[test]
    fn data_model_command_returns_concrete_patch_payload() {
        let store = WorkflowDocumentStore::default();
        assert_eq!(store.replace(sample_workflow()).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceDataModel {
                    entries: vec![crate::core::model::DataModelEntryDto {
                        id: "counter".into(),
                        type_name: Some("int".into()),
                        expression: "1".into(),
                    }],
                },
            )
            .unwrap();

        let data_model = result.patch.data_model.as_ref().unwrap();
        assert_eq!(data_model.len(), 1);
        assert_eq!(data_model[0].id, "counter");
        assert!(result.patch.metadata.initial_state_id.is_none());
    }

    #[test]
    fn replacing_editor_transitions_handles_nested_ownership_without_replacing_document_data() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = Workflow {
            states: vec![
                State {
                    id: StateId::from("container"),
                    scxml_id: "Container".into(),
                    label: "Container".into(),
                    kind: StateKind::Compound,
                    initial_child_id: Some(StateId::from("talk")),
                    initial_child_scxml_id: Some("Talk".into()),
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("talk"),
                    scxml_id: "Talk".into(),
                    label: "Talk".into(),
                    kind: StateKind::Skill,
                    parent_id: Some(StateId::from("container")),
                    parameters: vec![crate::core::model::Parameter {
                        key: "text".into(),
                        expression: "hello".into(),
                        ..crate::core::model::Parameter::default()
                    }],
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("outside"),
                    scxml_id: "Outside".into(),
                    label: "Outside".into(),
                    kind: StateKind::Skill,
                    ..sample_state_defaults()
                },
            ],
            data_model: vec![DataModelEntry {
                id: "counter".into(),
                type_name: None,
                expression: "1".into(),
            }],
            slot_declarations: vec![SlotDeclaration {
                key: "Manual".into(),
                state: "Talk".into(),
                xpath: "/manual".into(),
                inherited: false,
            }],
            ..Workflow::default()
        };
        workflow.transitions.push(Transition {
            id: TransitionId::from("old-edge"),
            source_state_id: StateId::from("container"),
            target_state_id: Some(StateId::from("outside")),
            target_scxml_id: "Outside".into(),
            logical_sources: vec![],
            event: "Talk.success".into(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec![],
            target_instance_id: None,
        });
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let node = |id: &str, node_type: &str, parent_id: Option<&str>, name: &str| {
            EditorExportNodeDto {
                id: id.into(),
                node_type: node_type.into(),
                parent_id: parent_id.map(str::to_string),
                label: name.into(),
                full_skill_name: name.into(),
                ..EditorExportNodeDto::default()
            }
        };
        let mut container = node("container", "compound", None, "Container");
        container.initial_child_id = Some("talk".into());
        let mut talk = node("talk", "custom", Some("container"), "Talk");
        talk.is_initial = true;
        let outside = node("outside", "custom", None, "Outside");

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceEditorTransitions {
                    nodes: vec![container, talk, outside],
                    edges: vec![EditorExportEdgeDto {
                        id: "edge-talk-out".into(),
                        source: "talk".into(),
                        target: "outside".into(),
                        source_handle: "error".into(),
                        editor_target_instance_id: "ref-1".into(),
                        ..EditorExportEdgeDto::default()
                    }],
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);

        let snapshot = store.snapshot().unwrap().unwrap();
        assert_eq!(snapshot.workflow.data_model.len(), 1);
        assert_eq!(snapshot.workflow.data_model[0].id, "counter");
        assert_eq!(snapshot.workflow.slot_declarations.len(), 1);
        assert_eq!(snapshot.workflow.slot_declarations[0].key, "Manual");

        let talk = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "talk")
            .unwrap();
        assert_eq!(talk.parameters.len(), 1);
        assert_eq!(talk.parameters[0].key, "text");

        assert_eq!(snapshot.workflow.transitions.len(), 1);
        let transition = &snapshot.workflow.transitions[0];
        assert_eq!(transition.id, "edge-talk-out");
        assert_eq!(transition.source_state_id, "container");
        assert_eq!(transition.logical_sources.len(), 1);
        assert_eq!(transition.logical_sources[0].state_id, "talk");
        assert_eq!(transition.logical_sources[0].handle, "error");
        assert_eq!(transition.event, "Talk.error");
        assert_eq!(transition.target_state_id.as_deref(), Some("outside"));

        let outside = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "outside")
            .unwrap();
        assert_eq!(outside.editor.edge_targets.len(), 1);
        assert_eq!(
            outside.editor.edge_targets[0].target_instance_id,
            "ref-1"
        );
        assert_eq!(outside.editor.edge_targets[0].event, "Talk.error");
    }

    #[test]
    fn replacing_editor_positions_updates_only_state_metadata() {
        let store = WorkflowDocumentStore::default();
        assert_eq!(store.replace(sample_workflow()).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceStateEditorPositions {
                    state_id: "a".into(),
                    positions: vec![
                        EditorPositionDto {
                            x: 10.0,
                            y: 20.0,
                            instance_id: Some("original".into()),
                            clone_type: None,
                        },
                        EditorPositionDto {
                            x: 110.0,
                            y: 220.0,
                            instance_id: Some("ref-1".into()),
                            clone_type: Some("skill".into()),
                        },
                    ],
                },
            )
            .unwrap();

        assert_eq!(result.revision, 2);

        let snapshot = store.snapshot().unwrap().unwrap();
        let state = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "a")
            .unwrap();
        assert_eq!(state.editor.x, 10.0);
        assert_eq!(state.editor.y, 20.0);
        assert_eq!(state.editor.positions.len(), 2);
        assert_eq!(
            state.editor.positions[1].instance_id.as_deref(),
            Some("ref-1")
        );
        assert_eq!(
            state.editor.positions[1].clone_type.as_deref(),
            Some("skill")
        );
        assert_eq!(snapshot.workflow.states.len(), 2);
    }

    #[test]
    fn moving_editor_state_reparents_and_normalizes_initial_scopes() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = Workflow {
            initial_state_id: Some(StateId::from("a")),
            initial_scxml_state_id: Some("A".into()),
            states: vec![
                State {
                    id: StateId::from("a"),
                    scxml_id: "A".into(),
                    label: "A".into(),
                    kind: StateKind::Skill,
                    is_initial: true,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("b"),
                    scxml_id: "B".into(),
                    label: "B".into(),
                    kind: StateKind::Skill,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("container"),
                    scxml_id: "Container".into(),
                    label: "Container".into(),
                    kind: StateKind::Compound,
                    initial_child_id: Some(StateId::from("inside")),
                    initial_child_scxml_id: Some("Inside".into()),
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("inside"),
                    scxml_id: "Inside".into(),
                    label: "Inside".into(),
                    kind: StateKind::Skill,
                    parent_id: Some(StateId::from("container")),
                    is_initial: true,
                    ..sample_state_defaults()
                },
            ],
            ..Workflow::default()
        };
        workflow.transitions.push(Transition {
            id: TransitionId::from("edge-a-b"),
            source_state_id: StateId::from("a"),
            target_state_id: Some(StateId::from("b")),
            target_scxml_id: "B".into(),
            logical_sources: vec![TransitionSource {
                state_id: StateId::from("a"),
                handle: "success".into(),
            }],
            event: "A.success".into(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec![],
            target_instance_id: None,
        });
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::MoveEditorState {
                    state_id: "a".into(),
                    parent_state_id: Some("container".into()),
                    source_lane: None,
                    target_lane: None,
                    x: 25.0,
                    y: 35.0,
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);

        let snapshot = store.snapshot().unwrap().unwrap();
        let moved = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "a")
            .unwrap();
        assert_eq!(moved.parent_id.as_deref(), Some("container"));
        assert!(!moved.is_initial);
        assert_eq!(moved.editor.x, 25.0);
        assert_eq!(moved.editor.y, 35.0);

        // A was the old root initial. Rust chooses the next remaining root
        // state, while preserving the target Compound's existing initial child.
        assert_eq!(snapshot.workflow.initial_state_id.as_deref(), Some("b"));
        let inside = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "inside")
            .unwrap();
        assert!(inside.is_initial);
        let container = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "container")
            .unwrap();
        assert_eq!(container.initial_child_id.as_deref(), Some("inside"));

        // A now exits its Compound, so the Compound owns the SCXML transition
        // while provenance continues to identify A.success as the logical exit.
        let transition = &snapshot.workflow.transitions[0];
        assert_eq!(transition.source_state_id, "container");
        assert_eq!(transition.event, "A.success");
        assert_eq!(transition.logical_sources[0].state_id, "a");
    }

    #[test]
    fn moving_editor_state_into_empty_compound_makes_it_initial() {
        let store = WorkflowDocumentStore::default();
        let workflow = Workflow {
            initial_state_id: Some(StateId::from("root")),
            initial_scxml_state_id: Some("Root".into()),
            states: vec![
                State {
                    id: StateId::from("root"),
                    scxml_id: "Root".into(),
                    label: "Root".into(),
                    kind: StateKind::Skill,
                    is_initial: true,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("moved"),
                    scxml_id: "Moved".into(),
                    label: "Moved".into(),
                    kind: StateKind::Skill,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("container"),
                    scxml_id: "Container".into(),
                    label: "Container".into(),
                    kind: StateKind::Compound,
                    ..sample_state_defaults()
                },
            ],
            ..Workflow::default()
        };
        assert_eq!(store.replace(workflow).unwrap(), 1);

        store
            .apply(
                Some(1),
                WorkflowCommandDto::MoveEditorState {
                    state_id: "moved".into(),
                    parent_state_id: Some("container".into()),
                    source_lane: None,
                    target_lane: None,
                    x: 10.0,
                    y: 20.0,
                },
            )
            .unwrap();

        let snapshot = store.snapshot().unwrap().unwrap();
        let moved = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "moved")
            .unwrap();
        let container = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "container")
            .unwrap();
        assert!(moved.is_initial);
        assert_eq!(container.initial_child_id.as_deref(), Some("moved"));
        assert_eq!(container.initial_child_scxml_id.as_deref(), Some("Moved"));
        assert_eq!(snapshot.workflow.initial_state_id.as_deref(), Some("root"));
    }


    #[test]
    fn wrapping_states_in_compound_is_owned_by_rust() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.initial_state_id = Some(StateId::from("a"));
        workflow.initial_scxml_state_id = Some("A".into());
        workflow.states[0].is_initial = true;
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::WrapEditorStates {
                    container: EditorExportNodeDto {
                        id: "compound".into(),
                        node_type: "compound".into(),
                        label: "compound_1".into(),
                        full_skill_name: "compound_1".into(),
                        x: 20.0,
                        y: 30.0,
                        ..EditorExportNodeDto::default()
                    },
                    groups: vec![WrapEditorGroupDto {
                        lane: None,
                        state_ids: vec!["a".into(), "b".into()],
                    }],
                },
            )
            .unwrap();

        assert_eq!(result.revision, 2);
        let snapshot = store.snapshot().unwrap().unwrap();
        assert_eq!(snapshot.workflow.initial_state_id.as_deref(), Some("compound"));
        let container = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "compound")
            .unwrap();
        assert_eq!(container.kind, StateKindDto::Compound);
        assert_eq!(container.initial_child_id.as_deref(), Some("a"));
        for child_id in ["a", "b"] {
            let child = snapshot
                .workflow
                .states
                .iter()
                .find(|state| state.id == child_id)
                .unwrap();
            assert_eq!(child.parent_id.as_deref(), Some("compound"));
        }
    }

    #[test]
    fn reconciling_parallel_lane_creates_backend_owned_wrapper() {
        let store = WorkflowDocumentStore::default();
        let workflow = Workflow {
            states: vec![
                State {
                    id: StateId::from("parallel"),
                    scxml_id: "Parallel".into(),
                    label: "Parallel".into(),
                    kind: StateKind::Parallel,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("a"),
                    scxml_id: "A".into(),
                    label: "A".into(),
                    kind: StateKind::Skill,
                    parent_id: Some(StateId::from("parallel")),
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("b"),
                    scxml_id: "B".into(),
                    label: "B".into(),
                    kind: StateKind::Skill,
                    parent_id: Some(StateId::from("parallel")),
                    ..sample_state_defaults()
                },
            ],
            ..Workflow::default()
        };
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let lane = EditorExportNodeDto {
            id: "lane".into(),
            node_type: "parallelLane".into(),
            parent_id: Some("parallel".into()),
            label: "Lane".into(),
            full_skill_name: "Lane".into(),
            ..EditorExportNodeDto::default()
        };


        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReconcileParallelLane {
                    context: ParallelLaneMoveContextDto {
                        lane,
                        wrapper: None,
                        member_state_ids: vec!["a".into(), "b".into()],
                    },
                },
            )
            .unwrap();

        let lane_patch = &result.patch.parallel_lane_updates[0];
        assert_eq!(lane_patch.wrapper_state_id.as_deref(), Some("auto-lane-lane"));
        assert_eq!(lane_patch.wrapper_initial_child_id.as_deref(), Some("a"));
        let snapshot = store.snapshot().unwrap().unwrap();
        let wrapper = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "auto-lane-lane")
            .unwrap();
        assert_eq!(wrapper.kind, StateKindDto::Compound);
        assert_eq!(wrapper.parent_id.as_deref(), Some("lane"));
        for child_id in ["a", "b"] {
            let child = snapshot
                .workflow
                .states
                .iter()
                .find(|state| state.id == child_id)
                .unwrap();
            assert_eq!(child.parent_id.as_deref(), Some("auto-lane-lane"));
        }
    }

    #[test]
    fn moving_state_into_atomic_parallel_lane_creates_and_retains_wrapper_in_rust() {
        let store = WorkflowDocumentStore::default();
        let workflow = Workflow {
            states: vec![
                State {
                    id: StateId::from("parallel"),
                    scxml_id: "Parallel".into(),
                    label: "Parallel".into(),
                    kind: StateKind::Parallel,
                    ..sample_state_defaults()
                },
                // Atomic editor lane "A" is flattened semantically: only its
                // same-named child exists below the Parallel.
                State {
                    id: StateId::from("a"),
                    scxml_id: "A".into(),
                    label: "A".into(),
                    kind: StateKind::Skill,
                    parent_id: Some(StateId::from("parallel")),
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("b"),
                    scxml_id: "B".into(),
                    label: "B".into(),
                    kind: StateKind::Skill,
                    ..sample_state_defaults()
                },
            ],
            ..Workflow::default()
        };
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let lane_node = EditorExportNodeDto {
            id: "lane-a".into(),
            node_type: "parallelLane".into(),
            parent_id: Some("parallel".into()),
            label: "A".into(),
            full_skill_name: "A".into(),
            ..EditorExportNodeDto::default()
        };

        let promoted = store
            .apply(
                Some(1),
                WorkflowCommandDto::MoveEditorState {
                    state_id: "b".into(),
                    parent_state_id: Some("lane-a".into()),
                    source_lane: None,
                    target_lane: Some(ParallelLaneMoveContextDto {
                        lane: lane_node.clone(),
                        wrapper: None,
                        member_state_ids: vec!["a".into(), "b".into()],
                    }),
                    x: 80.0,
                    y: 20.0,
                },
            )
            .unwrap();
        assert_eq!(promoted.revision, 2);
        assert_eq!(promoted.patch.parallel_lane_updates.len(), 1);
        let lane_patch = &promoted.patch.parallel_lane_updates[0];
        let wrapper_id = lane_patch
            .wrapper_state_id
            .clone()
            .expect("Rust should create a wrapper for a multi-state lane");
        assert_eq!(lane_patch.initial_child_id.as_deref(), Some(wrapper_id.as_str()));
        assert_eq!(lane_patch.wrapper_initial_child_id.as_deref(), Some("a"));

        let snapshot = store.snapshot().unwrap().unwrap();
        let lane = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "lane-a")
            .expect("lane should be promoted into the semantic model");
        assert_eq!(lane.kind, StateKindDto::ParallelLane);
        assert_eq!(lane.parent_id.as_deref(), Some("parallel"));
        assert_eq!(lane.initial_child_id.as_deref(), Some(wrapper_id.as_str()));
        for child_id in ["a", "b"] {
            let child = snapshot
                .workflow
                .states
                .iter()
                .find(|state| state.id == child_id)
                .unwrap();
            assert_eq!(child.parent_id.as_deref(), Some(wrapper_id.as_str()));
        }

        let wrapper_node = EditorExportNodeDto {
            id: wrapper_id.clone(),
            node_type: "compound".into(),
            parent_id: Some("lane-a".into()),
            label: lane_patch.wrapper_label.clone().unwrap_or_else(|| "lane_1".into()),
            full_skill_name: lane_patch.wrapper_label.clone().unwrap_or_else(|| "lane_1".into()),
            initial_child_id: Some("a".into()),
            ..EditorExportNodeDto::default()
        };

        let demoted = store
            .apply(
                Some(2),
                WorkflowCommandDto::MoveEditorState {
                    state_id: "b".into(),
                    parent_state_id: None,
                    source_lane: Some(ParallelLaneMoveContextDto {
                        lane: lane_node,
                        wrapper: Some(wrapper_node),
                        member_state_ids: vec!["a".into()],
                    }),
                    target_lane: None,
                    x: 300.0,
                    y: 120.0,
                },
            )
            .unwrap();
        assert_eq!(demoted.revision, 3);
        assert_eq!(demoted.patch.parallel_lane_updates.len(), 1);

        let snapshot = store.snapshot().unwrap().unwrap();
        let retained_lane = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "lane-a")
            .expect("existing wrapped lanes remain stable when they shrink");
        assert_eq!(retained_lane.initial_child_id.as_deref(), Some(wrapper_id.as_str()));
        let a = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "a")
            .unwrap();
        assert_eq!(a.parent_id.as_deref(), Some(wrapper_id.as_str()));
        let b = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "b")
            .unwrap();
        assert_eq!(b.parent_id, None);
    }

    #[test]
    fn moving_state_into_auto_parallel_lane_compound_stays_incremental() {
        let store = WorkflowDocumentStore::default();
        let workflow = Workflow {
            states: vec![
                State {
                    id: StateId::from("parallel"),
                    scxml_id: "Parallel".into(),
                    label: "Parallel".into(),
                    kind: StateKind::Parallel,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("lane"),
                    scxml_id: "Lane".into(),
                    label: "Lane".into(),
                    kind: StateKind::ParallelLane,
                    parent_id: Some(StateId::from("parallel")),
                    initial_child_id: Some(StateId::from("wrapper")),
                    initial_child_scxml_id: Some("lane_1".into()),
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("wrapper"),
                    scxml_id: "lane_1".into(),
                    label: "lane_1".into(),
                    kind: StateKind::Compound,
                    parent_id: Some(StateId::from("lane")),
                    initial_child_id: Some(StateId::from("a")),
                    initial_child_scxml_id: Some("A".into()),
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("a"),
                    scxml_id: "A".into(),
                    label: "A".into(),
                    kind: StateKind::Skill,
                    parent_id: Some(StateId::from("wrapper")),
                    is_initial: true,
                    ..sample_state_defaults()
                },
                State {
                    id: StateId::from("b"),
                    scxml_id: "B".into(),
                    label: "B".into(),
                    kind: StateKind::Skill,
                    ..sample_state_defaults()
                },
            ],
            ..Workflow::default()
        };
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let lane_node = EditorExportNodeDto {
            id: "lane".into(),
            node_type: "parallelLane".into(),
            parent_id: Some("parallel".into()),
            label: "Lane".into(),
            full_skill_name: "Lane".into(),
            ..EditorExportNodeDto::default()
        };
        let wrapper_node = EditorExportNodeDto {
            id: "wrapper".into(),
            node_type: "compound".into(),
            parent_id: Some("lane".into()),
            label: "lane_1".into(),
            full_skill_name: "lane_1".into(),
            initial_child_id: Some("a".into()),
            ..EditorExportNodeDto::default()
        };

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::MoveEditorState {
                    state_id: "b".into(),
                    parent_state_id: Some("wrapper".into()),
                    source_lane: None,
                    target_lane: Some(ParallelLaneMoveContextDto {
                        lane: lane_node,
                        wrapper: Some(wrapper_node),
                        member_state_ids: vec!["a".into(), "b".into()],
                    }),
                    x: 120.0,
                    y: 20.0,
                },
            )
            .unwrap();

        assert_eq!(result.revision, 2);
        assert_eq!(result.patch.parallel_lane_updates.len(), 1);
        assert_eq!(
            result.patch.parallel_lane_updates[0].initial_child_id.as_deref(),
            Some("wrapper")
        );

        let snapshot = store.snapshot().unwrap().unwrap();
        let b = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "b")
            .unwrap();
        assert_eq!(b.parent_id.as_deref(), Some("wrapper"));
        let wrapper = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "wrapper")
            .unwrap();
        assert_eq!(wrapper.initial_child_id.as_deref(), Some("a"));
        let lane = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "lane")
            .unwrap();
        assert_eq!(lane.initial_child_id.as_deref(), Some("wrapper"));
    }


}
