//! Serializable workflow DTOs used only at transport/conversion boundaries.
//!
//! These types intentionally mirror the camelCase payload consumed by the
//! frontend. Rust domain logic should prefer [`super::Workflow`] and the typed
//! ids from `domain.rs`, converting to/from these DTOs at Tauri or compatibility
//! boundaries.

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowDto {
    #[serde(default)]
    pub name: Option<String>,
    /// Resolved internal state id when the root `initial` target is unambiguous.
    #[serde(default)]
    pub initial_state_id: Option<String>,
    /// Original SCXML `initial` attribute. This is preserved even when the
    /// target cannot be resolved to one unique internal state id.
    #[serde(default)]
    pub initial_scxml_state_id: Option<String>,
    #[serde(default)]
    pub states: Vec<StateDto>,
    #[serde(default)]
    pub transitions: Vec<TransitionDto>,
    #[serde(default)]
    pub data_model: Vec<DataModelEntryDto>,
    #[serde(default)]
    pub slot_declarations: Vec<SlotDeclarationDto>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StateDto {
    /// Unique editor/core identity. Unlike an SCXML state id, this is guaranteed
    /// to be unique even for nested wrapper states that reuse the same id.
    pub id: String,
    /// Original SCXML `id` attribute.
    pub scxml_id: String,
    #[serde(default)]
    pub label: String,
    pub kind: StateKindDto,
    #[serde(default)]
    pub full_skill_name: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    /// Internal id of the semantic parent state.
    #[serde(default)]
    pub parent_id: Option<String>,
    /// Resolved internal id of the initial child when unambiguous.
    #[serde(default)]
    pub initial_child_id: Option<String>,
    /// Original SCXML `initial` attribute on this state.
    #[serde(default)]
    pub initial_child_scxml_id: Option<String>,
    #[serde(default)]
    pub is_initial: bool,
    #[serde(default)]
    pub is_final: bool,
    #[serde(default)]
    pub events: Vec<ExitEventDto>,
    #[serde(default)]
    pub input_slots: Vec<SlotDto>,
    #[serde(default)]
    pub output_slots: Vec<SlotDto>,
    #[serde(default)]
    pub parameters: Vec<ParameterDto>,
    #[serde(default)]
    pub on_entry: Vec<AssignmentDto>,
    #[serde(default)]
    pub on_exit: Vec<AssignmentDto>,
    #[serde(default)]
    pub editor: EditorMetadataDto,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum StateKindDto {
    Skill,
    Compound,
    Parallel,
    ParallelLane,
    Submachine,
    Final,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransitionDto {
    pub id: String,
    /// Unique internal source state id.
    pub source_state_id: String,
    /// Resolved unique internal target state id, if available.
    #[serde(default)]
    pub target_state_id: Option<String>,
    /// Original SCXML `target` attribute.
    pub target_scxml_id: String,
    /// Logical editor sources before SCXML container hoisting. A Compound
    /// transition such as `Talk.success` can still originate from the inner
    /// Talk state. Multiple sources are retained when one visual boundary
    /// transition represents equivalent exits from more than one state.
    #[serde(default)]
    pub logical_sources: Vec<TransitionSourceDto>,
    #[serde(default)]
    pub event: String,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub assignments: Vec<AssignmentDto>,
    /// Events emitted by targetless forwarding transitions (for example the
    /// Nop states used to expose behavior exits).
    #[serde(default)]
    pub sent_events: Vec<String>,
    /// Editor routing hint used when several visual instances represent the
    /// same SCXML target state.
    #[serde(default)]
    pub target_instance_id: Option<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransitionSourceDto {
    pub state_id: String,
    #[serde(default)]
    pub handle: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExitEventDto {
    pub id: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotDto {
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub inherited: Option<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotDeclarationDto {
    pub key: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub xpath: String,
    #[serde(default)]
    pub inherited: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ParameterDto {
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<String>,
    #[serde(default)]
    pub description: String,
    /// Raw SCXML expression from the local state datamodel.
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssignmentDto {
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataModelEntryDto {
    pub id: String,
    #[serde(default)]
    pub type_name: Option<String>,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorMetadataDto {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    /// All persisted editor positions, including visual clones/references.
    #[serde(default)]
    pub positions: Vec<EditorPositionDto>,
    /// Persisted target-instance routing hints.
    #[serde(default)]
    pub edge_targets: Vec<EditorEdgeTargetDto>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub reference_of: Option<String>,
    #[serde(default)]
    pub reference_id: Option<u32>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorPositionDto {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub instance_id: Option<String>,
    #[serde(default)]
    pub clone_type: Option<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorEdgeTargetDto {
    #[serde(default)]
    pub event: String,
    #[serde(default)]
    pub target_scxml_id: String,
    #[serde(default)]
    pub occurrence: u32,
    #[serde(default)]
    pub target_instance_id: String,
}
