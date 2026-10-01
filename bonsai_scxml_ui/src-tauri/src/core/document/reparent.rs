use std::collections::HashSet;

use crate::core::editor_export::build_inserted_state;
use crate::core::model::{
    EditorPosition, State, StateId, StateKind, Transition, Workflow, WorkflowIndex,
};
use crate::core::transitions::events::scxml_transition_event;

use super::commands::WorkflowCommandChanges;
use super::types::{ParallelLaneEditorPatchDto, ParallelLaneMoveContextDto};

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


fn lane_state_name(context: &ParallelLaneMoveContextDto) -> String {
    let lane = State::from_dto(build_inserted_state(&context.lane));
    lane.scxml_id
}

fn lane_parallel_id(context: &ParallelLaneMoveContextDto) -> Result<StateId, String> {
    if context.lane.node_type != "parallelLane" {
        return Err(format!(
            "Editor lane '{}' is not a Parallel lane",
            context.lane.id
        ));
    }
    let parent_id = context
        .lane
        .parent_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Parallel lane '{}' has no parent Parallel", context.lane.id))?;
    Ok(StateId::from(parent_id))
}

fn lane_member_ids(context: &ParallelLaneMoveContextDto) -> Result<Vec<StateId>, String> {
    let mut seen = HashSet::new();
    let mut members = Vec::new();
    for raw_id in &context.member_state_ids {
        let id = StateId::from(raw_id.as_str());
        if id.as_str().is_empty() {
            continue;
        }
        if !seen.insert(id.clone()) {
            return Err(format!(
                "Parallel lane '{}' contains duplicate state '{}'",
                context.lane.id, id
            ));
        }
        members.push(id);
    }
    Ok(members)
}

