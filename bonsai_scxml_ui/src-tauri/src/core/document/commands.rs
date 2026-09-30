use std::collections::HashSet;

use crate::core::model::{
    Assignment, DataModelEntry, StateId, Transition, TransitionId, Workflow, WorkflowIndex,
};

use super::types::{TargetedTransitionCommandDto, WorkflowCommandDto};

#[derive(Debug, Clone, Default)]
pub(crate) struct WorkflowCommandChanges {
    pub changed_state_ids: Vec<String>,
    pub changed_transition_ids: Vec<String>,
    pub data_model_changed: bool,
    pub index_changed: bool,
}

pub(crate) fn apply_command(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    command: WorkflowCommandDto,
) -> Result<WorkflowCommandChanges, String> {
    match command {
        WorkflowCommandDto::SetRootInitial { state_id } => {
            set_root_initial(workflow, index, state_id)
        }
        WorkflowCommandDto::SetStateInitialChild {
            parent_state_id,
            state_id,
        } => set_state_initial_child(workflow, index, parent_state_id, state_id),
        WorkflowCommandDto::RenameState {
            state_id,
            scxml_id,
            label,
        } => rename_state(workflow, index, state_id, scxml_id, label),
        WorkflowCommandDto::SetStateLabel { state_id, label } => {
            set_state_label(workflow, index, state_id, label)
        }
        WorkflowCommandDto::SetStateSource { state_id, source } => {
            set_state_source(workflow, index, state_id, source)
        }
        WorkflowCommandDto::ReplaceDataModel { entries } => {
            workflow.data_model = entries.into_iter().map(DataModelEntry::from_dto).collect();
            Ok(WorkflowCommandChanges {
                data_model_changed: true,
                ..WorkflowCommandChanges::default()
            })
        }
        WorkflowCommandDto::UpdateTransitionEvent {
            transition_id,
            event,
        } => update_transition_event(workflow, index, transition_id, event),
        WorkflowCommandDto::UpdateTransitionTarget {
            transition_id,
            target_state_id,
            target_instance_id,
        } => update_transition_target(
            workflow,
            index,
            transition_id,
            target_state_id,
            target_instance_id,
        ),
        WorkflowCommandDto::ReplaceTargetedTransitions {
            source_state_id,
            transitions,
        } => replace_targeted_transitions(
            workflow,
            index,
            source_state_id,
            transitions,
        ),
    }
}

fn set_root_initial(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: Option<String>,
) -> Result<WorkflowCommandChanges, String> {
    let selected_id = state_id.map(StateId::from);
    let selected_scxml_id = if let Some(id) = selected_id.as_ref() {
        let state = index
            .state(workflow, id)
            .ok_or_else(|| format!("Unknown root initial state '{id}'"))?;
        if state.parent_id.is_some() {
            return Err(format!(
                "State '{}' is not a root state and cannot be the workflow initial state",
                state.scxml_id
            ));
        }
        Some(state.scxml_id.clone())
    } else {
        None
    };

    workflow.initial_state_id = selected_id.clone();
    workflow.initial_scxml_state_id = selected_scxml_id;

    let mut changed = Vec::new();
    for state in workflow.states.iter_mut().filter(|state| state.parent_id.is_none()) {
        let should_be_initial = selected_id.as_ref() == Some(&state.id);
        if state.is_initial != should_be_initial {
            state.is_initial = should_be_initial;
            changed.push(state.id.as_str().to_string());
        }
    }

    Ok(WorkflowCommandChanges {
        changed_state_ids: changed,
        ..WorkflowCommandChanges::default()
    })
}

