use crate::core::editor_export::types::{
    EditorExportEdgeDto, EditorExportNodeDto, EditorExportSlotDeclarationDto, EditorExportSlotDto,
};
use crate::core::model::{
    AssignmentDto, DataModelEntryDto, EditorPositionDto, ParameterDto, SlotDeclarationDto,
    StateDto, TransitionDto, WorkflowDto,
};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowDocumentSnapshotDto {
    pub revision: u64,
    pub workflow: WorkflowDto,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowMetadataPatchDto {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub initial_state_id: Option<String>,
    #[serde(default)]
    pub initial_scxml_state_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowPatchDto {
    pub metadata: WorkflowMetadataPatchDto,
    #[serde(default)]
    pub states: Vec<StateDto>,
    #[serde(default)]
    pub removed_state_ids: Vec<String>,
    #[serde(default)]
    pub transitions: Vec<TransitionDto>,
    #[serde(default)]
    pub removed_transition_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_model: Option<Vec<DataModelEntryDto>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slot_declarations: Option<Vec<SlotDeclarationDto>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowCommandResultDto {
    pub revision: u64,
    /// Retained for compatibility while the frontend migrates to the concrete
    /// patch payload below.
    #[serde(default)]
    pub changed_state_ids: Vec<String>,
    #[serde(default)]
    pub changed_transition_ids: Vec<String>,
    #[serde(default)]
    pub data_model_changed: bool,
    pub patch: WorkflowPatchDto,
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
    #[serde(rename = "sourceHandle")]
    pub source_handle: String,
    #[serde(default)]
    pub condition: String,
    #[serde(default)]
    pub assignments: Vec<AssignmentDto>,
    #[serde(default)]
    #[serde(rename = "targetInstanceId")]
    pub target_instance_id: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StateSlotsCommandDto {
    #[serde(rename = "stateId")]
    pub state_id: String,
    #[serde(default)]
    #[serde(rename = "stateName")]
    pub state_name: String,
    #[serde(default)]
    pub input_slots: Vec<EditorExportSlotDto>,
    #[serde(default)]
    pub output_slots: Vec<EditorExportSlotDto>,
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
    InsertEditorStates {
        #[serde(default)]
        nodes: Vec<EditorExportNodeDto>,
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
    ReplaceStateEditorPositions {
        #[serde(rename = "stateId")]
        state_id: String,
        #[serde(default)]
        positions: Vec<EditorPositionDto>,
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
    ReplaceStateParameters {
        #[serde(rename = "stateId")]
        state_id: String,
        #[serde(default)]
        parameters: Vec<ParameterDto>,
    },
    ReplaceSlotsSnapshot {
        #[serde(default)]
        states: Vec<StateSlotsCommandDto>,
        #[serde(default)]
        #[serde(rename = "extraSlotDeclarations")]
        extra_slot_declarations: Vec<EditorExportSlotDeclarationDto>,
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
    ReplaceEditorTransitions {
        #[serde(default)]
        nodes: Vec<EditorExportNodeDto>,
        #[serde(default)]
        edges: Vec<EditorExportEdgeDto>,
    },
    ReplaceEditorStructure {
        #[serde(default)]
        nodes: Vec<EditorExportNodeDto>,
        #[serde(default)]
        edges: Vec<EditorExportEdgeDto>,
    },
}
