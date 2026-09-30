use std::collections::HashMap;

use crate::core::model::{
    AssignmentDto, DataModelEntryDto, EditorEdgeTargetDto, EditorMetadataDto,
    EditorPositionDto, ExitEventDto, ParameterDto, SlotDeclarationDto, StateDto,
    StateKindDto, TransitionDto, WorkflowDto,
};

use super::xml::{parse_document, XmlNode};

struct ParseContext {
    states: Vec<StateDto>,
    transitions: Vec<TransitionDto>,
    next_state_id: usize,
    next_transition_id: usize,
}

impl ParseContext {
    fn new() -> Self {
        Self {
            states: Vec::new(),
            transitions: Vec::new(),
            next_state_id: 1,
            next_transition_id: 1,
        }
    }

    fn create_state_id(&mut self) -> String {
        let id = format!("state-{}", self.next_state_id);
        self.next_state_id += 1;
        id
    }

    fn create_transition_id(&mut self) -> String {
        let id = format!("transition-{}", self.next_transition_id);
        self.next_transition_id += 1;
        id
    }
}

pub(crate) fn parse_scxml(xml: &str) -> Result<WorkflowDto, String> {
    let root = parse_document(xml)?;
    if root.local_name() != "scxml" {
        return Err("Kein <scxml>-Wurzelelement gefunden.".to_string());
    }

    let initial_scxml_state_id = non_empty(root.attr("initial"));
    let name = non_empty(root.attr("name")).or_else(|| non_empty(root.attr("id")));
    let (data_model, slot_declarations) = parse_root_datamodel(&root);
    let mut context = ParseContext::new();

    for child in &root.children {
        if is_state_element(child) {
            parse_state(
                child,
                None,
                false,
                initial_scxml_state_id.as_deref(),
                &mut context,
            )?;
        }
    }

    resolve_state_references(
        &mut context.states,
        &mut context.transitions,
        initial_scxml_state_id.as_deref(),
    );

    let initial_state_id = resolve_unique_state_id(
        &context.states,
        initial_scxml_state_id.as_deref().unwrap_or_default(),
    );

    Ok(WorkflowDto {
        name,
        initial_state_id,
        initial_scxml_state_id,
        states: context.states,
        transitions: context.transitions,
        data_model,
        slot_declarations,
    })
}

fn parse_state(
    element: &XmlNode,
    parent_id: Option<String>,
    as_parallel_lane: bool,
    parent_initial_scxml_id: Option<&str>,
    context: &mut ParseContext,
) -> Result<String, String> {
    let scxml_id = element
        .attr("id")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("<{}> is missing an id attribute", element.local_name()))?
        .to_string();

    let internal_id = context.create_state_id();
    let direct_state_children: Vec<&XmlNode> = element
        .children
        .iter()
        .filter(|child| is_state_element(child))
        .collect();
    let source = non_empty(element.attr("src"));
    let is_final = element.local_name() == "final"
        || element.attr("final") == Some("true")
        || is_named_final_state(&scxml_id);

    let kind = if as_parallel_lane {
        StateKindDto::ParallelLane
    } else if is_final {
        StateKindDto::Final
    } else if element.local_name() == "parallel" {
        StateKindDto::Parallel
    } else if source.is_some() {
        StateKindDto::Submachine
    } else if !direct_state_children.is_empty() {
        StateKindDto::Compound
    } else {
        StateKindDto::Skill
    };

    let initial_child_scxml_id = non_empty(element.attr("initial"));
    let parameters = parse_local_datamodel(element);
    let on_entry = parse_assignments_from_action(element, "onentry");
    let on_exit = parse_assignments_from_action(element, "onexit");
    let editor = parse_editor_metadata(element);
    let is_initial = parent_initial_scxml_id == Some(scxml_id.as_str());

    let mut events = Vec::new();
    for transition in element.direct_children("transition") {
        if let Some(event) = non_empty(transition.attr("event")) {
            if !events.iter().any(|existing: &ExitEventDto| existing.id == event) {
                events.push(ExitEventDto {
                    id: event,
                    description: String::new(),
                });
            }
        }
    }

    context.states.push(StateDto {
        id: internal_id.clone(),
        scxml_id: scxml_id.clone(),
        label: base_state_name(&scxml_id),
        kind,
        full_skill_name: match kind {
            StateKindDto::Skill | StateKindDto::Submachine | StateKindDto::Final => {
                Some(scxml_id.clone())
            }
            _ => Some(scxml_id.clone()),
        },
        source,
        parent_id: parent_id.clone(),
        initial_child_id: None,
        initial_child_scxml_id: initial_child_scxml_id.clone(),
        is_initial,
        is_final,
        events,
        input_slots: Vec::new(),
        output_slots: Vec::new(),
        parameters,
        on_entry,
        on_exit,
        editor,
    });

    for transition in element.direct_children("transition") {
        let Some(target_scxml_id) = non_empty(transition.attr("target")) else {
            continue;
        };
        let transition_id = context.create_transition_id();
        context.transitions.push(TransitionDto {
            id: transition_id,
            source_state_id: internal_id.clone(),
            target_state_id: None,
            target_scxml_id,
            event: transition.attr("event").unwrap_or_default().trim().to_string(),
            condition: transition.attr("cond").unwrap_or_default().trim().to_string(),
            assignments: parse_direct_assignments(transition),
            target_instance_id: None,
        });
    }

    let child_initial = initial_child_scxml_id.as_deref().or_else(|| {
        if matches!(kind, StateKindDto::ParallelLane) {
            direct_state_children
                .first()
                .and_then(|child| child.attr("id"))
        } else {
            None
        }
    });

    if element.local_name() == "parallel" {
        for child in direct_state_children {
            parse_state(
                child,
                Some(internal_id.clone()),
                true,
                None,
                context,
            )?;
        }
    } else {
        for child in direct_state_children {
            parse_state(
                child,
                Some(internal_id.clone()),
                false,
                child_initial,
                context,
            )?;
        }
    }

    Ok(internal_id)
}