fn set_state_initial_child(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    parent_state_id: String,
    state_id: Option<String>,
) -> Result<WorkflowCommandChanges, String> {
    let parent_id = StateId::from(parent_state_id);
    let parent_position = index
        .state_position(&parent_id)
        .ok_or_else(|| format!("Unknown parent state '{parent_id}'"))?;
    let selected_id = state_id.map(StateId::from);

    let selected_scxml_id = if let Some(id) = selected_id.as_ref() {
        let state = index
            .state(workflow, id)
            .ok_or_else(|| format!("Unknown initial child state '{id}'"))?;
        if state.parent_id.as_ref() != Some(&parent_id) {
            return Err(format!(
                "State '{}' is not a direct child of '{}'",
                state.scxml_id,
                workflow.states[parent_position].scxml_id
            ));
        }
        Some(state.scxml_id.clone())
    } else {
        None
    };

    workflow.states[parent_position].initial_child_id = selected_id.clone();
    workflow.states[parent_position].initial_child_scxml_id = selected_scxml_id;

    let mut changed = vec![parent_id.as_str().to_string()];
    for state in workflow
        .states
        .iter_mut()
        .filter(|state| state.parent_id.as_ref() == Some(&parent_id))
    {
        let should_be_initial = selected_id.as_ref() == Some(&state.id);
        if state.is_initial != should_be_initial {
            state.is_initial = should_be_initial;
            changed.push(state.id.as_str().to_string());
        }
    }

    changed.sort();
    changed.dedup();
    Ok(WorkflowCommandChanges {
        changed_state_ids: changed,
        ..WorkflowCommandChanges::default()
    })
}

fn rename_state(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    scxml_id: String,
    label: Option<String>,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    let normalized_scxml_id = scxml_id.trim();
    if normalized_scxml_id.is_empty() {
        return Err("SCXML state id must not be empty".to_string());
    }

    workflow.states[position].scxml_id = normalized_scxml_id.to_string();
    if let Some(label) = label {
        workflow.states[position].label = label;
    }

    if workflow.initial_state_id.as_ref() == Some(&id) {
        workflow.initial_scxml_state_id = Some(normalized_scxml_id.to_string());
    }

    for parent in workflow.states.iter_mut() {
        if parent.initial_child_id.as_ref() == Some(&id) {
            parent.initial_child_scxml_id = Some(normalized_scxml_id.to_string());
        }
    }

    let mut changed_transitions = Vec::new();
    for transition in workflow.transitions.iter_mut() {
        if transition.target_state_id.as_ref() == Some(&id) {
            transition.target_scxml_id = normalized_scxml_id.to_string();
            changed_transitions.push(transition.id.as_str().to_string());
        }
    }

    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        changed_transition_ids: changed_transitions,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

fn set_state_label(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    label: String,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    workflow.states[position].label = label;
    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        ..WorkflowCommandChanges::default()
    })
}

fn set_state_source(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    source: Option<String>,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    workflow.states[position].source = source;
    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        ..WorkflowCommandChanges::default()
    })
}

fn update_transition_event(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    transition_id: String,
    event: String,
) -> Result<WorkflowCommandChanges, String> {
    let id = TransitionId::from(transition_id);
    let position = index
        .transition_position(&id)
        .ok_or_else(|| format!("Unknown transition '{id}'"))?;
    workflow.transitions[position].event = event;
    Ok(WorkflowCommandChanges {
        changed_transition_ids: vec![id.as_str().to_string()],
        ..WorkflowCommandChanges::default()
    })
}