fn reconcile_wrapped_parallel_lane(
    workflow: &mut Workflow,
    context: &ParallelLaneMoveContextDto,
    wrapper_node: &crate::core::editor_export::types::EditorExportNodeDto,
) -> Result<(Vec<String>, ParallelLaneEditorPatchDto), String> {
    let lane_id = StateId::from(context.lane.id.as_str());
    let parallel_id = lane_parallel_id(context)?;
    let members = lane_member_ids(context)?;
    let wrapper_id = StateId::from(wrapper_node.id.as_str());

    if wrapper_id.as_str().is_empty() {
        return Err(format!(
            "Parallel lane '{}' wrapper id must not be empty",
            context.lane.id
        ));
    }
    if wrapper_node.node_type != "compound" {
        return Err(format!(
            "Parallel lane '{}' wrapper '{}' is not a Compound",
            context.lane.id, wrapper_node.id
        ));
    }
    if wrapper_node.parent_id.as_deref() != Some(context.lane.id.as_str()) {
        return Err(format!(
            "Parallel lane '{}' wrapper '{}' has the wrong editor parent",
            context.lane.id, wrapper_node.id
        ));
    }

    let parallel = workflow
        .states
        .iter()
        .find(|state| state.id == parallel_id)
        .ok_or_else(|| format!("Unknown parent Parallel '{}'", parallel_id))?;
    if parallel.kind != StateKind::Parallel {
        return Err(format!(
            "Parallel lane '{}' parent '{}' is not a Parallel state",
            context.lane.id, parallel.scxml_id
        ));
    }

    for member_id in &members {
        if !workflow.states.iter().any(|state| state.id == *member_id) {
            return Err(format!(
                "Unknown Parallel lane member '{}' in lane '{}'",
                member_id, context.lane.id
            ));
        }
    }

    let mut changed = Vec::new();

    if let Some(position) = workflow.states.iter().position(|state| state.id == lane_id) {
        let lane = &mut workflow.states[position];
        if lane.kind != StateKind::ParallelLane || lane.parent_id.as_ref() != Some(&parallel_id) {
            lane.kind = StateKind::ParallelLane;
            lane.parent_id = Some(parallel_id.clone());
            changed.push(lane.id.as_str().to_string());
        }
    } else {
        let mut lane = State::from_dto(build_inserted_state(&context.lane));
        lane.id = lane_id.clone();
        lane.kind = StateKind::ParallelLane;
        lane.parent_id = Some(parallel_id.clone());
        lane.is_initial = false;
        lane.initial_child_id = None;
        lane.initial_child_scxml_id = None;
        workflow.states.push(lane);
        changed.push(lane_id.as_str().to_string());
    }

    if let Some(position) = workflow.states.iter().position(|state| state.id == wrapper_id) {
        let wrapper = &mut workflow.states[position];
        if wrapper.kind != StateKind::Compound || wrapper.parent_id.as_ref() != Some(&lane_id) {
            wrapper.kind = StateKind::Compound;
            wrapper.parent_id = Some(lane_id.clone());
            changed.push(wrapper.id.as_str().to_string());
        }
    } else {
        let mut wrapper = State::from_dto(build_inserted_state(wrapper_node));
        wrapper.id = wrapper_id.clone();
        wrapper.kind = StateKind::Compound;
        wrapper.parent_id = Some(lane_id.clone());
        wrapper.is_initial = false;
        workflow.states.push(wrapper);
        changed.push(wrapper_id.as_str().to_string());
    }

    if let Some(unexpected) = workflow.states.iter().find(|state| {
        state.parent_id.as_ref() == Some(&lane_id) && state.id != wrapper_id
    }) {
        if !members.contains(&unexpected.id) {
            return Err(format!(
                "Parallel lane '{}' contains unexpected semantic child '{}'",
                context.lane.id, unexpected.id
            ));
        }
    }
    if let Some(unexpected) = workflow.states.iter().find(|state| {
        state.parent_id.as_ref() == Some(&wrapper_id) && !members.contains(&state.id)
    }) {
        return Err(format!(
            "Parallel lane '{}' wrapper '{}' contains semantic child '{}' that is not present in the editor lane context",
            context.lane.id, wrapper_id, unexpected.id
        ));
    }

    let requested_initial = wrapper_node
        .initial_child_id
        .as_deref()
        .map(StateId::from)
        .filter(|id| members.contains(id));
    let existing_initial = workflow
        .states
        .iter()
        .find(|state| state.id == wrapper_id)
        .and_then(|state| state.initial_child_id.clone())
        .filter(|id| members.contains(id));
    let flagged_initial = members
        .iter()
        .find(|member_id| {
            workflow
                .states
                .iter()
                .find(|state| state.id == **member_id)
                .is_some_and(|state| state.is_initial)
        })
        .cloned();
    let initial_child_id = requested_initial
        .or(existing_initial)
        .or(flagged_initial)
        .or_else(|| members.first().cloned());

    for member_id in &members {
        let member = workflow
            .states
            .iter_mut()
            .find(|state| state.id == *member_id)
            .ok_or_else(|| format!("Unknown Parallel lane member '{}'", member_id))?;
        let should_be_initial = initial_child_id.as_ref() == Some(member_id);
        if member.parent_id.as_ref() != Some(&wrapper_id) || member.is_initial != should_be_initial {
            member.parent_id = Some(wrapper_id.clone());
            member.is_initial = should_be_initial;
            changed.push(member.id.as_str().to_string());
        }
    }

    let initial_scxml_id = initial_child_id.as_ref().and_then(|selected_id| {
        workflow
            .states
            .iter()
            .find(|state| state.id == *selected_id)
            .map(|state| state.scxml_id.clone())
    });
    let wrapper_scxml_id = workflow
        .states
        .iter()
        .find(|state| state.id == wrapper_id)
        .map(|state| state.scxml_id.clone())
        .ok_or_else(|| format!("Parallel lane wrapper '{}' disappeared", wrapper_id))?;

    if let Some(wrapper) = workflow.states.iter_mut().find(|state| state.id == wrapper_id) {
        if wrapper.initial_child_id != initial_child_id
            || wrapper.initial_child_scxml_id != initial_scxml_id
        {
            wrapper.initial_child_id = initial_child_id.clone();
            wrapper.initial_child_scxml_id = initial_scxml_id;
            changed.push(wrapper.id.as_str().to_string());
        }
    }

    if let Some(lane) = workflow.states.iter_mut().find(|state| state.id == lane_id) {
        if lane.initial_child_id.as_ref() != Some(&wrapper_id)
            || lane.initial_child_scxml_id.as_deref() != Some(wrapper_scxml_id.as_str())
        {
            lane.initial_child_id = Some(wrapper_id.clone());
            lane.initial_child_scxml_id = Some(wrapper_scxml_id);
            changed.push(lane.id.as_str().to_string());
        }
    }

    changed.sort();
    changed.dedup();
    Ok((
        changed,
        ParallelLaneEditorPatchDto {
            lane_id: lane_id.as_str().to_string(),
            parent_parallel_id: parallel_id.as_str().to_string(),
            initial_child_id: Some(wrapper_id.as_str().to_string()),
            member_state_ids: members
                .iter()
                .map(|id| id.as_str().to_string())
                .collect(),
        },
    ))
}

