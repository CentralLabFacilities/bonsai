use std::collections::HashMap;

use super::{State, StateId, Transition, TransitionId, Workflow};

/// Reusable semantic indexes for graph-heavy Rust operations.
///
/// The index deliberately stores ids rather than references so it can later be
/// cached next to a mutable Rust-owned workflow document without lifetime
/// coupling.
#[derive(Debug, Clone, Default)]
pub(crate) struct WorkflowIndex {
    state_position_by_id: HashMap<StateId, usize>,
    transition_position_by_id: HashMap<TransitionId, usize>,
    states_by_scxml_id: HashMap<String, Vec<StateId>>,
    children_by_parent: HashMap<Option<StateId>, Vec<StateId>>,
    outgoing_by_state: HashMap<StateId, Vec<TransitionId>>,
    incoming_by_state: HashMap<StateId, Vec<TransitionId>>,
}

impl WorkflowIndex {
    pub(crate) fn new(workflow: &Workflow) -> Self {
        let mut index = Self::default();

        for (position, state) in workflow.states.iter().enumerate() {
            index
                .state_position_by_id
                .insert(state.id.clone(), position);
            index
                .states_by_scxml_id
                .entry(state.scxml_id.clone())
                .or_default()
                .push(state.id.clone());
            index
                .children_by_parent
                .entry(state.parent_id.clone())
                .or_default()
                .push(state.id.clone());
        }

        for (position, transition) in workflow.transitions.iter().enumerate() {
            index
                .transition_position_by_id
                .insert(transition.id.clone(), position);
            index
                .outgoing_by_state
                .entry(transition.source_state_id.clone())
                .or_default()
                .push(transition.id.clone());
            if let Some(target) = transition.target_state_id.as_ref() {
                index
                    .incoming_by_state
                    .entry(target.clone())
                    .or_default()
                    .push(transition.id.clone());
            }
        }

        index
    }

    pub(crate) fn state_position(&self, id: &StateId) -> Option<usize> {
        self.state_position_by_id.get(id).copied()
    }

    pub(crate) fn transition_position(&self, id: &TransitionId) -> Option<usize> {
        self.transition_position_by_id.get(id).copied()
    }

    pub(crate) fn state<'a>(&self, workflow: &'a Workflow, id: &StateId) -> Option<&'a State> {
        self.state_position(id)
            .and_then(|position| workflow.states.get(position))
    }

    pub(crate) fn transition<'a>(
        &self,
        workflow: &'a Workflow,
        id: &TransitionId,
    ) -> Option<&'a Transition> {
        self.transition_position(id)
            .and_then(|position| workflow.transitions.get(position))
    }

    pub(crate) fn states_for_scxml_id(&self, scxml_id: &str) -> &[StateId] {
        self.states_by_scxml_id
            .get(scxml_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(crate) fn children_of(&self, parent_id: Option<&StateId>) -> &[StateId] {
        self.children_by_parent
            .get(&parent_id.cloned())
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(crate) fn outgoing_from(&self, state_id: &StateId) -> &[TransitionId] {
        self.outgoing_by_state
            .get(state_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(crate) fn incoming_to(&self, state_id: &StateId) -> &[TransitionId] {
        self.incoming_by_state
            .get(state_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(crate) fn parent_of<'a>(
        &self,
        workflow: &'a Workflow,
        state_id: &StateId,
    ) -> Option<&'a StateId> {
        self.state(workflow, state_id)?.parent_id.as_ref()
    }

    pub(crate) fn is_ancestor_of(
        &self,
        workflow: &Workflow,
        ancestor_id: &StateId,
        state_id: &StateId,
    ) -> bool {
        let mut current = self.parent_of(workflow, state_id);
        let mut visited = std::collections::HashSet::new();

        while let Some(parent_id) = current {
            if parent_id == ancestor_id {
                return true;
            }
            if !visited.insert(parent_id.clone()) {
                return false;
            }
            current = self.parent_of(workflow, parent_id);
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::{StateKind, Workflow};

    #[test]
    fn indexes_parent_scxml_and_transition_relationships() {
        let root = State {
            id: StateId::from("root"),
            scxml_id: "Root".into(),
            label: String::new(),
            kind: StateKind::Compound,
            full_skill_name: None,
            source: None,
            parent_id: None,
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
            editor: Default::default(),
        };
        let mut child = root.clone();
        child.id = StateId::from("child");
        child.scxml_id = "Child".into();
        child.kind = StateKind::Skill;
        child.parent_id = Some(StateId::from("root"));
        child.is_initial = false;

        let transition = Transition {
            id: TransitionId::from("t1"),
            source_state_id: StateId::from("child"),
            target_state_id: Some(StateId::from("root")),
            target_scxml_id: "Root".into(),
            logical_sources: vec![],
            event: "Child.success".into(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec![],
            target_instance_id: None,
        };

        let workflow = Workflow {
            states: vec![root, child],
            transitions: vec![transition],
            ..Workflow::default()
        };
        let index = WorkflowIndex::new(&workflow);

        assert_eq!(index.states_for_scxml_id("Child"), &[StateId::from("child")]);
        assert_eq!(index.children_of(Some(&StateId::from("root"))), &[StateId::from("child")]);
        assert_eq!(index.outgoing_from(&StateId::from("child")), &[TransitionId::from("t1")]);
        assert_eq!(index.incoming_to(&StateId::from("root")), &[TransitionId::from("t1")]);
        assert_eq!(
            index.state(&workflow, &StateId::from("child")).map(|state| state.scxml_id.as_str()),
            Some("Child")
        );
        assert_eq!(
            index.parent_of(&workflow, &StateId::from("child")),
            Some(&StateId::from("root"))
        );
        assert!(index.is_ancestor_of(
            &workflow,
            &StateId::from("root"),
            &StateId::from("child")
        ));
        assert!(!index.is_ancestor_of(
            &workflow,
            &StateId::from("child"),
            &StateId::from("root")
        ));
    }
}
