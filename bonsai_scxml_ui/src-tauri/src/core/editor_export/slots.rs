use std::collections::HashSet;

use crate::core::model::SlotDeclarationDto;

use super::{
    helpers::{normalize_xpath, state_name},
    types::EditorExportRequestDto,
};

pub(super) fn build_slot_declarations(request: &EditorExportRequestDto) -> Vec<SlotDeclarationDto> {
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
        // Normal resources need only a path; key/state describe optional bindings.
        if xpath.is_empty() || (item.inherited && (key.is_empty() || state.is_empty())) {
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

#[cfg(test)]
mod tests {
    use crate::core::editor_export::{build_workflow_from_editor, EditorExportRequestDto};
    use crate::core::scxml::{parse_scxml, serialize_scxml};

    #[test]
    fn editor_export_round_trip_keeps_path_only_resources_bindings_and_positions() {
        let request: EditorExportRequestDto = serde_json::from_value(serde_json::json!({
            "nodes": [
                {"id": "root", "nodeType": "compound", "fullSkillName": "Root",
                 "isInitial": true, "initialChildId": "reader", "x": 120, "y": 230,
                 "editorPositions": [
                     {"x": 120, "y": 230, "instanceId": "root-main"},
                     {"x": -4.5, "y": 6, "instanceId": "root-copy", "cloneType": "reference"}
                 ]},
                {"id": "reader", "nodeType": "custom", "parentId": "root",
                 "fullSkillName": "skills.Read#one", "isInitial": true, "x": 12.5, "y": -30,
                 "inputSlots": [
                     {"key": "Model", "path": "needed", "typeName": "Object"},
                     {"key": "Own", "path": "/local", "inherited": true,
                      "inheritedState": "Root", "inheritedXpath": "/outer"}
                 ]},
                {"id": "child", "nodeType": "submachine", "parentId": "root",
                 "fullSkillName": "Child", "source": "${BEH}/child.xml", "x": 80, "y": 90}
            ],
            "dataModel": [{"id": "#_STATE_PREFIX", "expression": "'skills.'"},
                          {"id": "count", "expression": "0"}],
            "extraSlotDeclarations": [
                {"key": "Model", "state": "skills.Read#one", "xpath": "/needed"},
                {"xpath": " needed "},
                {"key": "", "state": "", "xpath": "/needed"},
                {"xpath": "/"},
                {"xpath": "/Ma\u{df}e/\u{6771}\u{4eac}&\"<>"},
                {"key": " Detached ", "xpath": " key-only "},
                {"state": " Root ", "xpath": "/state-only"},
                {"key": "Own", "state": "Root", "xpath": "/outer", "inherited": true},
                {"key": "Invalid", "state": "Root", "xpath": " "},
                {"xpath": ""}
            ]
        }))
        .unwrap();
        let request_before = serde_json::to_value(&request).unwrap();
        let workflow = build_workflow_from_editor(&request).unwrap();
        let declarations = serde_json::json!([
            {"key": "Model", "state": "skills.Read#one", "xpath": "/needed", "inherited": false},
            {"key": "Own", "state": "Root", "xpath": "/outer", "inherited": true},
            {"key": "", "state": "", "xpath": "/needed", "inherited": false},
            {"key": "", "state": "", "xpath": "/", "inherited": false},
            {"key": "", "state": "", "xpath": "/Ma\u{df}e/\u{6771}\u{4eac}&\"<>", "inherited": false},
            {"key": "Detached", "state": "", "xpath": "/key-only", "inherited": false},
            {"key": "", "state": "Root", "xpath": "/state-only", "inherited": false}
        ]);
        assert_eq!(
            serde_json::to_value(workflow.to_dto().slot_declarations).unwrap(),
            declarations
        );

        let xml = serialize_scxml(&workflow).unwrap();
        assert!(xml.contains(concat!(
            "                <slot key=\"Model\" state=\"skills.Read#one\" xpath=\"/needed\"/>\n",
            "                <inheritSlot key=\"Own\" state=\"Root\" xpath=\"/outer\"/>\n",
            "                <slot xpath=\"/needed\"/>\n",
            "                <slot xpath=\"/\"/>\n",
            "                <slot xpath=\"/Ma\u{df}e/\u{6771}\u{4eac}&amp;&quot;&lt;&gt;\"/>\n",
            "                <slot key=\"Detached\" xpath=\"/key-only\"/>\n",
            "                <slot state=\"Root\" xpath=\"/state-only\"/>\n"
        )));
        assert!(xml.find("id=\"#_STATE_PREFIX\"").unwrap() < xml.find("id=\"#_SLOTS\"").unwrap());
        assert!(xml.find("id=\"#_SLOTS\"").unwrap() < xml.find("id=\"count\"").unwrap());
        assert!(!xml.contains("key=\"\""));
        assert!(!xml.contains("state=\"\""));

        let reopened = parse_scxml(&xml).unwrap();
        assert_eq!(
            serde_json::to_value(reopened.to_dto().slot_declarations).unwrap(),
            declarations
        );
        assert_eq!(serialize_scxml(&reopened).unwrap(), xml);
        for (original, parsed) in workflow.states.iter().zip(&reopened.states) {
            assert_eq!(original.scxml_id, parsed.scxml_id);
            assert_eq!(original.kind, parsed.kind);
            assert_eq!(original.source, parsed.source);
            assert_eq!(
                original.initial_child_scxml_id,
                parsed.initial_child_scxml_id
            );
            assert_eq!(original.is_initial, parsed.is_initial);
            assert_eq!(
                serde_json::to_value(original.to_dto().editor).unwrap(),
                serde_json::to_value(parsed.to_dto().editor).unwrap()
            );
        }
        assert_eq!(serde_json::to_value(&request).unwrap(), request_before);
        assert!(xml.contains("<state id=\"Child\" src=\"${BEH}/child.xml\">"));
    }

    #[test]
    fn editor_export_keeps_empty_path_and_inherited_binding_filters() {
        let request: EditorExportRequestDto = serde_json::from_value(serde_json::json!({
            "extraSlotDeclarations": [
                {"key": "", "state": "", "xpath": ""},
                {"key": "Key", "state": "Root", "xpath": " \t "},
                {"xpath": "/missing-inherit-binding", "inherited": true},
                {"key": "Key", "xpath": "/missing-inherit-state", "inherited": true},
                {"state": "Root", "xpath": "/missing-inherit-key", "inherited": true},
                {"key": "Key", "state": "Root", "xpath": " outer ", "inherited": true}
            ]
        }))
        .unwrap();
        let workflow = build_workflow_from_editor(&request).unwrap();
        assert_eq!(
            serde_json::to_value(workflow.to_dto().slot_declarations).unwrap(),
            serde_json::json!([
                {"key": "Key", "state": "Root", "xpath": "/outer", "inherited": true}
            ])
        );
    }
}