fn reconcile_parallel_lane(
    workflow: &mut Workflow,
    context: &ParallelLaneMoveContextDto,
) -> Result<(Vec<String>, ParallelLaneEditorPatchDto), String> {
    if let Some(wrapper) = context.wrapper.as_ref() {
        return reconcile_wrapped_parallel_lane(workflow, context, wrapper);
    }

    let lane_id = StateId::from(context.lane.id.as_str());
    if lane_id.as_str().is_empty() {
        return Err("Parallel lane id must not be empty".into());
    }
    let parallel_id = lane_parallel_id(context)?;
    let members = lane_member_ids(context)?;
    if members.iter().any(|member_id| member_id == &lane_id) {
        return Err(format!(
            "Parallel lane '{}' cannot contain itself",
            context.lane.id
        ));
    }

    let parallel = workflow
        .states
        .iter()
        .find(|state| state.id == parallel_id)
        .ok_or_else(|| format!("Unknown parent Parallel '{}'", parallel_id))?;
    if parallel.kind != StateKind::Parallel {
        return Err(format!(
            "Parallel lane '{}' parent '{}' is not a Parallel state",
            context.lane.id, parallel.scxml_id
        ));
    }

    for member_id in &members {
        if !workflow.states.iter().any(|state| state.id == *member_id) {
            return Err(format!(
                "Unknown Parallel lane member '{}' in lane '{}'",
                member_id, context.lane.id
            ));
        }
    }

    let lane_scxml_id = lane_state_name(context);
    let flatten = members.len() == 1
        && workflow
            .states
            .iter()
            .find(|state| state.id == members[0])
            .is_some_and(|state| state.scxml_id == lane_scxml_id);

    let existing_lane = workflow.states.iter().position(|state| state.id == lane_id);
    let existing_initial = existing_lane
        .and_then(|position| workflow.states[position].initial_child_id.clone())
        .filter(|id| members.contains(id));
    let flagged_initial = members.iter().find(|member_id| {
        workflow
            .states
            .iter()
            .find(|state| state.id == **member_id)
            .is_some_and(|state| state.is_initial)
    }).cloned();
    let initial_child_id = existing_initial
        .or(flagged_initial)
        .or_else(|| members.first().cloned());

    let mut changed = Vec::new();

    if flatten {
        if let Some(position) = existing_lane {
            let unexpected_child = workflow.states.iter().find(|state| {
                state.parent_id.as_ref() == Some(&lane_id) && !members.contains(&state.id)
            });
            if let Some(child) = unexpected_child {
                return Err(format!(
                    "Parallel lane '{}' contains semantic child '{}' that is not present in the editor lane context",
                    context.lane.id, child.id
                ));
            }
            if workflow.transitions.iter().any(|transition| {
                transition.source_state_id == lane_id
                    || transition.target_state_id.as_ref() == Some(&lane_id)
            }) {
                return Err(format!(
                    "Flattening Parallel lane '{}' requires transition retargeting",
                    context.lane.id
                ));
            }
            workflow.states.remove(position);
            changed.push(lane_id.as_str().to_string());
        }

        let member_id = &members[0];
        let member = workflow
            .states
            .iter_mut()
            .find(|state| state.id == *member_id)
            .ok_or_else(|| format!("Unknown Parallel lane member '{}'", member_id))?;
        if member.parent_id.as_ref() != Some(&parallel_id) || member.is_initial {
            member.parent_id = Some(parallel_id.clone());
            member.is_initial = false;
            changed.push(member.id.as_str().to_string());
        }
    } else {
        if existing_lane.is_none() {
            let mut lane = State::from_dto(build_inserted_state(&context.lane));
            lane.id = lane_id.clone();
            lane.kind = StateKind::ParallelLane;
            lane.parent_id = Some(parallel_id.clone());
            lane.is_initial = false;
            lane.initial_child_id = None;
            lane.initial_child_scxml_id = None;
            workflow.states.push(lane);
            changed.push(lane_id.as_str().to_string());
        } else if let Some(position) = workflow.states.iter().position(|state| state.id == lane_id) {
            let lane = &mut workflow.states[position];
            if lane.kind != StateKind::ParallelLane || lane.parent_id.as_ref() != Some(&parallel_id) {
                lane.kind = StateKind::ParallelLane;
                lane.parent_id = Some(parallel_id.clone());
                changed.push(lane_id.as_str().to_string());
            }
        }

        let unexpected_child = workflow.states.iter().find(|state| {
            state.parent_id.as_ref() == Some(&lane_id) && !members.contains(&state.id)
        });
        if let Some(child) = unexpected_child {
            return Err(format!(
                "Parallel lane '{}' contains semantic child '{}' that is not present in the editor lane context",
                context.lane.id, child.id
            ));
        }

        for member_id in &members {
            let member = workflow
                .states
                .iter_mut()
                .find(|state| state.id == *member_id)
                .ok_or_else(|| format!("Unknown Parallel lane member '{}'", member_id))?;
            let should_be_initial = initial_child_id.as_ref() == Some(member_id);
            if member.parent_id.as_ref() != Some(&lane_id) || member.is_initial != should_be_initial {
                member.parent_id = Some(lane_id.clone());
                member.is_initial = should_be_initial;
                changed.push(member.id.as_str().to_string());
            }
        }

        let selected_scxml_id = initial_child_id.as_ref().and_then(|selected_id| {
            workflow
                .states
                .iter()
                .find(|state| state.id == *selected_id)
                .map(|state| state.scxml_id.clone())
        });
        let lane = workflow
            .states
            .iter_mut()
            .find(|state| state.id == lane_id)
            .ok_or_else(|| format!("Parallel lane '{}' disappeared during normalization", lane_id))?;
        if lane.initial_child_id != initial_child_id
            || lane.initial_child_scxml_id != selected_scxml_id
        {
            lane.initial_child_id = initial_child_id.clone();
            lane.initial_child_scxml_id = selected_scxml_id;
            changed.push(lane.id.as_str().to_string());
        }
    }

    changed.sort();
    changed.dedup();
    Ok((
        changed,
        ParallelLaneEditorPatchDto {
            lane_id: lane_id.as_str().to_string(),
            parent_parallel_id: parallel_id.as_str().to_string(),
            initial_child_id: initial_child_id.map(|id| id.as_str().to_string()),
            member_state_ids: members
                .iter()
                .map(|id| id.as_str().to_string())
                .collect(),
        },
    ))
}

