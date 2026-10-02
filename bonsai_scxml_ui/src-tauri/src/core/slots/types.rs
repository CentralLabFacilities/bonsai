use std::collections::HashMap;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotAncestryRequestDto {
    #[serde(default)]
    pub tabs: Vec<SlotTabDto>,
    #[serde(default)]
    pub active_tab_id: Option<String>,
    #[serde(default)]
    pub active_snapshot: Option<SlotTabSnapshotDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotAncestryResponseDto {
    #[serde(default)]
    pub by_path: HashMap<String, Vec<AncestorSlotAccessDto>>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotTabDto {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub file_name: String,
    #[serde(default)]
    pub parent_tab_id: Option<String>,
    #[serde(default)]
    pub nodes: Vec<SlotNodeDto>,
    #[serde(default)]
    pub manual_slots: Vec<SlotDeclarationDto>,
    #[serde(default)]
    pub slot_nodes: Vec<CanvasSlotNodeDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotTabSnapshotDto {
    #[serde(default)]
    pub parent_tab_id: Option<String>,
    #[serde(default)]
    pub nodes: Vec<SlotNodeDto>,
    #[serde(default)]
    pub manual_slots: Vec<SlotDeclarationDto>,
    #[serde(default)]
    pub slot_nodes: Vec<CanvasSlotNodeDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotNodeDto {
    pub id: String,
    #[serde(default)]
    pub node_type: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub full_skill_name: String,
    #[serde(default)]
    pub input_slots: Vec<SkillSlotDto>,
    #[serde(default)]
    pub output_slots: Vec<SkillSlotDto>,
    #[serde(default)]
    pub inherited_slots: Vec<InheritedSlotUsageDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillSlotDto {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub inherited_path: String,
    #[serde(default)]
    pub is_inherited: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InheritedSlotUsageDto {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub access: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SlotDeclarationDto {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub inherited_path: String,
    #[serde(default)]
    pub slot_kind: String,
    #[serde(default)]
    pub is_inherited: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CanvasSlotNodeDto {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub current_machine_inherited: bool,
    #[serde(default)]
    pub is_slot_clone: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AncestorSlotAccessDto {
    #[serde(default)]
    pub node_id: Option<String>,
    #[serde(default)]
    pub skill_name: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub type_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub access: String,
    #[serde(default)]
    pub slot_index: Option<usize>,
    #[serde(default)]
    pub source_kind: String,
    #[serde(default)]
    pub hierarchy_kind: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub parent_tab_id: String,
    #[serde(default)]
    pub parent_machine_name: String,
    #[serde(default)]
    pub ancestor_depth: usize,
}
