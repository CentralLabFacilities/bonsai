use crate::core::model::{DataModelEntryDto, WorkflowDto};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowDocumentSnapshotDto {
    pub revision: u64,
    pub workflow: WorkflowDto,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowCommandResultDto {
    pub revision: u64,
    pub workflow: WorkflowDto,
    #[serde(default)]
    pub changed_state_ids: Vec<String>,
    #[serde(default)]
    pub changed_transition_ids: Vec<String>,
    #[serde(default)]
    pub data_model_changed: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum WorkflowCommandDto {
    SetRootInitial {
        #[serde(default)]
        #[serde(rename = "stateId")]
        state_id: Option<String>,
    },
    SetStateInitialChild {
        #[serde(rename = "parentStateId")]
        parent_state_id: String,
        #[serde(default)]
        #[serde(rename = "stateId")]
        state_id: Option<String>,
    },
    RenameState {
        #[serde(rename = "stateId")]
        state_id: String,
        #[serde(rename = "scxmlId")]
        scxml_id: String,
        #[serde(default)]
        label: Option<String>,
    },
    SetStateLabel {
        #[serde(rename = "stateId")]
        state_id: String,
        label: String,
    },
    SetStateSource {
        #[serde(rename = "stateId")]
        state_id: String,
        #[serde(default)]
        source: Option<String>,
    },
    ReplaceDataModel {
        #[serde(default)]
        entries: Vec<DataModelEntryDto>,
    },
    UpdateTransitionEvent {
        #[serde(rename = "transitionId")]
        transition_id: String,
        event: String,
    },
    UpdateTransitionTarget {
        #[serde(rename = "transitionId")]
        transition_id: String,
        #[serde(default)]
        #[serde(rename = "targetStateId")]
        target_state_id: Option<String>,
        #[serde(default)]
        #[serde(rename = "targetInstanceId")]
        target_instance_id: Option<String>,
    },
}
