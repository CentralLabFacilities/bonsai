use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeLogDto {
    #[serde(default)]
    pub steps: Vec<RuntimeStepDto>,
    #[serde(default)]
    pub first_entry: Option<RuntimeEntryDto>,
    #[serde(default)]
    pub slot_samples: Vec<RuntimeSlotSampleDto>,
    #[serde(default)]
    pub parameter_samples: Vec<RuntimeParameterSampleDto>,
    #[serde(default)]
    pub data_samples: Vec<RuntimeDataSampleDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeStepDto {
    pub timestamp: String,
    pub source: String,
    pub target: String,
    pub event: String,
    pub line: usize,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeEntryDto {
    pub timestamp: String,
    pub state: String,
    pub line: usize,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeSlotSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub operation: String,
    #[serde(default)]
    pub slot_key: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeParameterSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub expr: String,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeDataSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub expr: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayRequestDto {
    pub runtime_log: RuntimeLogDto,
    #[serde(default)]
    pub contexts: Vec<RuntimeReplayContextDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayContextDto {
    pub tab_id: String,
    #[serde(default)]
    pub parent_tab_id: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub suffix_parts: Vec<String>,
    #[serde(default)]
    pub nodes: Vec<RuntimeReplayNodeDto>,
    #[serde(default)]
    pub transition_edges: Vec<RuntimeReplayTransitionEdgeDto>,
    #[serde(default)]
    pub slot_edges: Vec<RuntimeReplaySlotEdgeDto>,
    #[serde(default)]
    pub global_data_model: Vec<RuntimeReplayDataModelEntryDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayNodeDto {
    pub id: String,
    #[serde(default)]
    pub node_type: String,
    #[serde(default)]
    pub names: Vec<String>,
    #[serde(default)]
    pub canonical: bool,
    #[serde(default)]
    pub in_slot_keys: Vec<String>,
    #[serde(default)]
    pub out_slot_keys: Vec<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayTransitionEdgeDto {
    pub id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub semantic_target_id: String,
    #[serde(default)]
    pub semantic_sources: Vec<RuntimeReplayTransitionSourceDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayTransitionSourceDto {
    #[serde(default)]
    pub source_id: String,
    #[serde(default)]
    pub source_handle: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplaySlotEdgeDto {
    pub id: String,
    #[serde(default)]
    pub skill_node_id: String,
    #[serde(default)]
    pub access: String,
    #[serde(default)]
    pub slot_index: Option<usize>,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayDataModelEntryDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub expr: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(untagged)]
pub(crate) enum RuntimeValueDto {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
}

impl Default for RuntimeValueDto {
    fn default() -> Self {
        Self::Null
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedRuntimeStepDto {
    pub timestamp: String,
    pub source: String,
    pub target: String,
    pub event: String,
    pub line: usize,
    pub index: usize,
    #[serde(default)]
    pub event_token: String,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub tab_title: String,
    #[serde(default)]
    pub local_source: String,
    #[serde(default)]
    pub local_target: String,
    #[serde(default)]
    pub matched_event_descriptor: Option<String>,
    #[serde(default)]
    pub edge_id: Option<String>,
    #[serde(default)]
    pub source_node_id: Option<String>,
    #[serde(default)]
    pub target_node_id: Option<String>,
    #[serde(default)]
    pub collapsed_into_sub_machine: bool,
    #[serde(default)]
    pub resolved: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeSlotBindingDto {
    pub edge_id: String,
    #[serde(default)]
    pub access: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedRuntimeSlotSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub operation: String,
    #[serde(default)]
    pub slot_key: String,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub node_id: Option<String>,
    #[serde(default)]
    pub local_state: String,
    #[serde(default)]
    pub bindings: Vec<RuntimeSlotBindingDto>,
    #[serde(default)]
    pub edge_ids: Vec<String>,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub resolved: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeSlotTimelineDto {
    #[serde(default)]
    pub snapshots: Vec<BTreeMap<String, BTreeMap<String, ResolvedRuntimeSlotSampleDto>>>,
    #[serde(default)]
    pub samples: Vec<ResolvedRuntimeSlotSampleDto>,
    #[serde(default)]
    pub unresolved_count: usize,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedRuntimeParameterSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub expr: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub node_id: Option<String>,
    #[serde(default)]
    pub local_state: String,
    #[serde(default)]
    pub resolved: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeParameterTimelineDto {
    #[serde(default)]
    pub snapshots: Vec<
        BTreeMap<
            String,
            BTreeMap<String, BTreeMap<String, ResolvedRuntimeParameterSampleDto>>,
        >,
    >,
    #[serde(default)]
    pub samples: Vec<ResolvedRuntimeParameterSampleDto>,
    #[serde(default)]
    pub unresolved_count: usize,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedRuntimeDataSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub expr: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub local_state: String,
    #[serde(default)]
    pub local_key: String,
    #[serde(default)]
    pub runtime_key: String,
    #[serde(default)]
    pub resolved: bool,
    #[serde(default)]
    pub known_variable: bool,
    #[serde(default)]
    pub evaluated: bool,
    #[serde(default)]
    pub value: RuntimeValueDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_value: Option<RuntimeValueDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evaluated_value: Option<RuntimeValueDto>,
    #[serde(default)]
    pub evaluation_error: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeChangesStepDto {
    pub step_index: usize,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub slot_writes: Vec<ResolvedRuntimeSlotSampleDto>,
    #[serde(default)]
    pub slot_reads: Vec<ResolvedRuntimeSlotSampleDto>,
    #[serde(default)]
    pub slot_accesses: Vec<ResolvedRuntimeSlotSampleDto>,
    #[serde(default)]
    pub parameters: Vec<ResolvedRuntimeParameterSampleDto>,
    #[serde(default)]
    pub variables: Vec<ResolvedRuntimeDataSampleDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeChangesTimelineDto {
    #[serde(default)]
    pub steps: Vec<RuntimeChangesStepDto>,
    #[serde(default)]
    pub data_samples: Vec<ResolvedRuntimeDataSampleDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeReplayCacheDto {
    #[serde(default)]
    pub resolved_steps: Vec<ResolvedRuntimeStepDto>,
    #[serde(default)]
    pub slot_timeline: RuntimeSlotTimelineDto,
    #[serde(default)]
    pub parameter_timeline: RuntimeParameterTimelineDto,
    #[serde(default)]
    pub changes_timeline: RuntimeChangesTimelineDto,
    #[serde(default)]
    pub slot_edge_ids_by_step: Vec<BTreeMap<String, Vec<String>>>,
    #[serde(default)]
    pub trace_edge_ids_by_tab: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    pub trace_node_ids_by_tab: BTreeMap<String, Vec<String>>,
}
