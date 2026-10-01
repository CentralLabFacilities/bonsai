use std::collections::{HashMap, HashSet};

use crate::core::model::{
    EditorPosition, State, StateId, StateKind, Transition, TransitionId, TransitionSource, Workflow,
};

use super::commands::WorkflowCommandChanges;
use super::reparent::{normalize_initial_scope, recalculate_transition_owners};
use super::types::{
    PasteEditorIdMappingDto, PasteEditorPositionDto, PasteEditorTransitionMappingDto,
};

fn allocate_skill_name(
    source: &State,
    used_names: &mut HashSet<String>,
    preserve_base: bool,
) -> (Option<String>, String) {
    let Some(current) = source
        .full_skill_name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    else {
        return (source.full_skill_name.clone(), source.scxml_id.clone());
    };

    if !matches!(source.kind, StateKind::Skill | StateKind::Final) {
        return (Some(current.to_string()), source.scxml_id.clone());
    }

    let base = current.split('#').next().unwrap_or(current).to_string();
    if preserve_base || source.kind == StateKind::Final {
        used_names.insert(base.clone());
        return (Some(base.clone()), base);
    }

    let mut index = 1_u32;
    loop {
        let candidate = format!("{base}#{index}");
        if used_names.insert(candidate.clone()) {
            return (Some(candidate.clone()), candidate);
        }
        index += 1;
    }
}

fn is_forwarding_exit(workflow: &Workflow, source_id: &StateId) -> bool {
    workflow.transitions.iter().any(|transition| {
        !transition.sent_events.is_empty()
            && (transition.source_state_id == *source_id
                || transition
                    .logical_sources
                    .iter()
                    .any(|source| source.state_id == *source_id))
    })
}

fn update_pasted_editor_position(state: &mut State, position: Option<&PasteEditorPositionDto>) {
    let Some(position) = position else {
        state.editor.edge_targets.clear();
        state.editor.reference_of = None;
        state.editor.reference_id = None;
        return;
    };

    state.editor.x = position.x;
    state.editor.y = position.y;
    state.editor.edge_targets.clear();
    state.editor.reference_of = None;
    state.editor.reference_id = None;
    state.editor.positions = vec![EditorPosition {
        x: position.x,
        y: position.y,
        instance_id: None,
        clone_type: None,
    }];
}

fn next_generated_transition_id(
    used_transition_ids: &mut HashSet<String>,
    seed: &str,
) -> TransitionId {
    let base = format!("paste-{seed}");
    if used_transition_ids.insert(base.clone()) {
        return TransitionId::from(base);
    }

    let mut index = 1_u32;
    loop {
        let candidate = format!("{base}-{index}");
        if used_transition_ids.insert(candidate.clone()) {
            return TransitionId::from(candidate);
        }
        index += 1;
    }
}

