use std::collections::HashSet;

use crate::core::model::{
    EditorPosition, State, StateId, StateKind, Transition, Workflow, WorkflowIndex,
};
use crate::core::transitions::events::scxml_transition_event;

use super::commands::WorkflowCommandChanges;

pub(super) fn update_editor_position(state: &mut State, x: f64, y: f64) {
    state.editor.x = x;
    state.editor.y = y;

    if let Some(primary) = state
        .editor
        .positions
        .iter_mut()
        .find(|position| position.clone_type.is_none())
    {
        primary.x = x;
        primary.y = y;
    } else {
        state.editor.positions.insert(
            0,
            EditorPosition {
                x,
                y,
                instance_id: None,
                clone_type: None,
            },
        );
    }
}

fn normalize_initial_scope(
    workflow: &mut Workflow,
    parent_id: Option<&StateId>,
    select_single_if_missing: bool,
) -> Vec<String> {
    let child_positions = workflow
        .states
        .iter()
        .enumerate()
        .filter_map(|(position, state)| {
            (state.parent_id.as_ref() == parent_id).then_some(position)
        })
        .collect::<Vec<_>>();

    let current_initial = if let Some(parent_id) = parent_id {
        workflow
            .states
            .iter()
            .find(|state| &state.id == parent_id)
            .and_then(|parent| parent.initial_child_id.clone())
    } else {
        workflow.initial_state_id.clone()
    };

    let is_direct_child = |id: &StateId| {
        child_positions
            .iter()
            .any(|position| workflow.states[*position].id == *id)
    };

    let flagged_initial = child_positions
        .iter()
        .map(|position| &workflow.states[*position])
        .find(|state| state.is_initial)
        .map(|state| state.id.clone());
    let had_initial = current_initial.is_some() || flagged_initial.is_some();
    let selected_id = current_initial
        .filter(|id| is_direct_child(id))
        .or(flagged_initial)
        .or_else(|| {
            (had_initial || (select_single_if_missing && child_positions.len() == 1))
                .then(|| {
                    child_positions
                        .first()
                        .map(|position| workflow.states[*position].id.clone())
                })
                .flatten()
        });

    let selected_scxml_id = selected_id.as_ref().and_then(|selected_id| {
        child_positions
            .iter()
            .map(|position| &workflow.states[*position])
            .find(|state| state.id == *selected_id)
            .map(|state| state.scxml_id.clone())
    });

    let mut changed = Vec::new();
    for position in child_positions {
        let state = &mut workflow.states[position];
        let should_be_initial = selected_id.as_ref() == Some(&state.id);
        if state.is_initial != should_be_initial {
            state.is_initial = should_be_initial;
            changed.push(state.id.as_str().to_string());
        }
    }

    if let Some(parent_id) = parent_id {
        if let Some(parent) = workflow.states.iter_mut().find(|state| &state.id == parent_id) {
            if parent.initial_child_id != selected_id
                || parent.initial_child_scxml_id != selected_scxml_id
            {
                parent.initial_child_id = selected_id;
                parent.initial_child_scxml_id = selected_scxml_id;
                changed.push(parent.id.as_str().to_string());
            }
        }
    } else {
        workflow.initial_state_id = selected_id;
        workflow.initial_scxml_state_id = selected_scxml_id;
    }

    changed
}

fn is_state_within(
    workflow: &Workflow,
    index: &WorkflowIndex,
    state_id: &StateId,
    ancestor_id: &StateId,
) -> bool {
    state_id == ancestor_id || index.is_ancestor_of(workflow, ancestor_id, state_id)
}


fn has_parallel_scope(
    workflow: &Workflow,
    index: &WorkflowIndex,
    state_id: &StateId,
) -> bool {
    let mut current = index.parent_of(workflow, state_id);
    let mut visited = HashSet::new();
    while let Some(parent_id) = current {
        if !visited.insert(parent_id.clone()) {
            return true;
        }
        let Some(parent) = index.state(workflow, parent_id) else {
            return true;
        };
        if matches!(parent.kind, StateKind::Parallel | StateKind::ParallelLane) {
            return true;
        }
        current = parent.parent_id.as_ref();
    }
    false
}

fn transition_owner_for_logical_source(
    workflow: &Workflow,
    index: &WorkflowIndex,
    source_id: &StateId,
    target_id: Option<&StateId>,
) -> Result<StateId, String> {
    let source = index
        .state(workflow, source_id)
        .ok_or_else(|| format!("Unknown logical transition source '{source_id}'"))?;

    let mut owner = source_id.clone();
    let mut current = source.parent_id.clone();
    let mut visited = HashSet::new();

    while let Some(parent_id) = current {
        if !visited.insert(parent_id.clone()) {
            return Err(format!(
                "Parent cycle while resolving transition owner for '{}'",
                source.scxml_id
            ));
        }

        let parent = index
            .state(workflow, &parent_id)
            .ok_or_else(|| format!("Unknown transition ancestor '{parent_id}'"))?;
        if matches!(parent.kind, StateKind::Compound | StateKind::Parallel) {
            let target_inside = target_id
                .is_some_and(|target| is_state_within(workflow, index, target, &parent_id));
            if !target_inside {
                owner = parent_id.clone();
            }
        }
        current = parent.parent_id.clone();
    }

    Ok(owner)
}

