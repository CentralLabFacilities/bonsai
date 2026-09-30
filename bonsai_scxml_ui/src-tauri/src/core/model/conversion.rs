use std::collections::HashSet;

use super::{
    Assignment, AssignmentDto, DataModelEntry, DataModelEntryDto, EditorEdgeTarget,
    EditorEdgeTargetDto, EditorMetadata, EditorMetadataDto, EditorPosition, EditorPositionDto,
    ExitEvent, ExitEventDto, Parameter, ParameterDto, Slot, SlotDeclaration, SlotDeclarationDto,
    SlotDto, State, StateId, StateKind, StateKindDto, Transition, TransitionDto, Workflow,
    WorkflowDto,
};

impl Workflow {
    pub(crate) fn from_dto(dto: WorkflowDto) -> Result<Self, String> {
        let mut seen_state_ids = HashSet::new();
        let mut states = Vec::with_capacity(dto.states.len());
        for state in dto.states {
            if !seen_state_ids.insert(state.id.clone()) {
                return Err(format!("Duplicate internal state id '{}'", state.id));
            }
            states.push(State::from_dto(state));
        }

        let mut seen_transition_ids = HashSet::new();
        let mut transitions = Vec::with_capacity(dto.transitions.len());
        for transition in dto.transitions {
            if !seen_transition_ids.insert(transition.id.clone()) {
                return Err(format!(
                    "Duplicate internal transition id '{}'",
                    transition.id
                ));
            }
            transitions.push(Transition::from_dto(transition));
        }

        Ok(Self {
            name: dto.name,
            initial_state_id: dto.initial_state_id.map(StateId::from),
            initial_scxml_state_id: dto.initial_scxml_state_id,
            states,
            transitions,
            data_model: dto
                .data_model
                .into_iter()
                .map(DataModelEntry::from_dto)
                .collect(),
            slot_declarations: dto
                .slot_declarations
                .into_iter()
                .map(SlotDeclaration::from_dto)
                .collect(),
        })
    }

    pub(crate) fn to_dto(&self) -> WorkflowDto {
        WorkflowDto {
            name: self.name.clone(),
            initial_state_id: self
                .initial_state_id
                .as_ref()
                .map(|id| id.as_str().to_string()),
            initial_scxml_state_id: self.initial_scxml_state_id.clone(),
            states: self.states.iter().map(State::to_dto).collect(),
            transitions: self.transitions.iter().map(Transition::to_dto).collect(),
            data_model: self
                .data_model
                .iter()
                .map(DataModelEntry::to_dto)
                .collect(),
            slot_declarations: self
                .slot_declarations
                .iter()
                .map(SlotDeclaration::to_dto)
                .collect(),
        }
    }
}

impl State {
    fn from_dto(dto: super::StateDto) -> Self {
        Self {
            id: dto.id.into(),
            scxml_id: dto.scxml_id,
            label: dto.label,
            kind: dto.kind.into(),
            full_skill_name: dto.full_skill_name,
            source: dto.source,
            parent_id: dto.parent_id.map(StateId::from),
            initial_child_id: dto.initial_child_id.map(StateId::from),
            initial_child_scxml_id: dto.initial_child_scxml_id,
            is_initial: dto.is_initial,
            is_final: dto.is_final,
            events: dto.events.into_iter().map(ExitEvent::from_dto).collect(),
            input_slots: dto.input_slots.into_iter().map(Slot::from_dto).collect(),
            output_slots: dto.output_slots.into_iter().map(Slot::from_dto).collect(),
            parameters: dto.parameters.into_iter().map(Parameter::from_dto).collect(),
            on_entry: dto.on_entry.into_iter().map(Assignment::from_dto).collect(),
            on_exit: dto.on_exit.into_iter().map(Assignment::from_dto).collect(),
            editor: EditorMetadata::from_dto(dto.editor),
        }
    }

    fn to_dto(&self) -> super::StateDto {
        super::StateDto {
            id: self.id.as_str().to_string(),
            scxml_id: self.scxml_id.clone(),
            label: self.label.clone(),
            kind: self.kind.into(),
            full_skill_name: self.full_skill_name.clone(),
            source: self.source.clone(),
            parent_id: self
                .parent_id
                .as_ref()
                .map(|id| id.as_str().to_string()),
            initial_child_id: self
                .initial_child_id
                .as_ref()
                .map(|id| id.as_str().to_string()),
            initial_child_scxml_id: self.initial_child_scxml_id.clone(),
            is_initial: self.is_initial,
            is_final: self.is_final,
            events: self.events.iter().map(ExitEvent::to_dto).collect(),
            input_slots: self.input_slots.iter().map(Slot::to_dto).collect(),
            output_slots: self.output_slots.iter().map(Slot::to_dto).collect(),
            parameters: self.parameters.iter().map(Parameter::to_dto).collect(),
            on_entry: self.on_entry.iter().map(Assignment::to_dto).collect(),
            on_exit: self.on_exit.iter().map(Assignment::to_dto).collect(),
            editor: self.editor.to_dto(),
        }
    }
}

