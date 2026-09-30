#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransitionAnalysisRequestDto {
    #[serde(default)]
    pub selected_container_id: Option<String>,
    #[serde(default)]
    pub nodes: Vec<TransitionNodeDto>,
    #[serde(default)]
    pub edges: Vec<TransitionEdgeDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransitionNodeDto {
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
    pub editor_instance_id: String,
    #[serde(default)]
    pub container_transition_order: Vec<String>,
    #[serde(default)]
    pub events: Vec<TransitionEventDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransitionEventDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub source_node_id: String,
    #[serde(default)]
    pub transition_handle_id: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub raw_event: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransitionEdgeDto {
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
    pub boundary_original_source: String,
    #[serde(default)]
    pub compound_original_source: String,
    #[serde(default)]
    pub parallel_original_source: String,
    #[serde(default)]
    pub boundary_original_source_handle: String,
    #[serde(default)]
    pub compound_original_source_handle: String,
    #[serde(default)]
    pub parallel_original_source_handle: String,
    #[serde(default)]
    pub boundary_original_target: String,
    #[serde(default)]
    pub compound_original_target: String,
    #[serde(default)]
    pub parallel_original_target: String,
    #[serde(default)]
    pub boundary_imported_raw_event: String,
    #[serde(default)]
    pub boundary_internal_edge: bool,
    #[serde(default)]
    pub compound_internal_edge: bool,
    #[serde(default)]
    pub parallel_internal_edge: bool,
    #[serde(default)]
    pub compound_initial_edge: bool,
    #[serde(default)]
    pub parallel_entry_edge: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContainerOutgoingTransitionDto {
    pub edge_id: String,
    pub source_node_id: String,
    pub source_display_name: String,
    pub event_id: String,
    pub event_display_name: String,
    pub target_node_id: String,
    pub target_display_name: String,
}