fn parse_root_datamodel(root: &XmlNode) -> (Vec<DataModelEntryDto>, Vec<SlotDeclarationDto>) {
    let Some(datamodel) = root.first_direct_child("datamodel") else {
        return (Vec::new(), Vec::new());
    };

    let mut data_model = Vec::new();
    let mut slots = Vec::new();

    for data in datamodel.direct_children("data") {
        let Some(id) = non_empty(data.attr("id")) else {
            continue;
        };

        if id == "#_SLOTS" {
            collect_slot_declarations(data, &mut slots);
            continue;
        }

        data_model.push(DataModelEntryDto {
            id,
            type_name: non_empty(data.attr("type")),
            expression: data.attr("expr").unwrap_or_default().to_string(),
        });
    }

    (data_model, slots)
}

fn collect_slot_declarations(node: &XmlNode, output: &mut Vec<SlotDeclarationDto>) {
    for child in &node.children {
        if child.local_name() == "slot" || child.local_name() == "inheritSlot" {
            if let Some(key) = non_empty(child.attr("key")) {
                output.push(SlotDeclarationDto {
                    key,
                    state: child.attr("state").unwrap_or_default().trim().to_string(),
                    xpath: child.attr("xpath").unwrap_or_default().trim().to_string(),
                    inherited: child.local_name() == "inheritSlot",
                });
            }
        }
        collect_slot_declarations(child, output);
    }
}

fn parse_local_datamodel(state: &XmlNode) -> Vec<ParameterDto> {
    let Some(datamodel) = state.first_direct_child("datamodel") else {
        return Vec::new();
    };

    datamodel
        .direct_children("data")
        .filter_map(|data| {
            let key = non_empty(data.attr("id"))?;
            if key == "#_SLOTS" {
                return None;
            }
            Some(ParameterDto {
                key,
                type_name: data.attr("type").unwrap_or_default().trim().to_string(),
                required: false,
                default_value: None,
                description: String::new(),
                expression: data.attr("expr").unwrap_or_default().to_string(),
            })
        })
        .collect()
}

fn parse_assignments_from_action(state: &XmlNode, action_name: &str) -> Vec<AssignmentDto> {
    state
        .first_direct_child(action_name)
        .map(parse_direct_assignments)
        .unwrap_or_default()
}

fn parse_direct_assignments(node: &XmlNode) -> Vec<AssignmentDto> {
    node.direct_children("assign")
        .filter_map(|assign| {
            let location = non_empty(assign.attr("location"))?;
            Some(AssignmentDto {
                location,
                expression: assign.attr("expr").unwrap_or_default().to_string(),
            })
        })
        .collect()
}

