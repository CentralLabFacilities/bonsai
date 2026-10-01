#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportRequestDto {
    #[serde(default)]
    pub nodes: Vec<EditorExportNodeDto>,
    #[serde(default)]
    pub edges: Vec<EditorExportEdgeDto>,
    #[serde(default)]
    pub data_model: Vec<EditorExportDataModelEntryDto>,
    #[serde(default)]
    pub extra_slot_declarations: Vec<EditorExportSlotDeclarationDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportNodeDto {
    pub id: String,
    #[serde(default)]
    pub node_type: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub full_skill_name: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub is_initial: bool,
    #[serde(default)]
    pub is_final: bool,
    #[serde(default)]
    pub initial_child_id: Option<String>,
    #[serde(default)]
    pub initial_sub_state: String,
    #[serde(default)]
    pub parameters: Vec<EditorExportParameterDto>,
    #[serde(default)]
    pub input_slots: Vec<EditorExportSlotDto>,
    #[serde(default)]
    pub output_slots: Vec<EditorExportSlotDto>,
    #[serde(default)]
    pub on_entry: Vec<EditorExportAssignmentDto>,
    #[serde(default)]
    pub on_exit: Vec<EditorExportAssignmentDto>,
    #[serde(default)]
    pub events: Vec<EditorExportEventDto>,
    #[serde(default)]
    pub is_behavior_exit: bool,
    #[serde(default)]
    pub behavior_exit_events: Vec<String>,
    #[serde(default)]
    pub behavior_exit_transitions: Vec<EditorBehaviorExitTransitionDto>,
    #[serde(default)]
    pub container_transition_order: Vec<String>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub editor_positions: Vec<EditorExportPositionDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportEdgeDto {
    pub id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub source_handle: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub assignments: Vec<EditorExportAssignmentDto>,
    #[serde(default)]
    pub imported_raw_event: String,
    #[serde(default)]
    pub editor_target_instance_id: String,
    /// Logical editor sources before Compound/Parallel boundary routing.
    #[serde(default)]
    pub logical_sources: Vec<EditorTransitionSourceDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorTransitionSourceDto {
    #[serde(default)]
    pub state_id: String,
    #[serde(default)]
    pub handle: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportEventDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub raw_event: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub assignments: Vec<EditorExportAssignmentDto>,
    #[serde(default)]
    pub source_node_id: String,
    #[serde(default)]
    pub transition_handle_id: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportAssignmentDto {
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportParameterDto {
    pub key: String,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportSlotDto {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub inherited_state: String,
    #[serde(default)]
    pub inherited_xpath: String,
    #[serde(default)]
    pub inherited: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportSlotDeclarationDto {
    #[serde(default)]
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
pub(crate) struct EditorBehaviorExitTransitionDto {
    #[serde(default)]
    pub trigger_event: String,
    #[serde(default)]
    pub send_events: Vec<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorExportPositionDto {
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
pub(crate) struct EditorExportDataModelEntryDto {
    pub id: String,
    #[serde(default)]
    pub expression: String,
}