impl From<StateKindDto> for StateKind {
    fn from(value: StateKindDto) -> Self {
        match value {
            StateKindDto::Skill => Self::Skill,
            StateKindDto::Compound => Self::Compound,
            StateKindDto::Parallel => Self::Parallel,
            StateKindDto::ParallelLane => Self::ParallelLane,
            StateKindDto::Submachine => Self::Submachine,
            StateKindDto::Final => Self::Final,
        }
    }
}

impl From<StateKind> for StateKindDto {
    fn from(value: StateKind) -> Self {
        match value {
            StateKind::Skill => Self::Skill,
            StateKind::Compound => Self::Compound,
            StateKind::Parallel => Self::Parallel,
            StateKind::ParallelLane => Self::ParallelLane,
            StateKind::Submachine => Self::Submachine,
            StateKind::Final => Self::Final,
        }
    }
}

impl Transition {
    fn from_dto(dto: TransitionDto) -> Self {
        Self {
            id: dto.id.into(),
            source_state_id: dto.source_state_id.into(),
            target_state_id: dto.target_state_id.map(StateId::from),
            target_scxml_id: dto.target_scxml_id,
            event: dto.event,
            condition: dto.condition,
            assignments: dto
                .assignments
                .into_iter()
                .map(Assignment::from_dto)
                .collect(),
            sent_events: dto.sent_events,
            target_instance_id: dto.target_instance_id,
        }
    }

    fn to_dto(&self) -> TransitionDto {
        TransitionDto {
            id: self.id.as_str().to_string(),
            source_state_id: self.source_state_id.as_str().to_string(),
            target_state_id: self
                .target_state_id
                .as_ref()
                .map(|id| id.as_str().to_string()),
            target_scxml_id: self.target_scxml_id.clone(),
            event: self.event.clone(),
            condition: self.condition.clone(),
            assignments: self.assignments.iter().map(Assignment::to_dto).collect(),
            sent_events: self.sent_events.clone(),
            target_instance_id: self.target_instance_id.clone(),
        }
    }
}

impl ExitEvent {
    fn from_dto(dto: ExitEventDto) -> Self {
        Self {
            id: dto.id,
            description: dto.description,
        }
    }

    fn to_dto(&self) -> ExitEventDto {
        ExitEventDto {
            id: self.id.clone(),
            description: self.description.clone(),
        }
    }
}

impl Slot {
    fn from_dto(dto: SlotDto) -> Self {
        Self {
            key: dto.key,
            type_name: dto.type_name,
            description: dto.description,
            path: dto.path,
            inherited: dto.inherited,
        }
    }

    fn to_dto(&self) -> SlotDto {
        SlotDto {
            key: self.key.clone(),
            type_name: self.type_name.clone(),
            description: self.description.clone(),
            path: self.path.clone(),
            inherited: self.inherited.clone(),
        }
    }
}

impl SlotDeclaration {
    fn from_dto(dto: SlotDeclarationDto) -> Self {
        Self {
            key: dto.key,
            state: dto.state,
            xpath: dto.xpath,
            inherited: dto.inherited,
        }
    }

    fn to_dto(&self) -> SlotDeclarationDto {
        SlotDeclarationDto {
            key: self.key.clone(),
            state: self.state.clone(),
            xpath: self.xpath.clone(),
            inherited: self.inherited,
        }
    }
}

impl Parameter {
    fn from_dto(dto: ParameterDto) -> Self {
        Self {
            key: dto.key,
            type_name: dto.type_name,
            required: dto.required,
            default_value: dto.default_value,
            description: dto.description,
            expression: dto.expression,
        }
    }

    fn to_dto(&self) -> ParameterDto {
        ParameterDto {
            key: self.key.clone(),
            type_name: self.type_name.clone(),
            required: self.required,
            default_value: self.default_value.clone(),
            description: self.description.clone(),
            expression: self.expression.clone(),
        }
    }
}

impl Assignment {
    fn from_dto(dto: AssignmentDto) -> Self {
        Self {
            location: dto.location,
            expression: dto.expression,
        }
    }

    fn to_dto(&self) -> AssignmentDto {
        AssignmentDto {
            location: self.location.clone(),
            expression: self.expression.clone(),
        }
    }
}

