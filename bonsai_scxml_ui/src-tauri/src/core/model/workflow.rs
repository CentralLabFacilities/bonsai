//! Serializable semantic workflow model shared by the Rust editor core and the
//! frontend boundary.
//!
//! This intentionally does not contain React Flow details (callbacks, handles,
//! marker types, selection state, etc.). Those belong to the frontend view
//! model and will be projected from this semantic representation.

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowDto {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub initial_state_id: Option<String>,
    #[serde(default)]
    pub states: Vec<StateDto>,
    #[serde(default)]
    pub transitions: Vec<TransitionDto>,
    #[serde(default)]
    pub data_model: Vec<DataModelEntryDto>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StateDto {
    pub id: String,
    #[serde(default)]
    pub label: String,
    pub kind: StateKindDto,
    #[serde(default)]
    pub full_skill_name: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub initial_child_id: Option<String>,
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

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
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
    pub source_state_id: String,
    #[serde(default)]
    pub event: String,
    pub target_state_id: String,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub assignments: Vec<AssignmentDto>,
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
