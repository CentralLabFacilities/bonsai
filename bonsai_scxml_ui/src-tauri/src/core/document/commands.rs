use std::collections::{HashMap, HashSet, VecDeque};

use crate::core::editor_export::{
    build_inserted_state, build_workflow_from_editor, EditorExportRequestDto,
};
use crate::core::editor_export::types::{
    EditorExportEdgeDto, EditorExportNodeDto, EditorExportSlotDeclarationDto, EditorExportSlotDto,
};
use crate::core::model::{
    Assignment, DataModelEntry, EditorPosition, Parameter, Slot, SlotDeclaration, State, StateId,
    StateKind, Transition, TransitionId, TransitionSource, Workflow, WorkflowIndex,
};

use super::paste::paste_editor_subgraph;
use super::reparent::{
    move_editor_state, recalculate_transition_owners, reconcile_parallel_lane_command,
    update_editor_position,
};
use super::wrap::wrap_editor_states;
use super::types::{
    ParallelLaneEditorPatchDto, StateSlotsCommandDto, TargetedTransitionCommandDto,
    WorkflowCommandDto,
};

#[derive(Debug, Clone, Default)]
pub(crate) struct WorkflowCommandChanges {
    pub changed_state_ids: Vec<String>,
    pub changed_transition_ids: Vec<String>,
    pub data_model_changed: bool,
    pub slot_declarations_changed: bool,
    pub index_changed: bool,
    /// The frontend already applied this state-only mutation optimistically.
    /// Keep the changed ids for backend bookkeeping, but do not serialize the
    /// same state back across IPC just to project it into React a second time.
    pub omit_state_patch: bool,
    pub parallel_lane_updates: Vec<ParallelLaneEditorPatchDto>,
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
            full_skill_name,
        } => rename_state(
            workflow,
            index,
            state_id,
            scxml_id,
            label,
            full_skill_name,
        ),
        WorkflowCommandDto::AddState { state } => add_state(workflow, index, state),
        WorkflowCommandDto::InsertEditorStates { nodes } => {
            insert_editor_states(workflow, nodes)
        }
        WorkflowCommandDto::MoveEditorState {
            state_id,
            parent_state_id,
            source_lane,
            target_lane,
            x,
            y,
        } => move_editor_state(
            workflow,
            index,
            state_id,
            parent_state_id,
            source_lane,
            target_lane,
            x,
            y,
        ),
        WorkflowCommandDto::ReconcileParallelLane { context } => {
            reconcile_parallel_lane_command(workflow, context)
        }
        WorkflowCommandDto::WrapEditorStates { container, groups } => {
            wrap_editor_states(workflow, index, container, groups)
        }
        WorkflowCommandDto::PasteEditorSubgraph {
            state_mappings,
            transition_mappings,
            positions,
        } => paste_editor_subgraph(
            workflow,
            state_mappings,
            transition_mappings,
            positions,
        ),
        WorkflowCommandDto::RemoveStates { state_ids } => {
            remove_states(workflow, index, state_ids)
        }
        WorkflowCommandDto::UpdateStateEditorPosition { state_id, x, y } => {
            update_state_editor_position(workflow, index, state_id, x, y)
        }
        WorkflowCommandDto::ReplaceStateEditorPositions {
            state_id,
            positions,
        } => replace_state_editor_positions(workflow, index, state_id, positions),
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
        WorkflowCommandDto::ReplaceStateParameters {
            state_id,
            parameters,
        } => replace_state_parameters(workflow, index, state_id, parameters),
        WorkflowCommandDto::ReplaceSlotsSnapshot {
            states,
            extra_slot_declarations,
        } => replace_slots_snapshot(
            workflow,
            index,
            states,
            extra_slot_declarations,
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
        WorkflowCommandDto::ReplaceEditorTransitions { nodes, edges } => {
            replace_editor_transitions(workflow, nodes, edges)
        },
    }
}