impl DataModelEntry {
    fn from_dto(dto: DataModelEntryDto) -> Self {
        Self {
            id: dto.id,
            type_name: dto.type_name,
            expression: dto.expression,
        }
    }

    pub(crate) fn to_dto(&self) -> DataModelEntryDto {
        DataModelEntryDto {
            id: self.id.clone(),
            type_name: self.type_name.clone(),
            expression: self.expression.clone(),
        }
    }
}

impl EditorMetadata {
    fn from_dto(dto: EditorMetadataDto) -> Self {
        Self {
            x: dto.x,
            y: dto.y,
            positions: dto
                .positions
                .into_iter()
                .map(EditorPosition::from_dto)
                .collect(),
            edge_targets: dto
                .edge_targets
                .into_iter()
                .map(EditorEdgeTarget::from_dto)
                .collect(),
            width: dto.width,
            height: dto.height,
            collapsed: dto.collapsed,
            reference_of: dto.reference_of,
            reference_id: dto.reference_id,
        }
    }

    fn to_dto(&self) -> EditorMetadataDto {
        EditorMetadataDto {
            x: self.x,
            y: self.y,
            positions: self.positions.iter().map(EditorPosition::to_dto).collect(),
            edge_targets: self
                .edge_targets
                .iter()
                .map(EditorEdgeTarget::to_dto)
                .collect(),
            width: self.width,
            height: self.height,
            collapsed: self.collapsed,
            reference_of: self.reference_of.clone(),
            reference_id: self.reference_id,
        }
    }
}

impl EditorPosition {
    fn from_dto(dto: EditorPositionDto) -> Self {
        Self {
            x: dto.x,
            y: dto.y,
            instance_id: dto.instance_id,
            clone_type: dto.clone_type,
        }
    }

    fn to_dto(&self) -> EditorPositionDto {
        EditorPositionDto {
            x: self.x,
            y: self.y,
            instance_id: self.instance_id.clone(),
            clone_type: self.clone_type.clone(),
        }
    }
}

impl EditorEdgeTarget {
    fn from_dto(dto: EditorEdgeTargetDto) -> Self {
        Self {
            event: dto.event,
            target_scxml_id: dto.target_scxml_id,
            occurrence: dto.occurrence,
            target_instance_id: dto.target_instance_id,
        }
    }

    fn to_dto(&self) -> EditorEdgeTargetDto {
        EditorEdgeTargetDto {
            event: self.event.clone(),
            target_scxml_id: self.target_scxml_id.clone(),
            occurrence: self.occurrence,
            target_instance_id: self.target_instance_id.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::{EditorMetadataDto, ExitEventDto, StateDto};

    #[test]
    fn workflow_dto_round_trip_preserves_transport_shape() {
        let dto = WorkflowDto {
            name: Some("Example".into()),
            initial_state_id: Some("state-1".into()),
            initial_scxml_state_id: Some("Talk".into()),
            states: vec![StateDto {
                id: "state-1".into(),
                scxml_id: "Talk".into(),
                label: "Talk".into(),
                kind: StateKindDto::Skill,
                full_skill_name: Some("speech.Talk".into()),
                source: None,
                parent_id: None,
                initial_child_id: None,
                initial_child_scxml_id: None,
                is_initial: true,
                is_final: false,
                events: vec![ExitEventDto {
                    id: "success".into(),
                    description: "done".into(),
                }],
                input_slots: vec![],
                output_slots: vec![],
                parameters: vec![],
                on_entry: vec![],
                on_exit: vec![],
                editor: EditorMetadataDto::default(),
            }],
            transitions: vec![],
            data_model: vec![DataModelEntryDto {
                id: "message".into(),
                type_name: Some("String".into()),
                expression: "'hello'".into(),
            }],
            slot_declarations: vec![],
        };

        let workflow = Workflow::from_dto(dto.clone()).unwrap();
        let round_trip = workflow.to_dto();

        assert_eq!(round_trip.name, dto.name);
        assert_eq!(round_trip.initial_state_id, dto.initial_state_id);
        assert_eq!(round_trip.states[0].id, dto.states[0].id);
        assert_eq!(round_trip.states[0].events[0].id, "success");
        assert_eq!(round_trip.data_model[0].expression, "'hello'");
    }

    #[test]
    fn rejects_duplicate_internal_state_ids() {
        let state = StateDto {
            id: "duplicate".into(),
            scxml_id: "One".into(),
            label: String::new(),
            kind: StateKindDto::Skill,
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
            editor: EditorMetadataDto::default(),
        };
        let mut second = state.clone();
        second.scxml_id = "Two".into();

        let dto = WorkflowDto {
            states: vec![state, second],
            ..WorkflowDto::default()
        };

        assert!(Workflow::from_dto(dto).is_err());
    }
}
