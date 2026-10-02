use std::collections::HashSet;

use crate::core::model::SlotDeclarationDto;

use super::{
    helpers::{normalize_xpath, state_name},
    types::EditorExportRequestDto,
};

pub(super) fn build_slot_declarations(
    request: &EditorExportRequestDto,
) -> Vec<SlotDeclarationDto> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();

    for node in &request.nodes {
        let skill_name = state_name(node);
        for item in node.input_slots.iter().chain(node.output_slots.iter()) {
            if item.path.trim().is_empty() {
                continue;
            }

            let inherited = item.inherited;
            let state = if inherited && !item.inherited_state.trim().is_empty() {
                item.inherited_state.trim().to_string()
            } else {
                skill_name.clone()
            };
            let xpath = if inherited && !item.inherited_xpath.trim().is_empty() {
                normalize_xpath(&item.inherited_xpath)
            } else {
                normalize_xpath(&item.path)
            };
            let key = item.key.trim().to_string();
            let dedupe_key = format!("{}|{}|{}|{}", inherited, key, state, xpath);
            if !key.is_empty() && !xpath.is_empty() && seen.insert(dedupe_key) {
                result.push(SlotDeclarationDto {
                    key,
                    state,
                    xpath,
                    inherited,
                });
            }
        }
    }

    for item in &request.extra_slot_declarations {
        let key = item.key.trim().to_string();
        let state = item.state.trim().to_string();
        let xpath = normalize_xpath(&item.xpath);
        if key.is_empty() || state.is_empty() || xpath.is_empty() {
            continue;
        }
        let dedupe_key = format!("{}|{}|{}|{}", item.inherited, key, state, xpath);
        if seen.insert(dedupe_key) {
            result.push(SlotDeclarationDto {
                key,
                state,
                xpath,
                inherited: item.inherited,
            });
        }
    }

    result
}
