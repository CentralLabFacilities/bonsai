use super::{StateId, TransitionId};

#[derive(Debug, Clone, Default)]
pub(crate) struct Workflow {
    pub name: Option<String>,
    pub initial_state_id: Option<StateId>,
    pub initial_scxml_state_id: Option<String>,
    pub states: Vec<State>,
    pub transitions: Vec<Transition>,
    pub data_model: Vec<DataModelEntry>,
    pub slot_declarations: Vec<SlotDeclaration>,
}

#[derive(Debug, Clone)]
pub(crate) struct State {
    pub id: StateId,
    pub scxml_id: String,
    pub label: String,
    pub kind: StateKind,
    pub full_skill_name: Option<String>,
    pub source: Option<String>,
    pub parent_id: Option<StateId>,
    pub initial_child_id: Option<StateId>,
    pub initial_child_scxml_id: Option<String>,
    pub is_initial: bool,
    pub is_final: bool,
    pub events: Vec<ExitEvent>,
    pub input_slots: Vec<Slot>,
    pub output_slots: Vec<Slot>,
    pub parameters: Vec<Parameter>,
    pub on_entry: Vec<Assignment>,
    pub on_exit: Vec<Assignment>,
    pub editor: EditorMetadata,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StateKind {
    Skill,
    Compound,
    Parallel,
    ParallelLane,
    Submachine,
    Final,
}

#[derive(Debug, Clone)]
pub(crate) struct Transition {
    pub id: TransitionId,
    pub source_state_id: StateId,
    pub target_state_id: Option<StateId>,
    pub target_scxml_id: String,
    /// Editor provenance retained independently from the SCXML transition
    /// owner so structural commands can recalculate container hoisting.
    pub logical_sources: Vec<TransitionSource>,
    pub event: String,
    pub condition: String,
    pub assignments: Vec<Assignment>,
    pub sent_events: Vec<String>,
    pub target_instance_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TransitionSource {
    pub state_id: StateId,
    pub handle: String,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ExitEvent {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct Slot {
    pub key: String,
    pub type_name: String,
    pub description: String,
    pub path: String,
    pub inherited: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct SlotDeclaration {
    pub key: String,
    pub state: String,
    pub xpath: String,
    pub inherited: bool,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct Parameter {
    pub key: String,
    pub type_name: String,
    pub required: bool,
    pub default_value: Option<String>,
    pub description: String,
    pub expression: String,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct Assignment {
    pub location: String,
    pub expression: String,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct DataModelEntry {
    pub id: String,
    pub type_name: Option<String>,
    pub expression: String,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EditorMetadata {
    pub x: f64,
    pub y: f64,
    pub positions: Vec<EditorPosition>,
    pub edge_targets: Vec<EditorEdgeTarget>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub collapsed: bool,
    pub reference_of: Option<String>,
    pub reference_id: Option<u32>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EditorPosition {
    pub x: f64,
    pub y: f64,
    pub instance_id: Option<String>,
    pub clone_type: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EditorEdgeTarget {
    pub event: String,
    pub target_scxml_id: String,
    pub occurrence: u32,
    pub target_instance_id: String,
}