fn parse_editor_metadata(state: &XmlNode) -> EditorMetadataDto {
    let Some(metadata) = state.first_direct_child("metadata") else {
        return EditorMetadataDto::default();
    };

    let positions: Vec<EditorPositionDto> = metadata
        .children
        .iter()
        .filter(|child| child.local_name() == "position")
        .map(|position| EditorPositionDto {
            x: parse_f64(position.attr("x")),
            y: parse_f64(position.attr("y")),
            instance_id: non_empty(position.attr("instance")),
            clone_type: non_empty(position.attr("clone")),
        })
        .collect();

    let edge_targets: Vec<EditorEdgeTargetDto> = metadata
        .children
        .iter()
        .filter(|child| child.local_name() == "edgeTarget")
        .filter_map(|route| {
            let event = non_empty(route.attr("event"))?;
            let target_scxml_id = non_empty(route.attr("target"))?;
            let target_instance_id = non_empty(route.attr("instance"))?;
            Some(EditorEdgeTargetDto {
                event,
                target_scxml_id,
                occurrence: route
                    .attr("occurrence")
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or_default(),
                target_instance_id,
            })
        })
        .collect();

    let primary = positions
        .iter()
        .find(|position| position.clone_type.is_none())
        .or_else(|| positions.first());

    EditorMetadataDto {
        x: primary.map(|position| position.x).unwrap_or_default(),
        y: primary.map(|position| position.y).unwrap_or_default(),
        positions,
        edge_targets,
        width: None,
        height: None,
        collapsed: false,
        reference_of: None,
        reference_id: None,
    }
}

fn resolve_state_references(
    states: &mut [StateDto],
    transitions: &mut [TransitionDto],
    root_initial_scxml_id: Option<&str>,
) {
    let by_scxml_id = build_scxml_id_index(states);

    let route_index: HashMap<(String, String, u32), String> = states
        .iter()
        .flat_map(|state| state.editor.edge_targets.iter())
        .map(|route| {
            (
                (
                    route.event.clone(),
                    route.target_scxml_id.clone(),
                    route.occurrence,
                ),
                route.target_instance_id.clone(),
            )
        })
        .collect();
    let mut transition_occurrences: HashMap<(String, String), u32> = HashMap::new();

    for transition in transitions {
        transition.target_state_id = resolve_from_index(&by_scxml_id, &transition.target_scxml_id);

        if !transition.event.is_empty() && !transition.target_scxml_id.is_empty() {
            let occurrence_key = (transition.event.clone(), transition.target_scxml_id.clone());
            let occurrence = transition_occurrences.entry(occurrence_key.clone()).or_default();
            transition.target_instance_id = route_index
                .get(&(occurrence_key.0, occurrence_key.1, *occurrence))
                .cloned();
            *occurrence += 1;
        }
    }

    let parent_initials: Vec<(String, Option<String>)> = states
        .iter()
        .map(|state| (state.id.clone(), state.initial_child_scxml_id.clone()))
        .collect();

    for (parent_id, initial_scxml_id) in parent_initials {
        let Some(initial_scxml_id) = initial_scxml_id else {
            continue;
        };
        let matching_children: Vec<String> = states
            .iter()
            .filter(|candidate| {
                candidate.parent_id.as_deref() == Some(parent_id.as_str())
                    && candidate.scxml_id == initial_scxml_id
            })
            .map(|candidate| candidate.id.clone())
            .collect();

        if matching_children.len() == 1 {
            if let Some(parent) = states.iter_mut().find(|state| state.id == parent_id) {
                parent.initial_child_id = matching_children.into_iter().next();
            }
        }
    }

    if let Some(root_initial) = root_initial_scxml_id {
        if let Some(root_internal_id) = resolve_from_index(&by_scxml_id, root_initial) {
            if let Some(state) = states.iter_mut().find(|state| state.id == root_internal_id) {
                state.is_initial = true;
            }
        }
    }
}

fn build_scxml_id_index(states: &[StateDto]) -> HashMap<String, Vec<String>> {
    let mut index: HashMap<String, Vec<String>> = HashMap::new();
    for state in states {
        index
            .entry(state.scxml_id.clone())
            .or_default()
            .push(state.id.clone());
    }
    index
}

fn resolve_unique_state_id(states: &[StateDto], scxml_id: &str) -> Option<String> {
    resolve_from_index(&build_scxml_id_index(states), scxml_id)
}

fn resolve_from_index(index: &HashMap<String, Vec<String>>, scxml_id: &str) -> Option<String> {
    let matches = index.get(scxml_id)?;
    if matches.len() == 1 {
        matches.first().cloned()
    } else {
        None
    }
}

fn is_state_element(node: &XmlNode) -> bool {
    matches!(node.local_name(), "state" | "parallel" | "final")
}

fn is_named_final_state(scxml_id: &str) -> bool {
    matches!(base_state_name(scxml_id).to_ascii_lowercase().as_str(), "end" | "fatal")
}

fn base_state_name(scxml_id: &str) -> String {
    scxml_id
        .split('#')
        .next()
        .unwrap_or(scxml_id)
        .rsplit('.')
        .next()
        .unwrap_or(scxml_id)
        .trim()
        .to_string()
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn parse_f64(value: Option<&str>) -> f64 {
    value
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or_default()
}