fn update_transition_target(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    transition_id: String,
    target_state_id: Option<String>,
    target_instance_id: Option<String>,
) -> Result<WorkflowCommandChanges, String> {
    let transition_id = TransitionId::from(transition_id);
    let position = index
        .transition_position(&transition_id)
        .ok_or_else(|| format!("Unknown transition '{transition_id}'"))?;

    let target_id = target_state_id.map(StateId::from);
    let target_scxml_id = if let Some(id) = target_id.as_ref() {
        index
            .state(workflow, id)
            .ok_or_else(|| format!("Unknown transition target state '{id}'"))?
            .scxml_id
            .clone()
    } else {
        String::new()
    };

    let transition = &mut workflow.transitions[position];
    transition.target_state_id = target_id;
    transition.target_scxml_id = target_scxml_id;
    transition.target_instance_id = target_instance_id;

    Ok(WorkflowCommandChanges {
        changed_transition_ids: vec![transition_id.as_str().to_string()],
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}
fn replace_targeted_transitions(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    source_state_id: String,
    transitions: Vec<TargetedTransitionCommandDto>,
) -> Result<WorkflowCommandChanges, String> {
    let source_id = StateId::from(source_state_id);
    index
        .state(workflow, &source_id)
        .ok_or_else(|| format!("Unknown transition source state '{source_id}'"))?;

    let preserved_ids = workflow
        .transitions
        .iter()
        .filter(|transition| {
            transition.source_state_id != source_id || transition.target_state_id.is_none()
        })
        .map(|transition| transition.id.clone())
        .collect::<HashSet<_>>();

    let mut seen_ids = HashSet::new();
    let mut replacements = Vec::with_capacity(transitions.len());
    for transition in transitions {
        let transition_id = TransitionId::from(transition.id.trim());
        if transition_id.as_str().is_empty() {
            return Err("Transition id must not be empty".to_string());
        }
        if !seen_ids.insert(transition_id.clone()) {
            return Err(format!("Duplicate replacement transition id '{transition_id}'"));
        }
        if preserved_ids.contains(&transition_id) {
            return Err(format!(
                "Transition id '{transition_id}' is already used by another semantic transition"
            ));
        }

        let target_id = StateId::from(transition.target_state_id);
        let target = index
            .state(workflow, &target_id)
            .ok_or_else(|| format!("Unknown transition target state '{target_id}'"))?;

        replacements.push(Transition {
            id: transition_id,
            source_state_id: source_id.clone(),
            target_state_id: Some(target_id),
            target_scxml_id: target.scxml_id.clone(),
            event: transition.event.trim().to_string(),
            condition: transition.condition,
            assignments: transition
                .assignments
                .into_iter()
                .map(|assignment| Assignment {
                    location: assignment.location,
                    expression: assignment.expression,
                })
                .collect(),
            sent_events: Vec::new(),
            target_instance_id: transition.target_instance_id,
        });
    }

    let old_targeted_ids = workflow
        .transitions
        .iter()
        .filter(|transition| {
            transition.source_state_id == source_id && transition.target_state_id.is_some()
        })
        .map(|transition| transition.id.as_str().to_string())
        .collect::<Vec<_>>();

    let insertion_index = workflow
        .transitions
        .iter()
        .position(|transition| {
            transition.source_state_id == source_id && transition.target_state_id.is_some()
        })
        .unwrap_or(workflow.transitions.len());

    let mut next = Vec::with_capacity(
        workflow.transitions.len() - old_targeted_ids.len() + replacements.len(),
    );
    let mut inserted = false;
    let mut replacement_iter = Some(replacements);

    for (position, existing) in workflow.transitions.drain(..).enumerate() {
        if !inserted && position == insertion_index {
            next.extend(replacement_iter.take().unwrap_or_default());
            inserted = true;
        }

        if existing.source_state_id == source_id && existing.target_state_id.is_some() {
            continue;
        }
        next.push(existing);
    }

    if !inserted {
        next.extend(replacement_iter.take().unwrap_or_default());
    }
    workflow.transitions = next;

    let mut changed_transition_ids = old_targeted_ids;
    changed_transition_ids.extend(
        workflow
            .transitions
            .iter()
            .filter(|transition| {
                transition.source_state_id == source_id && transition.target_state_id.is_some()
            })
            .map(|transition| transition.id.as_str().to_string()),
    );
    changed_transition_ids.sort();
    changed_transition_ids.dedup();

    Ok(WorkflowCommandChanges {
        changed_transition_ids,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