fn container_transition_key(transition: &Transition) -> String {
    let assignments = transition
        .assignments
        .iter()
        .map(|assignment| format!("{}={}", assignment.location, assignment.expression))
        .collect::<Vec<_>>()
        .join("\u{1f}");
    format!(
        "{}\u{1e}{}\u{1e}{}\u{1e}{}\u{1e}{}",
        transition.source_state_id.as_str(),
        transition.event,
        transition.target_scxml_id,
        transition.condition,
        assignments
    )
}

fn recalculate_transition_owners(
    workflow: &mut Workflow,
) -> Result<Vec<String>, String> {
    let index = WorkflowIndex::new(workflow);
    let mut plans = Vec::new();

    for (transition_index, transition) in workflow.transitions.iter().enumerate() {
        if transition.logical_sources.is_empty() {
            continue;
        }

        let mut resolved_owner: Option<StateId> = None;
        let mut resolved_event: Option<String> = None;
        for logical_source in &transition.logical_sources {
            let source = index
                .state(workflow, &logical_source.state_id)
                .ok_or_else(|| {
                    format!(
                        "Unknown logical transition source '{}'",
                        logical_source.state_id
                    )
                })?;
            let owner = transition_owner_for_logical_source(
                workflow,
                &index,
                &logical_source.state_id,
                transition.target_state_id.as_ref(),
            )?;
            let event = scxml_transition_event(&logical_source.handle, &source.scxml_id);

            if resolved_owner.as_ref().is_some_and(|current| current != &owner)
                || resolved_event.as_ref().is_some_and(|current| current != &event)
            {
                return Err(format!(
                    "Transition '{}' requires splitting after reparenting",
                    transition.id
                ));
            }

            resolved_owner = Some(owner);
            resolved_event = Some(event);
        }

        let owner = resolved_owner.unwrap_or_else(|| transition.source_state_id.clone());
        let event = resolved_event.unwrap_or_else(|| transition.event.clone());
        if transition.source_state_id != owner || transition.event != event {
            plans.push((transition_index, owner, event));
        }
    }

    let mut changed = Vec::new();
    for (transition_index, owner, event) in plans {
        let transition = &mut workflow.transitions[transition_index];
        transition.source_state_id = owner;
        transition.event = event;
        changed.push(transition.id.as_str().to_string());
    }

    // The editor exporter merges equivalent exits once they become owned by the
    // same Compound/Parallel. Keep the incremental command conservative: if a
    // move would require that merge, fall back to the full structural exporter
    // instead of inventing a second merge implementation here.
    let index = WorkflowIndex::new(workflow);
    let mut seen_container_transitions = HashSet::new();
    for transition in &workflow.transitions {
        let Some(owner) = index.state(workflow, &transition.source_state_id) else {
            continue;
        };
        if !matches!(owner.kind, StateKind::Compound | StateKind::Parallel) {
            continue;
        }
        let key = container_transition_key(transition);
        if !seen_container_transitions.insert(key) {
            return Err(format!(
                "Reparenting requires merging equivalent transition '{}'",
                transition.id
            ));
        }
    }

    Ok(changed)
}

pub(super) fn move_editor_state(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    parent_state_id: Option<String>,
    x: f64,
    y: f64,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let state_position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    if workflow.states[state_position].kind == StateKind::ParallelLane
        || has_parallel_scope(workflow, index, &id)
    {
        return Err(
            "Parallel-scoped states must be moved through the structural editor exporter".into(),
        );
    }

    let next_parent_id = parent_state_id.map(StateId::from);
    if let Some(parent_id) = next_parent_id.as_ref() {
        if parent_id == &id {
            return Err("A state cannot be its own parent".into());
        }
        let parent = index
            .state(workflow, parent_id)
            .ok_or_else(|| format!("Unknown parent state '{parent_id}'"))?;
        if parent.kind != StateKind::Compound || has_parallel_scope(workflow, index, parent_id) {
            return Err(format!(
                "State '{}' can only be incrementally moved into a non-Parallel Compound",
                workflow.states[state_position].scxml_id
            ));
        }
        if is_state_within(workflow, index, parent_id, &id) {
            return Err(format!(
                "Moving '{}' into '{}' would create a parent cycle",
                workflow.states[state_position].scxml_id, parent.scxml_id
            ));
        }
    }

    let previous_parent_id = workflow.states[state_position].parent_id.clone();
    if previous_parent_id == next_parent_id {
        update_editor_position(&mut workflow.states[state_position], x, y);
        return Ok(WorkflowCommandChanges {
            changed_state_ids: vec![id.as_str().to_string()],
            ..WorkflowCommandChanges::default()
        });
    }

    // Perform the move transactionally. Transition re-ownership can discover a
    // shared-boundary case that still needs the full editor exporter; in that
    // case the stored workflow must remain untouched so the frontend bridge can
    // safely fall back to a structural resync.
    let mut candidate = workflow.clone();
    candidate.states[state_position].parent_id = next_parent_id.clone();
    update_editor_position(&mut candidate.states[state_position], x, y);

    let mut changed_state_ids = vec![id.as_str().to_string()];
    changed_state_ids.extend(normalize_initial_scope(
        &mut candidate,
        previous_parent_id.as_ref(),
        false,
    ));
    changed_state_ids.extend(normalize_initial_scope(
        &mut candidate,
        next_parent_id.as_ref(),
        true,
    ));

    let changed_transition_ids = recalculate_transition_owners(&mut candidate)?;
    *workflow = candidate;

    changed_state_ids.sort();
    changed_state_ids.dedup();
    Ok(WorkflowCommandChanges {
        changed_state_ids,
        changed_transition_ids,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}
