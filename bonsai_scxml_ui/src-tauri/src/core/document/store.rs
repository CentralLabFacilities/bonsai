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
        stored.index = WorkflowIndex::new(&stored.workflow);
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
    let stored = state
        .active
        .as_ref()
        .ok_or_else(|| "No active workflow document is loaded".to_string())?;
    Ok(WorkflowCommandResultDto {
        revision: state.revision,
        workflow: stored.workflow.to_dto(),
        changed_state_ids: changes.changed_state_ids,
        changed_transition_ids: changes.changed_transition_ids,
        data_model_changed: changes.data_model_changed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::{State, StateId, StateKind};

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
        assert_eq!(result.workflow.initial_state_id.as_deref(), Some("b"));

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
}
