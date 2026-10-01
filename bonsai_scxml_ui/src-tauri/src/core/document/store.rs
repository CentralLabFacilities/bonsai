use std::sync::RwLock;

use crate::core::model::{Workflow, WorkflowIndex};

use super::commands::{apply_command, WorkflowCommandChanges};
use super::types::{WorkflowCommandDto, WorkflowCommandResultDto, WorkflowDocumentSnapshotDto};

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
    changes: WorkflowCommandChanges,
) -> Result<WorkflowCommandResultDto, String> {
    if state.active.is_none() {
        return Err("No active workflow document is loaded".to_string());
    }

    Ok(WorkflowCommandResultDto {
        revision: state.revision,
        changed_state_ids: changes.changed_state_ids,
        changed_transition_ids: changes.changed_transition_ids,
        data_model_changed: changes.data_model_changed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::{StateSlotsCommandDto, TargetedTransitionCommandDto};
    use crate::core::editor_export::types::{
        EditorExportEdgeDto, EditorExportNodeDto, EditorExportSlotDeclarationDto,
        EditorExportSlotDto,
    };
    use crate::core::model::{
        AssignmentDto, DataModelEntry, EditorMetadataDto, EditorPositionDto, ParameterDto,
        SlotDeclaration, State, StateDto, StateId, StateKind, StateKindDto, Transition,
        TransitionId,
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
    fn replacing_targeted_transitions_preserves_targetless_behavior_exits() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.transitions = vec![
            Transition {
                id: TransitionId::from("old"),
                source_state_id: StateId::from("a"),
                target_state_id: Some(StateId::from("b")),
                target_scxml_id: "B".into(),
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
                WorkflowCommandDto::RemoveStates {
                    state_ids: vec!["child".into()],
                },
            )
            .unwrap();

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
        assert_eq!(parameter_result.changed_state_ids, vec!["a"]);

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
    fn replacing_editor_structure_rebuilds_container_semantics_and_preserves_globals() {
        let store = WorkflowDocumentStore::default();
        let mut workflow = sample_workflow();
        workflow.data_model = vec![DataModelEntry {
            id: "counter".into(),
            type_name: None,
            expression: "1".into(),
        }];
        workflow.slot_declarations = vec![SlotDeclaration {
            key: "Manual".into(),
            state: "A".into(),
            xpath: "/manual".into(),
            inherited: false,
        }];
        assert_eq!(store.replace(workflow).unwrap(), 1);

        let node = |id: &str, node_type: &str, parent_id: Option<&str>| {
            EditorExportNodeDto {
                id: id.into(),
                node_type: node_type.into(),
                parent_id: parent_id.map(str::to_string),
                label: id.into(),
                full_skill_name: id.into(),
                ..EditorExportNodeDto::default()
            }
        };
        let mut compound = node("container", "compound", None);
        compound.is_initial = true;
        compound.initial_child_id = Some("a".into());
        let mut child = node("a", "custom", Some("container"));
        child.label = "A".into();
        child.full_skill_name = "A".into();
        child.is_initial = true;
        let mut outside = node("b", "custom", None);
        outside.label = "B".into();
        outside.full_skill_name = "B".into();

        let result = store
            .apply(
                Some(1),
                WorkflowCommandDto::ReplaceEditorStructure {
                    nodes: vec![compound, child, outside],
                    edges: vec![EditorExportEdgeDto {
                        id: "edge-a-b".into(),
                        source: "a".into(),
                        target: "b".into(),
                        source_handle: "success".into(),
                        ..EditorExportEdgeDto::default()
                    }],
                },
            )
            .unwrap();
        assert_eq!(result.revision, 2);

        let snapshot = store.snapshot().unwrap().unwrap();
        let child = snapshot
            .workflow
            .states
            .iter()
            .find(|state| state.id == "a")
            .unwrap();
        assert_eq!(child.parent_id.as_deref(), Some("container"));

        let transition = snapshot
            .workflow
            .transitions
            .iter()
            .find(|transition| transition.id == "edge-a-b")
            .unwrap();
        assert_eq!(transition.source_state_id, "container");
        assert_eq!(transition.event, "A.success");
        assert_eq!(transition.target_state_id.as_deref(), Some("b"));

        assert_eq!(snapshot.workflow.data_model.len(), 1);
        assert_eq!(snapshot.workflow.data_model[0].id, "counter");
        assert_eq!(snapshot.workflow.slot_declarations.len(), 1);
        assert_eq!(snapshot.workflow.slot_declarations[0].key, "Manual");
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
        assert_eq!(result.changed_state_ids, vec!["a"]);

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

}
