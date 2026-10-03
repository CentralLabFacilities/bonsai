#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationRequestDto {
    #[serde(default)]
    pub nodes: Vec<ValidationNodeDto>,
    #[serde(default)]
    pub edges: Vec<ValidationEdgeDto>,
    #[serde(default)]
    pub global_data_model: Vec<ValidationVariableDto>,
    #[serde(default)]
    pub available_data_model: Vec<ValidationVariableDto>,
    #[serde(default)]
    pub behavior_directory_keys: Vec<String>,
    #[serde(default)]
    pub is_behavior_workflow: bool,
    #[serde(default)]
    pub inherited_slot_paths: Vec<String>,
    #[serde(default)]
    pub ancestor_writer_slot_paths: Vec<String>,
}


#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActiveValidationRequestDto {
    #[serde(default)]
    pub available_data_model: Vec<ValidationVariableDto>,
    #[serde(default)]
    pub behavior_directory_keys: Vec<String>,
    #[serde(default)]
    pub is_behavior_workflow: bool,
    #[serde(default)]
    pub ancestor_writer_slot_paths: Vec<String>,
    #[serde(default)]
    pub node_overlays: Vec<ValidationNodeOverlayDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationNodeOverlayDto {
    pub id: String,
    #[serde(default)]
    pub is_collapsed: bool,
    #[serde(default)]
    pub is_behavior_exit: bool,
    #[serde(default)]
    pub events: Vec<ValidationEventDto>,
    #[serde(default)]
    pub parameters: Vec<ValidationParameterDto>,
    #[serde(default)]
    pub on_entry: Vec<ValidationAssignmentDto>,
    #[serde(default)]
    pub on_exit: Vec<ValidationAssignmentDto>,
    #[serde(default)]
    pub has_local_data_model: bool,
    #[serde(default)]
    pub local_data_model: Vec<ValidationVariableDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationNodeDto {
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
    pub is_behavior_exit: bool,
    #[serde(default)]
    pub is_collapsed: bool,
    #[serde(default)]
    pub is_reference: bool,
    #[serde(default)]
    pub events: Vec<ValidationEventDto>,
    #[serde(default)]
    pub parameters: Vec<ValidationParameterDto>,
    #[serde(default)]
    pub on_entry: Vec<ValidationAssignmentDto>,
    #[serde(default)]
    pub on_exit: Vec<ValidationAssignmentDto>,
    #[serde(default)]
    pub input_slots: Vec<ValidationSlotDto>,
    #[serde(default)]
    pub output_slots: Vec<ValidationSlotDto>,
    #[serde(default)]
    pub has_local_data_model: bool,
    #[serde(default)]
    pub local_data_model: Vec<ValidationVariableDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationEventDto {
    pub id: String,
    #[serde(default)]
    pub synthetic: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationParameterDto {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: String,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationAssignmentDto {
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationSlotDto {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationVariableDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub expression: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ValidationEdgeDto {
    pub id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub event: String,
    #[serde(default)]
    pub source_handle: String,
    #[serde(default)]
    pub semantic_source: String,
    #[serde(default)]
    pub assignments: Vec<ValidationAssignmentDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorProblemDto {
    pub id: String,
    pub severity: String,
    pub category: String,
    pub title: String,
    pub message: String,
    #[serde(default)]
    pub node_id: Option<String>,
    #[serde(default)]
    pub edge_id: Option<String>,
    #[serde(default)]
    pub detail_tab: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub focus_node_ids: Vec<String>,
    #[serde(default)]
    pub slot_path: Option<String>,
}