fn replace_editor_transitions(
    workflow: &mut Workflow,
    nodes: Vec<EditorExportNodeDto>,
    edges: Vec<EditorExportEdgeDto>,
) -> Result<WorkflowCommandChanges, String> {
    let previous_transition_ids = workflow
        .transitions
        .iter()
        .map(|transition| transition.id.as_str().to_string())
        .collect::<HashSet<_>>();

    // Reuse the canonical editor exporter for transition ownership. This is
    // intentionally transition-only: nested skills can become container-owned
    // SCXML transitions (for example `Talk.success` on a Compound), but changing
    // such a transition must not replace state configuration, slots or datamodel.
    let rebuilt = build_workflow_from_editor(&EditorExportRequestDto {
        nodes,
        edges,
        data_model: Vec::new(),
        extra_slot_declarations: Vec::new(),
    })?;

    let mut next_edge_targets = rebuilt
        .states
        .into_iter()
        .map(|state| (state.id, state.editor.edge_targets))
        .collect::<HashMap<_, _>>();

    let mut changed_state_ids = Vec::new();
    for state in &mut workflow.states {
        let next = next_edge_targets
            .remove(state.id.as_str())
            .unwrap_or_default();
        if !editor_edge_targets_equal(&state.editor.edge_targets, &next) {
            state.editor.edge_targets = next;
            changed_state_ids.push(state.id.as_str().to_string());
        }
    }

    workflow.transitions = rebuilt.transitions;

    let mut changed_transition_ids = previous_transition_ids;
    changed_transition_ids.extend(
        workflow
            .transitions
            .iter()
            .map(|transition| transition.id.as_str().to_string()),
    );
    let mut changed_transition_ids = changed_transition_ids.into_iter().collect::<Vec<_>>();
    changed_transition_ids.sort();
    changed_state_ids.sort();

    Ok(WorkflowCommandChanges {
        changed_state_ids,
        changed_transition_ids,
        // Incoming/outgoing transition indexes changed even when state structure did not.
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

fn editor_edge_targets_equal(
    left: &[crate::core::model::EditorEdgeTarget],
    right: &[crate::core::model::EditorEdgeTarget],
) -> bool {
    left.len() == right.len()
        && left.iter().zip(right).all(|(left, right)| {
            left.event == right.event
                && left.target_scxml_id == right.target_scxml_id
                && left.occurrence == right.occurrence
                && left.target_instance_id == right.target_instance_id
        })
}

fn replace_state_parameters(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    parameters: Vec<crate::core::model::ParameterDto>,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;

    workflow.states[position].parameters = parameters
        .into_iter()
        .map(|parameter| Parameter {
            key: parameter.key,
            type_name: parameter.type_name,
            required: parameter.required,
            default_value: parameter.default_value,
            description: parameter.description,
            expression: parameter.expression,
        })
        .collect();

    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        omit_state_patch: true,
        ..WorkflowCommandChanges::default()
    })
}

fn replace_slots_snapshot(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    states: Vec<StateSlotsCommandDto>,
    extra_slot_declarations: Vec<EditorExportSlotDeclarationDto>,
) -> Result<WorkflowCommandChanges, String> {
    let mut changed_state_ids = Vec::new();
    let mut declarations = Vec::new();
    let mut seen_declarations = HashSet::new();

    for state_slots in states {
        let state_id = StateId::from(state_slots.state_id);
        let position = index
            .state_position(&state_id)
            .ok_or_else(|| format!("Unknown state '{state_id}'"))?;

        let state_name = if !state_slots.state_name.trim().is_empty() {
            state_slots.state_name.trim().to_string()
        } else {
            workflow.states[position].scxml_id.clone()
        };

        workflow.states[position].input_slots = state_slots
            .input_slots
            .iter()
            .map(slot_from_editor)
            .collect();
        workflow.states[position].output_slots = state_slots
            .output_slots
            .iter()
            .map(slot_from_editor)
            .collect();
        changed_state_ids.push(state_id.as_str().to_string());

        for slot in state_slots
            .input_slots
            .iter()
            .chain(state_slots.output_slots.iter())
        {
            if let Some(declaration) = declaration_from_editor_slot(slot, &state_name) {
                push_unique_slot_declaration(
                    &mut declarations,
                    &mut seen_declarations,
                    declaration,
                );
            }
        }
    }

    for declaration in extra_slot_declarations {
        let key = declaration.key.trim().to_string();
        let state = declaration.state.trim().to_string();
        let xpath = normalize_xpath(&declaration.xpath);
        // Normal resources need only a path; key/state describe optional bindings.
        if xpath.is_empty() || (declaration.inherited && (key.is_empty() || state.is_empty())) {
            continue;
        }
        push_unique_slot_declaration(
            &mut declarations,
            &mut seen_declarations,
            SlotDeclaration {
                key,
                state,
                xpath,
                inherited: declaration.inherited,
            },
        );
    }

    workflow.slot_declarations = declarations;
    changed_state_ids.sort();
    changed_state_ids.dedup();

    Ok(WorkflowCommandChanges {
        changed_state_ids,
        slot_declarations_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

fn slot_from_editor(slot: &EditorExportSlotDto) -> Slot {
    Slot {
        key: slot.key.clone(),
        type_name: slot.type_name.clone(),
        description: slot.description.clone(),
        path: normalize_xpath(&slot.path),
        inherited: slot.inherited.then(|| {
            if !slot.inherited_xpath.trim().is_empty() {
                normalize_xpath(&slot.inherited_xpath)
            } else {
                slot.inherited_state.trim().to_string()
            }
        }),
    }
}

fn declaration_from_editor_slot(
    slot: &EditorExportSlotDto,
    state_name: &str,
) -> Option<SlotDeclaration> {
    if slot.path.trim().is_empty() {
        return None;
    }

    let key = slot.key.trim().to_string();
    if key.is_empty() {
        return None;
    }

    let inherited = slot.inherited;
    let state = if inherited && !slot.inherited_state.trim().is_empty() {
        slot.inherited_state.trim().to_string()
    } else {
        state_name.to_string()
    };
    let xpath = if inherited && !slot.inherited_xpath.trim().is_empty() {
        normalize_xpath(&slot.inherited_xpath)
    } else {
        normalize_xpath(&slot.path)
    };
    if state.is_empty() || xpath.is_empty() {
        return None;
    }

    Some(SlotDeclaration {
        key,
        state,
        xpath,
        inherited,
    })
}

fn push_unique_slot_declaration(
    declarations: &mut Vec<SlotDeclaration>,
    seen: &mut HashSet<String>,
    declaration: SlotDeclaration,
) {
    let key = format!(
        "{}|{}|{}|{}",
        declaration.inherited, declaration.key, declaration.state, declaration.xpath
    );
    if seen.insert(key) {
        declarations.push(declaration);
    }
}

fn normalize_xpath(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        String::new()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
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

    let root_positions = index
        .children_of(None)
        .iter()
        .filter_map(|id| index.state_position(id))
        .collect::<Vec<_>>();
    let mut changed = Vec::new();
    for position in root_positions {
        let state = &mut workflow.states[position];
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

    let child_positions = index
        .children_of(Some(&parent_id))
        .iter()
        .filter_map(|id| index.state_position(id))
        .collect::<Vec<_>>();
    let mut changed = vec![parent_id.as_str().to_string()];
    for position in child_positions {
        let state = &mut workflow.states[position];
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
    full_skill_name: Option<String>,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    let normalized_scxml_id = scxml_id.trim();
    if normalized_scxml_id.is_empty() {
        return Err("SCXML state id must not be empty".to_string());
    }

    let previous_scxml_id = workflow.states[position].scxml_id.clone();
    workflow.states[position].scxml_id = normalized_scxml_id.to_string();
    if let Some(label) = label {
        workflow.states[position].label = label;
    }
    if let Some(full_skill_name) = full_skill_name {
        workflow.states[position].full_skill_name =
            (!full_skill_name.trim().is_empty()).then_some(full_skill_name);
    }

    if workflow.initial_state_id.as_ref() == Some(&id) {
        workflow.initial_scxml_state_id = Some(normalized_scxml_id.to_string());
    }

    for parent in workflow.states.iter_mut() {
        if parent.initial_child_id.as_ref() == Some(&id) {
            parent.initial_child_scxml_id = Some(normalized_scxml_id.to_string());
        }
        for route in parent.editor.edge_targets.iter_mut() {
            if route.target_scxml_id == previous_scxml_id {
                route.target_scxml_id = normalized_scxml_id.to_string();
            }
            let previous_route_prefix = format!("{}.", previous_scxml_id.trim());
            if !previous_scxml_id.is_empty() && route.event.starts_with(&previous_route_prefix) {
                route.event = format!(
                    "{}.{}",
                    normalized_scxml_id,
                    &route.event[previous_route_prefix.len()..]
                );
            }
        }
    }

    let mut slot_declarations_changed = false;
    for slot in workflow.slot_declarations.iter_mut() {
        if slot.state == previous_scxml_id {
            slot.state = normalized_scxml_id.to_string();
            slot_declarations_changed = true;
        }
    }

    let previous_event_prefix = format!("{}.", previous_scxml_id.trim());
    let next_event_prefix = format!("{}.", normalized_scxml_id);
    let mut source_ancestors = HashSet::new();
    let mut current_parent = index.parent_of(workflow, &id);
    while let Some(parent_id) = current_parent {
        if !source_ancestors.insert(parent_id.clone()) {
            break;
        }
        current_parent = index.parent_of(workflow, parent_id);
    }

    // Only transitions that target the renamed state, are owned by it, or are
    // hoisted to one of its ancestors can be affected by the rename. Using the
    // cached relationship index avoids scanning the complete transition list.
    let mut candidate_transition_ids = HashSet::new();
    candidate_transition_ids.extend(index.incoming_to(&id).iter().cloned());
    candidate_transition_ids.extend(index.outgoing_from(&id).iter().cloned());
    for ancestor_id in &source_ancestors {
        candidate_transition_ids.extend(index.outgoing_from(ancestor_id).iter().cloned());
    }

    let mut changed_transitions = Vec::new();
    for transition_id in candidate_transition_ids {
        let Some(transition_position) = index.transition_position(&transition_id) else {
            continue;
        };
        let transition = &mut workflow.transitions[transition_position];
        let mut changed = false;
        if transition.target_state_id.as_ref() == Some(&id) {
            transition.target_scxml_id = normalized_scxml_id.to_string();
            changed = true;
        }

        // Compound/Parallel boundary transitions are stored on the container,
        // but their event keeps the originating child identity (Child.event).
        // Keep that identity aligned when the child state is renamed.
        let originates_from_renamed_state = transition
            .logical_sources
            .iter()
            .any(|source| source.state_id == id);
        let legacy_hoisted_match = transition.logical_sources.is_empty()
            && (transition.source_state_id == id
                || source_ancestors.contains(&transition.source_state_id));

        if !previous_scxml_id.is_empty()
            && transition.event.starts_with(&previous_event_prefix)
            && (originates_from_renamed_state || legacy_hoisted_match)
        {
            transition.event = format!(
                "{}{}",
                next_event_prefix,
                &transition.event[previous_event_prefix.len()..]
            );
            changed = true;
        }

        if changed {
            changed_transitions.push(transition.id.as_str().to_string());
        }
    }

    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        changed_transition_ids: changed_transitions,
        slot_declarations_changed,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

fn merge_command_changes(
    target: &mut WorkflowCommandChanges,
    source: WorkflowCommandChanges,
) {
    target.changed_state_ids.extend(source.changed_state_ids);
    target
        .changed_transition_ids
        .extend(source.changed_transition_ids);
    target.data_model_changed |= source.data_model_changed;
    target.slot_declarations_changed |= source.slot_declarations_changed;
    target.index_changed |= source.index_changed;
}

fn insert_editor_states(
    workflow: &mut Workflow,
    nodes: Vec<EditorExportNodeDto>,
) -> Result<WorkflowCommandChanges, String> {
    if nodes.is_empty() {
        return Ok(WorkflowCommandChanges::default());
    }

    let mut pending = nodes;
    let mut changes = WorkflowCommandChanges::default();

    while !pending.is_empty() {
        let existing_ids = workflow
            .states
            .iter()
            .map(|state| state.id.as_str().to_string())
            .collect::<HashSet<_>>();
        let pending_ids = pending
            .iter()
            .map(|node| node.id.clone())
            .collect::<HashSet<_>>();

        let next_index = pending.iter().position(|node| match node.parent_id.as_deref() {
            None => true,
            Some(parent_id) => existing_ids.contains(parent_id),
        });

        let Some(next_index) = next_index else {
            let unresolved = pending
                .iter()
                .map(|node| {
                    let parent = node.parent_id.as_deref().unwrap_or("<root>");
                    format!("{} -> {}", node.id, parent)
                })
                .collect::<Vec<_>>()
                .join(", ");
            let unknown_parents = pending
                .iter()
                .filter_map(|node| node.parent_id.as_deref())
                .filter(|parent_id| {
                    !existing_ids.contains(*parent_id) && !pending_ids.contains(*parent_id)
                })
                .map(str::to_string)
                .collect::<Vec<_>>();

            return if unknown_parents.is_empty() {
                Err(format!(
                    "Inserted editor states contain a parent cycle or invalid ordering: {unresolved}"
                ))
            } else {
                Err(format!(
                    "Inserted editor states reference unknown parent(s): {}",
                    unknown_parents.join(", ")
                ))
            };
        };

        let node = pending.remove(next_index);
        if node.node_type == "parallelLane" && node.parent_id.is_none() {
            return Err(format!(
                "Parallel lane '{}' must have a Parallel parent",
                node.id
            ));
        }

        let dynamic_index = WorkflowIndex::new(workflow);
        let delta = add_state(workflow, &dynamic_index, build_inserted_state(&node))?;
        merge_command_changes(&mut changes, delta);
    }

    changes.index_changed = true;
    Ok(changes)
}


fn add_state(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_dto: crate::core::model::StateDto,
) -> Result<WorkflowCommandChanges, String> {
    let state = State::from_dto(state_dto);
    if state.id.as_str().trim().is_empty() {
        return Err("State id must not be empty".to_string());
    }
    if state.scxml_id.trim().is_empty() {
        return Err("SCXML state id must not be empty".to_string());
    }
    if index.state_position(&state.id).is_some() {
        return Err(format!("State '{}' already exists", state.id));
    }

    if let Some(parent_id) = state.parent_id.as_ref() {
        index
            .state(workflow, parent_id)
            .ok_or_else(|| format!("Unknown parent state '{parent_id}'"))?;
    }

    let new_id = state.id.clone();
    let new_scxml_id = state.scxml_id.clone();
    let parent_id = state.parent_id.clone();
    let scope_needs_initial = if let Some(parent_id) = parent_id.as_ref() {
        index
            .state(workflow, parent_id)
            .is_some_and(|parent| {
                parent.kind == StateKind::Compound && parent.initial_child_id.is_none()
            })
    } else {
        workflow.initial_state_id.is_none()
    };
    let make_initial = state.is_initial || scope_needs_initial;
    let mut state = state;
    state.is_initial = make_initial;
    workflow.states.push(state);

    let mut changed = vec![new_id.as_str().to_string()];
    if make_initial {
        if let Some(parent_id) = parent_id.as_ref() {
            if let Some(parent_position) = index.state_position(parent_id) {
                workflow.states[parent_position].initial_child_id = Some(new_id.clone());
                workflow.states[parent_position].initial_child_scxml_id =
                    Some(new_scxml_id.clone());
                changed.push(parent_id.as_str().to_string());
            }
            let sibling_positions = index
                .children_of(Some(parent_id))
                .iter()
                .filter_map(|id| index.state_position(id))
                .collect::<Vec<_>>();
            for sibling_position in sibling_positions {
                let sibling = &mut workflow.states[sibling_position];
                sibling.is_initial = sibling.id == new_id;
                changed.push(sibling.id.as_str().to_string());
            }
        } else {
            workflow.initial_state_id = Some(new_id.clone());
            workflow.initial_scxml_state_id = Some(new_scxml_id);
            let root_positions = index
                .children_of(None)
                .iter()
                .filter_map(|id| index.state_position(id))
                .collect::<Vec<_>>();
            for root_position in root_positions {
                let root = &mut workflow.states[root_position];
                root.is_initial = root.id == new_id;
                changed.push(root.id.as_str().to_string());
            }
        }
    }

    changed.sort();
    changed.dedup();
    Ok(WorkflowCommandChanges {
        changed_state_ids: changed,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

fn remove_states(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_ids: Vec<String>,
) -> Result<WorkflowCommandChanges, String> {
    let requested = state_ids
        .into_iter()
        .map(StateId::from)
        .filter(|id| index.state_position(id).is_some())
        .collect::<HashSet<_>>();
    if requested.is_empty() {
        return Ok(WorkflowCommandChanges::default());
    }

    // Expand the deletion set through the cached parent->children index rather
    // than repeatedly rescanning every state until no more descendants appear.
    let mut removed = requested;
    let mut pending = removed.iter().cloned().collect::<VecDeque<_>>();
    while let Some(parent_id) = pending.pop_front() {
        for child_id in index.children_of(Some(&parent_id)) {
            if removed.insert(child_id.clone()) {
                pending.push_back(child_id.clone());
            }
        }
    }

    let removed_state_info = removed
        .iter()
        .filter_map(|id| index.state(workflow, id))
        .map(|state| {
            let mut ancestors = HashSet::new();
            let mut current = index.parent_of(workflow, &state.id);
            while let Some(parent_id) = current {
                if !ancestors.insert(parent_id.clone()) {
                    break;
                }
                current = index.parent_of(workflow, parent_id);
            }
            (state.scxml_id.clone(), ancestors)
        })
        .collect::<Vec<_>>();
    let removed_scxml_ids = removed
        .iter()
        .filter_map(|id| index.state(workflow, id))
        .map(|state| state.scxml_id.clone())
        .collect::<HashSet<_>>();

    let provenance_removed_transition_ids = workflow
        .transitions
        .iter()
        .filter(|transition| {
            !transition.logical_sources.is_empty()
                && transition
                    .logical_sources
                    .iter()
                    .all(|source| removed.contains(&source.state_id))
        })
        .map(|transition| transition.id.clone())
        .collect::<HashSet<_>>();

    // One SCXML boundary transition can represent equivalent exits from more
    // than one logical child. Removing one child must keep the transition as
    // long as another logical source still exists. Keep track of retained
    // transitions whose provenance changed so the canonical patch updates the
    // frontend as well.
    let mut provenance_changed_transition_ids = Vec::new();
    for transition in workflow.transitions.iter_mut() {
        let source_count_before = transition.logical_sources.len();
        transition
            .logical_sources
            .retain(|source| !removed.contains(&source.state_id));
        if !transition.logical_sources.is_empty()
            && transition.logical_sources.len() != source_count_before
        {
            provenance_changed_transition_ids.push(transition.id.as_str().to_string());
        }
    }

    let mut removed_transition_ids = Vec::new();
    workflow.transitions.retain(|transition| {
        let direct = removed.contains(&transition.source_state_id)
            || transition
                .target_state_id
                .as_ref()
                .is_some_and(|target| removed.contains(target))
            || provenance_removed_transition_ids.contains(&transition.id);

        // Compatibility for parsed/legacy snapshots that do not carry editor
        // transition provenance yet. Editor-exported transitions use the
        // explicit logical source list above.
        let hoisted = !direct
            && transition.logical_sources.is_empty()
            && removed_state_info.iter().any(|(scxml_id, ancestors)| {
                !scxml_id.is_empty()
                    && transition.event.starts_with(&format!("{scxml_id}."))
                    && ancestors.contains(&transition.source_state_id)
            });

        if direct || hoisted {
            removed_transition_ids.push(transition.id.as_str().to_string());
            false
        } else {
            true
        }
    });

    for state in workflow.states.iter_mut() {
        if removed.contains(&state.id) {
            continue;
        }
        let state_id = state.id.clone();
        state.editor.edge_targets.retain(|route| {
            let targets_removed_state =
                removed_scxml_ids.contains(&route.target_scxml_id);
            let originates_from_removed_child = removed_state_info.iter().any(
                |(scxml_id, ancestors)| {
                    !scxml_id.is_empty()
                        && route.event.starts_with(&format!("{scxml_id}."))
                        && ancestors.contains(&state_id)
                },
            );
            !targets_removed_state && !originates_from_removed_child
        });
    }

    // Normal slot declarations point at the owning state's SCXML id. Clean
    // those eagerly for incremental deletions. Inherited-slot ownership is
    // still rebuilt through the full-sync fallback used by the frontend when
    // deleting a slot-bearing state.
    let slot_declaration_count_before = workflow.slot_declarations.len();
    workflow
        .slot_declarations
        .retain(|slot| !removed_scxml_ids.contains(&slot.state));
    let slot_declarations_changed =
        workflow.slot_declarations.len() != slot_declaration_count_before;

    workflow.states.retain(|state| !removed.contains(&state.id));

    if workflow
        .initial_state_id
        .as_ref()
        .is_some_and(|id| removed.contains(id))
    {
        let next_root = workflow
            .states
            .iter()
            .find(|state| state.parent_id.is_none())
            .map(|state| (state.id.clone(), state.scxml_id.clone()));
        workflow.initial_state_id = next_root.as_ref().map(|(id, _)| id.clone());
        workflow.initial_scxml_state_id = next_root.map(|(_, scxml_id)| scxml_id);
    }

    let remaining_ids = workflow
        .states
        .iter()
        .map(|state| state.id.clone())
        .collect::<HashSet<_>>();
    let first_child_by_parent = workflow
        .states
        .iter()
        .filter_map(|state| {
            state
                .parent_id
                .as_ref()
                .map(|parent_id| (parent_id.clone(), (state.id.clone(), state.scxml_id.clone())))
        })
        .fold(HashMap::new(), |mut acc, (parent_id, child)| {
            acc.entry(parent_id).or_insert(child);
            acc
        });
    let mut parent_initial_updates = Vec::new();
    for parent in workflow.states.iter_mut() {
        let invalid_initial = parent
            .initial_child_id
            .as_ref()
            .is_some_and(|id| !remaining_ids.contains(id));
        if !invalid_initial {
            continue;
        }

        let replacement = first_child_by_parent.get(&parent.id).cloned();
        parent.initial_child_id = replacement.as_ref().map(|(id, _)| id.clone());
        parent.initial_child_scxml_id = replacement.map(|(_, scxml_id)| scxml_id);
        parent_initial_updates.push(parent.id.clone());
    }

    let root_initial = workflow.initial_state_id.clone();
    let parent_initials = workflow
        .states
        .iter()
        .filter_map(|state| {
            state
                .initial_child_id
                .as_ref()
                .map(|child_id| (state.id.clone(), child_id.clone()))
        })
        .collect::<Vec<_>>();
    for state in workflow.states.iter_mut() {
        let should_be_initial = if let Some(parent_id) = state.parent_id.as_ref() {
            parent_initials
                .iter()
                .any(|(candidate_parent, child_id)| candidate_parent == parent_id && child_id == &state.id)
        } else {
            root_initial.as_ref() == Some(&state.id)
        };
        state.is_initial = should_be_initial;
    }

    let mut changed_state_ids = removed
        .iter()
        .map(|id| id.as_str().to_string())
        .collect::<Vec<_>>();
    changed_state_ids.extend(
        parent_initial_updates
            .into_iter()
            .map(|id| id.as_str().to_string()),
    );
    changed_state_ids.sort();
    changed_state_ids.dedup();
    provenance_changed_transition_ids.extend(removed_transition_ids);
    provenance_changed_transition_ids.sort();
    provenance_changed_transition_ids.dedup();

    Ok(WorkflowCommandChanges {
        changed_state_ids,
        changed_transition_ids: provenance_changed_transition_ids,
        slot_declarations_changed,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

fn update_state_editor_position(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    x: f64,
    y: f64,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;
    update_editor_position(&mut workflow.states[position], x, y);

    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        omit_state_patch: true,
        ..WorkflowCommandChanges::default()
    })
}

fn replace_state_editor_positions(
    workflow: &mut Workflow,
    index: &WorkflowIndex,
    state_id: String,
    positions: Vec<crate::core::model::EditorPositionDto>,
) -> Result<WorkflowCommandChanges, String> {
    let id = StateId::from(state_id);
    let state_position = index
        .state_position(&id)
        .ok_or_else(|| format!("Unknown state '{id}'"))?;

    let next_positions = positions
        .into_iter()
        .map(|position| EditorPosition {
            x: position.x,
            y: position.y,
            instance_id: position.instance_id,
            clone_type: position.clone_type,
        })
        .collect::<Vec<_>>();

    let primary = next_positions
        .iter()
        .find(|position| position.clone_type.is_none())
        .or_else(|| next_positions.first())
        .cloned();

    let editor = &mut workflow.states[state_position].editor;
    if let Some(primary) = primary {
        editor.x = primary.x;
        editor.y = primary.y;
    }
    editor.positions = next_positions;

    Ok(WorkflowCommandChanges {
        changed_state_ids: vec![id.as_str().to_string()],
        omit_state_patch: true,
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

    // Work transactionally because recalculating logical transition ownership
    // can discover invalid parent/provenance combinations. The frontend sends a
    // logical source; Rust owns where that transition is serialized in SCXML.
    let mut candidate = workflow.clone();
    let mut changed_transition_ids = Vec::new();
    let mut retained = Vec::with_capacity(candidate.transitions.len());

    for mut existing in candidate.transitions.drain(..) {
        // Targetless behavior exits/sent events are not represented by editor
        // transition edges and must survive targeted transition replacement.
        if existing.target_state_id.is_none() {
            retained.push(existing);
            continue;
        }

        let logical_source_match = existing
            .logical_sources
            .iter()
            .any(|logical| logical.state_id == source_id);
        let legacy_direct_match = existing.logical_sources.is_empty()
            && existing.source_state_id == source_id;

        if logical_source_match {
            changed_transition_ids.push(existing.id.as_str().to_string());
            existing
                .logical_sources
                .retain(|logical| logical.state_id != source_id);
            if !existing.logical_sources.is_empty() {
                retained.push(existing);
            }
            continue;
        }

        if legacy_direct_match {
            changed_transition_ids.push(existing.id.as_str().to_string());
            continue;
        }

        retained.push(existing);
    }
    candidate.transitions = retained;

    let preserved_ids = candidate
        .transitions
        .iter()
        .map(|transition| transition.id.clone())
        .collect::<HashSet<_>>();
    let candidate_index = WorkflowIndex::new(&candidate);
    let mut seen_ids = HashSet::new();

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
        let target_scxml_id = candidate_index
            .state(&candidate, &target_id)
            .ok_or_else(|| format!("Unknown transition target state '{target_id}'"))?
            .scxml_id
            .clone();
        let raw_event = transition.event.trim().to_string();
        let source_handle = if transition.source_handle.trim().is_empty() {
            raw_event
                .rsplit_once('.')
                .map(|(_, handle)| handle)
                .unwrap_or(raw_event.as_str())
                .to_string()
        } else {
            transition.source_handle.trim().to_string()
        };

        candidate.transitions.push(Transition {
            id: transition_id.clone(),
            // Start at the logical source. recalculate_transition_owners() will
            // hoist this to the correct Compound/Parallel SCXML owner.
            source_state_id: source_id.clone(),
            target_state_id: Some(target_id),
            target_scxml_id,
            logical_sources: vec![TransitionSource {
                state_id: source_id.clone(),
                handle: source_handle.clone(),
            }],
            event: if raw_event.is_empty() {
                source_handle
            } else {
                raw_event
            },
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
        changed_transition_ids.push(transition_id.as_str().to_string());
    }

    changed_transition_ids.extend(recalculate_transition_owners(&mut candidate)?);
    changed_transition_ids.sort();
    changed_transition_ids.dedup();
    *workflow = candidate;

    Ok(WorkflowCommandChanges {
        changed_transition_ids,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

#[cfg(test)]
mod tests {
    use crate::core::document::{WorkflowCommandDto, WorkflowDocumentStore};
    use crate::core::model::Workflow;
    use crate::core::scxml::{parse_scxml, serialize_scxml};

    #[test]
    fn slot_snapshot_retains_reopened_resources_without_changing_document_metadata() {
        let original = parse_scxml(
            r##"<scxml initial="Root" name="Parent">
            <datamodel><data id="count" type="integer" expr="0"/>
                <data id="#_SLOTS"><slots><slot xpath="/manual"/></slots></data>
            </datamodel>
            <state id="Root" initial="Child">
                <metadata><editor:position instance="root" x="10.5" y="20"/>
                    <editor:position instance="copy" clone="reference" x="-4" y="6"/>
                </metadata>
                <datamodel><data id="text" type="String" expr="'keep'"/></datamodel>
                <onentry><assign location="count" expr="1"/></onentry>
                <transition event="Child.success" target="End" cond="count &gt; 0"/>
                <state id="Child" src="${BEH}/child.xml">
                    <metadata><editor:position x="80" y="90"/></metadata>
                </state>
            </state><final id="End"/>
        </scxml>"##,
        )
        .unwrap();
        let original_dto = original.to_dto();
        let store = WorkflowDocumentStore::default();
        store.replace(original).unwrap();
        let command = serde_json::from_value(serde_json::json!({
            "type": "replaceSlotsSnapshot",
            "states": [{"stateId": "state-1", "stateName": "Root",
                        "inputSlots": [{"key": "Model", "path": "/manual", "typeName": "Object"}],
                        "outputSlots": [{"key": "Own", "path": "/local", "inherited": true,
                                         "inheritedState": "Ancestor", "inheritedXpath": "/outer"}]}],
            "extraSlotDeclarations": [
                {"xpath": "/manual"},
                {"xpath": "needed"},
                {"key": "", "state": "", "xpath": " /needed "},
                {"xpath": "/"},
                {"key": "Detached", "xpath": "/key-only"},
                {"state": "Root", "xpath": "/state-only"},
                {"key": "Model", "state": "Root", "xpath": "/manual"},
                {"key": "Own", "state": "Ancestor", "xpath": "/outer", "inherited": true},
                {"key": "Invalid", "state": "Root", "xpath": " "},
                {"xpath": ""},
                {"xpath": "/invalid-inherit", "inherited": true}
            ]
        })).unwrap();
        let result = store.apply(Some(1), command).unwrap();
        let declarations = serde_json::json!([
            {"key": "Model", "state": "Root", "xpath": "/manual", "inherited": false},
            {"key": "Own", "state": "Ancestor", "xpath": "/outer", "inherited": true},
            {"key": "", "state": "", "xpath": "/manual", "inherited": false},
            {"key": "", "state": "", "xpath": "/needed", "inherited": false},
            {"key": "", "state": "", "xpath": "/", "inherited": false},
            {"key": "Detached", "state": "", "xpath": "/key-only", "inherited": false},
            {"key": "", "state": "Root", "xpath": "/state-only", "inherited": false}
        ]);
        assert_eq!(result.revision, 2);
        assert_eq!(
            serde_json::to_value(result.patch.slot_declarations.unwrap()).unwrap(),
            declarations
        );
        let snapshot = store.snapshot().unwrap().unwrap();
        assert_eq!(snapshot.revision, 2);
        assert_eq!(
            serde_json::to_value(&snapshot.workflow.slot_declarations).unwrap(),
            declarations
        );
        assert_eq!(snapshot.workflow.states[0].input_slots[0].key, "Model");
        assert_eq!(
            snapshot.workflow.states[0].output_slots[0]
                .inherited
                .as_deref(),
            Some("/outer")
        );
        let mut expected_dto = original_dto;
        expected_dto.states[0].input_slots = snapshot.workflow.states[0].input_slots.clone();
        expected_dto.states[0].output_slots = snapshot.workflow.states[0].output_slots.clone();
        expected_dto.slot_declarations = snapshot.workflow.slot_declarations.clone();
        assert_eq!(
            serde_json::to_value(&snapshot.workflow).unwrap(),
            serde_json::to_value(expected_dto).unwrap()
        );

        let xml = serialize_scxml(&Workflow::from_dto(snapshot.workflow).unwrap()).unwrap();
        let reopened = parse_scxml(&xml).unwrap();
        assert_eq!(
            serde_json::to_value(reopened.to_dto().slot_declarations).unwrap(),
            declarations
        );
        store.replace(reopened).unwrap();
        let command: WorkflowCommandDto = serde_json::from_value(serde_json::json!({
            "type": "replaceSlotsSnapshot", "extraSlotDeclarations": declarations
        }))
        .unwrap();
        let result = store.apply(Some(3), command).unwrap();
        assert_eq!(result.revision, 4);
        assert_eq!(
            serde_json::to_value(result.patch.slot_declarations.unwrap()).unwrap(),
            declarations
        );
        let after = store.snapshot().unwrap().unwrap();
        assert_eq!(
            serialize_scxml(&Workflow::from_dto(after.workflow).unwrap()).unwrap(),
            xml
        );
    }
}
