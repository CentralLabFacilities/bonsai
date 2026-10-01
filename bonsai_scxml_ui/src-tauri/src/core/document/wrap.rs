use std::collections::HashSet;

use crate::core::editor_export::build_inserted_state;
use crate::core::model::{State, StateId, StateKind, Workflow, WorkflowIndex};

use super::commands::WorkflowCommandChanges;
use super::reparent::{recalculate_transition_owners, reconcile_parallel_lane};
use super::types::{ParallelLaneEditorPatchDto, WrapEditorGroupDto};

fn set_previous_scope_initial(
    workflow: &mut Workflow,
    parent_id: Option<&StateId>,
    container_id: &StateId,
    container_scxml_id: &str,
) -> Vec<String> {
    let mut changed = Vec::new();

    if let Some(parent_id) = parent_id {
        if let Some(parent) = workflow.states.iter_mut().find(|state| &state.id == parent_id) {
            parent.initial_child_id = Some(container_id.clone());
            parent.initial_child_scxml_id = Some(container_scxml_id.to_string());
            changed.push(parent.id.as_str().to_string());
        }

        for sibling in workflow
            .states
            .iter_mut()
            .filter(|state| state.parent_id.as_ref() == Some(parent_id))
        {
            let should_be_initial = sibling.id == *container_id;
            if sibling.is_initial != should_be_initial {
                sibling.is_initial = should_be_initial;
                changed.push(sibling.id.as_str().to_string());
            }
        }
    } else {
        workflow.initial_state_id = Some(container_id.clone());
        workflow.initial_scxml_state_id = Some(container_scxml_id.to_string());
        for root in workflow.states.iter_mut().filter(|state| state.parent_id.is_none()) {
            let should_be_initial = root.id == *container_id;
            if root.is_initial != should_be_initial {
                root.is_initial = should_be_initial;
                changed.push(root.id.as_str().to_string());
            }
        }
    }

    changed
}

fn previous_scope_selected_initial(
    workflow: &Workflow,
    parent_id: Option<&StateId>,
    selected: &HashSet<StateId>,
) -> bool {
    let configured = if let Some(parent_id) = parent_id {
        workflow
            .states
            .iter()
            .find(|state| &state.id == parent_id)
            .and_then(|state| state.initial_child_id.as_ref())
            .is_some_and(|id| selected.contains(id))
    } else {
        workflow
            .initial_state_id
            .as_ref()
            .is_some_and(|id| selected.contains(id))
    };

    configured
        || workflow
            .states
            .iter()
            .any(|state| selected.contains(&state.id) && state.is_initial)
}

fn validate_selected_siblings(
    workflow: &Workflow,
    index: &WorkflowIndex,
    selected_ids: &[StateId],
) -> Result<Option<StateId>, String> {
    let Some(first_id) = selected_ids.first() else {
        return Err("Wrapping requires at least one state".into());
    };
    let first = index
        .state(workflow, first_id)
        .ok_or_else(|| format!("Unknown state '{}'", first_id))?;
    let parent_id = first.parent_id.clone();

    for state_id in selected_ids {
        let state = index
            .state(workflow, state_id)
            .ok_or_else(|| format!("Unknown state '{}'", state_id))?;
        if state.parent_id != parent_id {
            return Err("Wrapped states must be siblings".into());
        }
        if matches!(state.kind, StateKind::ParallelLane) {
            return Err("Parallel lane helper states cannot be wrapped".into());
        }
    }

    Ok(parent_id)
}