fn validate_non_parallel_target(
    workflow: &Workflow,
    index: &WorkflowIndex,
    moving_id: &StateId,
    parent_id: Option<&StateId>,
) -> Result<(), String> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    if parent_id == moving_id {
        return Err("A state cannot be its own parent".into());
    }
    let parent = index
        .state(workflow, parent_id)
        .ok_or_else(|| format!("Unknown parent state '{parent_id}'"))?;
    if parent.kind != StateKind::Compound || has_parallel_scope(workflow, index, parent_id) {
        return Err(format!(
            "State '{}' can only be incrementally moved into a non-Parallel Compound",
            index
                .state(workflow, moving_id)
                .map(|state| state.scxml_id.as_str())
                .unwrap_or(moving_id.as_str())
        ));
    }
    if is_state_within(workflow, index, parent_id, moving_id) {
        return Err(format!(
            "Moving '{}' into '{}' would create a parent cycle",
            index
                .state(workflow, moving_id)
                .map(|state| state.scxml_id.as_str())
                .unwrap_or(moving_id.as_str()),
            parent.scxml_id
        ));
    }
    Ok(())
}

pub(super) fn move_editor_state(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    parent_state_id: Option<String>,
    source_lane: Option<ParallelLaneMoveContextDto>,
    target_lane: Option<ParallelLaneMoveContextDto>,
    x: f64,
    y: f64,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let state_position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    if workflow.states[state_position].kind == StateKind::ParallelLane {
        return Err("Parallel lane helper states are not draggable".into());
    }

    let has_lane_context = source_lane.is_some() || target_lane.is_some();
    if !has_lane_context && has_parallel_scope(workflow, index, &id) {
        return Err(
            "Parallel-scoped states must include Parallel lane context or use the structural editor exporter".into(),
        );
    }

    let next_parent_id = parent_state_id.map(StateId::from);
    if target_lane.is_none() {
        validate_non_parallel_target(workflow, index, &id, next_parent_id.as_ref())?;
    }

    let previous_parent_id = workflow.states[state_position].parent_id.clone();
    if !has_lane_context && previous_parent_id == next_parent_id {
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
    let temporary_target_parent = if let Some(target_lane) = target_lane.as_ref() {
        Some(lane_parallel_id(target_lane)?)
    } else {
        next_parent_id.clone()
    };
    candidate.states[state_position].parent_id = temporary_target_parent;
    update_editor_position(&mut candidate.states[state_position], x, y);

    let mut changed_state_ids = vec![id.as_str().to_string()];
    let mut parallel_lane_updates = Vec::new();

    if source_lane.is_none() {
        changed_state_ids.extend(normalize_initial_scope(
            &mut candidate,
            previous_parent_id.as_ref(),
            false,
        ));
    }

    if let Some(source_lane) = source_lane.as_ref() {
        let (lane_changes, lane_patch) = reconcile_parallel_lane(&mut candidate, source_lane)?;
        changed_state_ids.extend(lane_changes);
        parallel_lane_updates.push(lane_patch);
    }

    if let Some(target_lane) = target_lane.as_ref() {
        let (lane_changes, lane_patch) = reconcile_parallel_lane(&mut candidate, target_lane)?;
        changed_state_ids.extend(lane_changes);
        parallel_lane_updates.push(lane_patch);
    } else {
        changed_state_ids.extend(normalize_initial_scope(
            &mut candidate,
            next_parent_id.as_ref(),
            true,
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
        parallel_lane_updates,
        ..WorkflowCommandChanges::default()
    })
}
