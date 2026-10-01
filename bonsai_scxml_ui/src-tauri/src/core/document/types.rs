use crate::core::model::{AssignmentDto, DataModelEntryDto, StateDto, WorkflowDto};

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
    #[serde(default)]
    pub changed_state_ids: Vec<String>,
    #[serde(default)]
    pub changed_transition_ids: Vec<String>,
    #[serde(default)]
    pub data_model_changed: bool,
}


#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TargetedTransitionCommandDto {
    pub id: String,
    #[serde(rename = "targetStateId")]
    pub target_state_id: String,
    #[serde(default)]
    pub event: String,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub assignments: Vec<AssignmentDto>,
    #[serde(default)]
    #[serde(rename = "targetInstanceId")]
    pub target_instance_id: Option<String>,
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
        #[serde(default)]
        #[serde(rename = "fullSkillName")]
        full_skill_name: Option<String>,
    },
    AddState {
        state: StateDto,
    },
    RemoveStates {
        #[serde(default)]
        #[serde(rename = "stateIds")]
        state_ids: Vec<String>,
    },
    UpdateStateEditorPosition {
        #[serde(rename = "stateId")]
        state_id: String,
        x: f64,
        y: f64,
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
    ReplaceTargetedTransitions {
        #[serde(rename = "sourceStateId")]
        source_state_id: String,
        #[serde(default)]
        transitions: Vec<TargetedTransitionCommandDto>,
    },
}