pub(super) fn paste_editor_subgraph(
    workflow: &mut Workflow,
    state_mappings: Vec<PasteEditorIdMappingDto>,
    transition_mappings: Vec<PasteEditorTransitionMappingDto>,
    positions: Vec<PasteEditorPositionDto>,
) -> Result<WorkflowCommandChanges, String> {
    let original = workflow.clone();
    let original_states = original
        .states
        .iter()
        .map(|state| (state.id.clone(), state))
        .collect::<HashMap<_, _>>();

    let mut state_id_map = HashMap::<StateId, StateId>::new();
    let mut target_state_ids = HashSet::<String>::new();
    for mapping in state_mappings {
        let source_id = StateId::from(mapping.source_id.as_str());
        // Visual Parallel-lane helpers and editor references do not necessarily
        // exist as semantic states. Ignore them here; React keeps those purely
        // visual nodes in the pasted projection.
        if !original_states.contains_key(&source_id) {
            continue;
        }
        let target = mapping.target_id.trim();
        if target.is_empty() {
            return Err("Pasted state id cannot be empty".into());
        }
        if original.states.iter().any(|state| state.id == target)
            || !target_state_ids.insert(target.to_string())
        {
            return Err(format!("Pasted state id '{target}' already exists"));
        }
        state_id_map.insert(source_id, StateId::from(target));
    }

    if state_id_map.is_empty() {
        return Ok(WorkflowCommandChanges::default());
    }

    let transition_id_map = transition_mappings
        .into_iter()
        .filter(|mapping| !mapping.source_id.trim().is_empty() && !mapping.target_id.trim().is_empty())
        .map(|mapping| {
            (
                TransitionId::from(mapping.source_id),
                (TransitionId::from(mapping.target_id), mapping.target_instance_id),
            )
        })
        .collect::<HashMap<_, _>>();
    let position_by_id = positions
        .iter()
        .map(|position| (StateId::from(position.state_id.as_str()), position))
        .collect::<HashMap<_, _>>();

    let mut used_names = original
        .states
        .iter()
        .filter_map(|state| state.full_skill_name.clone())
        .filter(|value| !value.trim().is_empty())
        .collect::<HashSet<_>>();

    let mut cloned_states = Vec::new();
    for source in &original.states {
        let Some(target_id) = state_id_map.get(&source.id).cloned() else {
            continue;
        };

        let mut cloned = source.clone();
        cloned.id = target_id.clone();
        cloned.parent_id = source
            .parent_id
            .as_ref()
            .and_then(|parent_id| state_id_map.get(parent_id).cloned());
        cloned.initial_child_id = source
            .initial_child_id
            .as_ref()
            .and_then(|child_id| state_id_map.get(child_id).cloned());
        cloned.initial_child_scxml_id = None;
        cloned.is_initial = cloned.parent_id.is_some() && source.is_initial;

        let preserve_base = is_forwarding_exit(&original, &source.id);
        let (full_skill_name, scxml_id) =
            allocate_skill_name(source, &mut used_names, preserve_base);
        cloned.full_skill_name = full_skill_name;
        cloned.scxml_id = scxml_id;

        update_pasted_editor_position(&mut cloned, position_by_id.get(&target_id).copied());
        cloned_states.push(cloned);
    }

    let pasted_scxml_by_id = cloned_states
        .iter()
        .map(|state| (state.id.clone(), state.scxml_id.clone()))
        .collect::<HashMap<_, _>>();
    for state in &mut cloned_states {
        state.initial_child_scxml_id = state
            .initial_child_id
            .as_ref()
            .and_then(|child_id| pasted_scxml_by_id.get(child_id).cloned());
    }

    let mut used_transition_ids = original
        .transitions
        .iter()
        .map(|transition| transition.id.as_str().to_string())
        .collect::<HashSet<_>>();
    let mut cloned_transitions = Vec::new();

    for source_transition in &original.transitions {
        let logical_sources = if source_transition.logical_sources.is_empty() {
            vec![TransitionSource {
                state_id: source_transition.source_state_id.clone(),
                handle: source_transition.event.clone(),
            }]
        } else {
            source_transition.logical_sources.clone()
        };
        let pasted_logical_sources = logical_sources
            .into_iter()
            .filter_map(|source| {
                state_id_map.get(&source.state_id).cloned().map(|state_id| TransitionSource {
                    state_id,
                    handle: source.handle,
                })
            })
            .collect::<Vec<_>>();

        if pasted_logical_sources.is_empty() {
            continue;
        }

        let target_state_id = match source_transition.target_state_id.as_ref() {
            Some(target_id) => {
                let Some(mapped_target) = state_id_map.get(target_id).cloned() else {
                    // Normal copy/paste only retains transitions completely
                    // inside the selected subgraph.
                    continue;
                };
                Some(mapped_target)
            }
            None if !source_transition.sent_events.is_empty() => None,
            None => continue,
        };

        let mut cloned = source_transition.clone();
        let mapped_transition = transition_id_map.get(&source_transition.id);
        cloned.id = if let Some((mapped_id, _)) = mapped_transition {
            let raw = mapped_id.as_str().to_string();
            if original.transitions.iter().any(|transition| transition.id == raw.as_str())
                || !used_transition_ids.insert(raw.clone())
            {
                return Err(format!("Pasted transition id '{raw}' already exists"));
            }
            TransitionId::from(raw)
        } else {
            next_generated_transition_id(
                &mut used_transition_ids,
                source_transition.id.as_str(),
            )
        };
        cloned.logical_sources = pasted_logical_sources;
        cloned.target_state_id = target_state_id.clone();
        cloned.target_scxml_id = target_state_id
            .as_ref()
            .and_then(|target_id| cloned_states.iter().find(|state| state.id == *target_id))
            .map(|state| state.scxml_id.clone())
            .unwrap_or_default();
        cloned.target_instance_id = mapped_transition
            .and_then(|(_, instance_id)| instance_id.clone())
            .filter(|value| !value.trim().is_empty());

        // Ownership/event are recalculated after all cloned states have been
        // inserted, using the logical provenance retained above.
        cloned.source_state_id = cloned.logical_sources[0].state_id.clone();
        cloned_transitions.push(cloned);
    }

    let mut candidate = workflow.clone();
    let mut changed_state_ids = cloned_states
        .iter()
        .map(|state| state.id.as_str().to_string())
        .collect::<Vec<_>>();
    let mut changed_transition_ids = cloned_transitions
        .iter()
        .map(|transition| transition.id.as_str().to_string())
        .collect::<Vec<_>>();

    candidate.states.extend(cloned_states);
    candidate.transitions.extend(cloned_transitions);

    // Preserve nested initial choices from the copied subgraph while ensuring
    // pasted root states never steal an existing workflow initial state.
    let mut affected_parents = state_id_map
        .values()
        .filter_map(|id| {
            candidate
                .states
                .iter()
                .find(|state| state.id == *id)
                .and_then(|state| state.parent_id.clone())
        })
        .collect::<HashSet<_>>();
    for parent_id in affected_parents.drain() {
        changed_state_ids.extend(normalize_initial_scope(
            &mut candidate,
            Some(&parent_id),
            true,
        ));
    }
    changed_state_ids.extend(normalize_initial_scope(&mut candidate, None, true));
    changed_transition_ids.extend(recalculate_transition_owners(&mut candidate)?);

    changed_state_ids.sort();
    changed_state_ids.dedup();
    changed_transition_ids.sort();
    changed_transition_ids.dedup();
    *workflow = candidate;

    Ok(WorkflowCommandChanges {
        changed_state_ids,
        changed_transition_ids,
        index_changed: true,
        ..WorkflowCommandChanges::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::EditorMetadata;

    fn state(id: &str, name: &str, parent: Option<&str>, initial: bool) -> State {
        State {
            id: StateId::from(id),
            scxml_id: name.into(),
            label: name.into(),
            kind: StateKind::Skill,
            full_skill_name: Some(name.into()),
            source: None,
            parent_id: parent.map(StateId::from),
            initial_child_id: None,
            initial_child_scxml_id: None,
            is_initial: initial,
            is_final: false,
            events: Vec::new(),
            input_slots: Vec::new(),
            output_slots: Vec::new(),
            parameters: Vec::new(),
            on_entry: Vec::new(),
            on_exit: Vec::new(),
            editor: EditorMetadata::default(),
        }
    }

    #[test]
    fn clones_internal_transition_and_allocates_skill_instances() {
        let mut workflow = Workflow::default();
        workflow.states = vec![state("a", "skills.Talk", None, true), state("b", "skills.Listen", None, false)];
        workflow.initial_state_id = Some(StateId::from("a"));
        workflow.initial_scxml_state_id = Some("skills.Talk".into());
        workflow.transitions = vec![Transition {
            id: TransitionId::from("edge-a-b"),
            source_state_id: StateId::from("a"),
            target_state_id: Some(StateId::from("b")),
            target_scxml_id: "skills.Listen".into(),
            logical_sources: vec![TransitionSource { state_id: StateId::from("a"), handle: "success".into() }],
            event: "success".into(),
            condition: String::new(),
            assignments: Vec::new(),
            sent_events: Vec::new(),
            target_instance_id: None,
        }];

        let changes = paste_editor_subgraph(
            &mut workflow,
            vec![
                PasteEditorIdMappingDto { source_id: "a".into(), target_id: "a-copy".into() },
                PasteEditorIdMappingDto { source_id: "b".into(), target_id: "b-copy".into() },
            ],
            vec![PasteEditorTransitionMappingDto {
                source_id: "edge-a-b".into(),
                target_id: "edge-copy".into(),
                target_instance_id: None,
            }],
            vec![],
        ).unwrap();

        assert!(changes.changed_state_ids.contains(&"a-copy".to_string()));
        assert!(changes.changed_transition_ids.contains(&"edge-copy".to_string()));
        let copied_a = workflow.states.iter().find(|state| state.id == "a-copy").unwrap();
        assert_eq!(copied_a.full_skill_name.as_deref(), Some("skills.Talk#1"));
        assert!(!copied_a.is_initial);
        let copied_transition = workflow.transitions.iter().find(|transition| transition.id == "edge-copy").unwrap();
        assert_eq!(copied_transition.target_state_id.as_ref().map(StateId::as_str), Some("b-copy"));
        assert_eq!(copied_transition.logical_sources[0].state_id, "a-copy");
    }
}