pub(super) fn wrap_editor_states(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    container_node: crate::core::editor_export::types::EditorExportNodeDto,
    groups: Vec<WrapEditorGroupDto>,
) -> Result<WorkflowCommandChanges, String> {
    let mut raw_ids = Vec::new();
    for group in &groups {
        raw_ids.extend(group.state_ids.iter().cloned());
    }
    let mut seen = HashSet::new();
    let selected_ids = raw_ids
        .into_iter()
        .map(StateId::from)
        .filter(|id| !id.as_str().trim().is_empty())
        .filter(|id| seen.insert(id.clone()))
        .collect::<Vec<_>>();

    let previous_parent_id = validate_selected_siblings(workflow, index, &selected_ids)?;
    if container_node.parent_id.as_deref()
        != previous_parent_id.as_ref().map(|id| id.as_str())
    {
        return Err("Container parent does not match the selected sibling scope".into());
    }

    let mut candidate = workflow.clone();
    let selected_set = selected_ids.iter().cloned().collect::<HashSet<_>>();
    let was_initial = previous_scope_selected_initial(
        &candidate,
        previous_parent_id.as_ref(),
        &selected_set,
    );

    let mut container = State::from_dto(build_inserted_state(&container_node));
    if !matches!(container.kind, StateKind::Compound | StateKind::Parallel) {
        return Err("Wrapped container must be Compound or Parallel".into());
    }
    if candidate.states.iter().any(|state| state.id == container.id) {
        return Err(format!("State '{}' already exists", container.id));
    }

    let container_id = container.id.clone();
    let container_scxml_id = container.scxml_id.clone();
    container.parent_id = previous_parent_id.clone();
    container.is_initial = was_initial;
    container.initial_child_id = None;
    container.initial_child_scxml_id = None;
    candidate.states.push(container);

    let mut changed_state_ids = vec![container_id.as_str().to_string()];
    let mut lane_updates = Vec::<ParallelLaneEditorPatchDto>::new();

    match candidate
        .states
        .iter()
        .find(|state| state.id == container_id)
        .map(|state| state.kind.clone())
        .ok_or_else(|| "Wrapped container disappeared".to_string())?
    {
        StateKind::Compound => {
            let requested_initial = selected_ids
                .iter()
                .find(|id| {
                    candidate
                        .states
                        .iter()
                        .find(|state| state.id == **id)
                        .is_some_and(|state| state.is_initial)
                })
                .cloned()
                .or_else(|| selected_ids.first().cloned());

            for state_id in &selected_ids {
                let state = candidate
                    .states
                    .iter_mut()
                    .find(|state| state.id == *state_id)
                    .ok_or_else(|| format!("Unknown wrapped state '{}'", state_id))?;
                state.parent_id = Some(container_id.clone());
                state.is_initial = requested_initial.as_ref() == Some(state_id);
                changed_state_ids.push(state.id.as_str().to_string());
            }

            let initial_scxml_id = requested_initial.as_ref().and_then(|initial_id| {
                candidate
                    .states
                    .iter()
                    .find(|state| state.id == *initial_id)
                    .map(|state| state.scxml_id.clone())
            });
            if let Some(container) = candidate
                .states
                .iter_mut()
                .find(|state| state.id == container_id)
            {
                container.initial_child_id = requested_initial;
                container.initial_child_scxml_id = initial_scxml_id;
            }
        }
        StateKind::Parallel => {
            if groups.iter().any(|group| group.lane.is_none()) {
                return Err("Parallel wrapping requires lane context for every group".into());
            }

            for state_id in &selected_ids {
                let state = candidate
                    .states
                    .iter_mut()
                    .find(|state| state.id == *state_id)
                    .ok_or_else(|| format!("Unknown wrapped state '{}'", state_id))?;
                state.parent_id = Some(container_id.clone());
                state.is_initial = false;
                changed_state_ids.push(state.id.as_str().to_string());
            }

            for group in &groups {
                let lane = group.lane.as_ref().expect("validated lane context");
                let lane_members = lane
                    .member_state_ids
                    .iter()
                    .map(|id| StateId::from(id.as_str()))
                    .collect::<HashSet<_>>();
                let expected = group
                    .state_ids
                    .iter()
                    .map(|id| StateId::from(id.as_str()))
                    .collect::<HashSet<_>>();
                if lane_members != expected {
                    return Err(format!(
                        "Parallel lane '{}' members do not match its wrap group",
                        lane.lane.id
                    ));
                }
                let (changes, patch) = reconcile_parallel_lane(&mut candidate, lane)?;
                changed_state_ids.extend(changes);
                lane_updates.push(patch);
            }
        }
        _ => unreachable!(),
    }

    if was_initial {
        changed_state_ids.extend(set_previous_scope_initial(
            &mut candidate,
            previous_parent_id.as_ref(),
            &container_id,
            &container_scxml_id,
        ));
    }

    let changed_transition_ids = recalculate_transition_owners(&mut candidate)?;
    *workflow = candidate;

    changed_state_ids.sort();
    changed_state_ids.dedup();
    Ok(WorkflowCommandChanges {
        changed_state_ids,
        changed_transition_ids,
        index_changed: true,
        parallel_lane_updates: lane_updates,
        ..WorkflowCommandChanges::default()
    })
}
