use std::collections::{HashMap, HashSet};

use super::types::{
    AncestorSlotAccessDto, SlotAncestryRequestDto, SlotAncestryResponseDto,
    SlotDeclarationDto, SlotTabDto,
};

fn normalize_slot_path(value: &str) -> String {
    value.trim().trim_start_matches('/').to_string()
}

fn slot_path(path: &str, inherited_path: &str) -> String {
    let inherited = normalize_slot_path(inherited_path);
    if !inherited.is_empty() {
        return inherited;
    }
    normalize_slot_path(path)
}

fn is_inherited_declaration(slot: &SlotDeclarationDto) -> bool {
    slot.is_inherited || slot.slot_kind == "inheritSlot"
}

fn inherited_declarations_for_path<'a>(
    tab: &'a SlotTabDto,
    path: &str,
) -> Vec<DeclarationView<'a>> {
    let mut declarations = Vec::new();

    for slot in &tab.manual_slots {
        if !is_inherited_declaration(slot) || slot_path(&slot.path, &slot.inherited_path) != path {
            continue;
        }
        declarations.push(DeclarationView {
            node_id: None,
            key: &slot.key,
            type_name: &slot.type_name,
            description: &slot.description,
        });
    }

    for slot_node in &tab.slot_nodes {
        if slot_node.is_slot_clone || !slot_node.current_machine_inherited {
            continue;
        }
        if normalize_slot_path(if slot_node.path.is_empty() {
            &slot_node.label
        } else {
            &slot_node.path
        }) != path
        {
            continue;
        }
        declarations.push(DeclarationView {
            node_id: None,
            key: &slot_node.key,
            type_name: &slot_node.type_name,
            description: &slot_node.description,
        });
    }

    for node in &tab.nodes {
        for slot in node.input_slots.iter().chain(node.output_slots.iter()) {
            if !slot.is_inherited || slot_path(&slot.path, &slot.inherited_path) != path {
                continue;
            }
            declarations.push(DeclarationView {
                node_id: Some(node.id.as_str()),
                key: &slot.key,
                type_name: &slot.type_name,
                description: &slot.description,
            });
        }
    }

    declarations
}

fn collect_inherited_paths(tab: &SlotTabDto) -> HashSet<String> {
    let mut paths = HashSet::new();

    for slot in &tab.manual_slots {
        if is_inherited_declaration(slot) {
            let path = slot_path(&slot.path, &slot.inherited_path);
            if !path.is_empty() {
                paths.insert(path);
            }
        }
    }

    for slot_node in &tab.slot_nodes {
        if slot_node.is_slot_clone || !slot_node.current_machine_inherited {
            continue;
        }
        let path = normalize_slot_path(if slot_node.path.is_empty() {
            &slot_node.label
        } else {
            &slot_node.path
        });
        if !path.is_empty() {
            paths.insert(path);
        }
    }

    for node in &tab.nodes {
        for slot in node.input_slots.iter().chain(node.output_slots.iter()) {
            if !slot.is_inherited {
                continue;
            }
            let path = slot_path(&slot.path, &slot.inherited_path);
            if !path.is_empty() {
                paths.insert(path);
            }
        }
    }

    paths
}

struct DeclarationView<'a> {
    node_id: Option<&'a str>,
    key: &'a str,
    type_name: &'a str,
    description: &'a str,
}

pub(crate) fn resolve_slot_ancestry(
    request: &SlotAncestryRequestDto,
) -> SlotAncestryResponseDto {
    let Some(active_tab_id) = request.active_tab_id.as_deref() else {
        return SlotAncestryResponseDto::default();
    };

    let mut tabs_by_id: HashMap<String, SlotTabDto> = request
        .tabs
        .iter()
        .cloned()
        .map(|tab| (tab.id.clone(), tab))
        .collect();

    if let Some(snapshot) = &request.active_snapshot {
        let mut active = tabs_by_id
            .remove(active_tab_id)
            .unwrap_or_else(|| SlotTabDto {
                id: active_tab_id.to_string(),
                ..Default::default()
            });

        active.nodes = snapshot.nodes.clone();
        active.manual_slots = snapshot.manual_slots.clone();
        active.slot_nodes = snapshot.slot_nodes.clone();
        if snapshot.parent_tab_id.is_some() {
            active.parent_tab_id = snapshot.parent_tab_id.clone();
        }

        tabs_by_id.insert(active_tab_id.to_string(), active);
    }

    let Some(current_tab) = tabs_by_id.get(active_tab_id) else {
        return SlotAncestryResponseDto::default();
    };
    if current_tab.parent_tab_id.is_none() {
        return SlotAncestryResponseDto::default();
    }

    let mut ancestors = Vec::<(String, usize)>::new();
    let mut seen = HashSet::new();
    let mut parent_tab_id = current_tab.parent_tab_id.clone();
    let mut depth = 1usize;

    while let Some(parent_id) = parent_tab_id {
        if !seen.insert(parent_id.clone()) {
            break;
        }
        let Some(parent_tab) = tabs_by_id.get(&parent_id) else {
            break;
        };

        ancestors.push((parent_id.clone(), depth));
        parent_tab_id = parent_tab.parent_tab_id.clone();
        depth += 1;
    }

    let candidate_paths = collect_inherited_paths(current_tab);
    let mut by_path = HashMap::new();

    for path in candidate_paths {
        let mut entries = Vec::<AncestorSlotAccessDto>::new();

        for (parent_id, ancestor_depth) in &ancestors {
            let Some(parent_tab) = tabs_by_id.get(parent_id) else {
                continue;
            };
            let parent_machine_name = if !parent_tab.title.is_empty() {
                parent_tab.title.clone()
            } else if !parent_tab.file_name.is_empty() {
                parent_tab.file_name.clone()
            } else {
                "Parent state machine".to_string()
            };

            let inherited_declarations = inherited_declarations_for_path(parent_tab, &path);
            let is_inherited = !inherited_declarations.is_empty();
            let mut writer_keys = HashSet::new();

            for node in &parent_tab.nodes {
                let skill_name = if !node.full_skill_name.is_empty() {
                    node.full_skill_name.clone()
                } else if !node.label.is_empty() {
                    node.label.clone()
                } else {
                    node.id.clone()
                };

                for (slot_index, slot) in node.output_slots.iter().enumerate() {
                    if normalize_slot_path(&slot.path) != path {
                        continue;
                    }

                    let key = format!("{}|{}|{}|skill", node.id, slot.key, slot_index);
                    if !writer_keys.insert(key) {
                        continue;
                    }

                    entries.push(AncestorSlotAccessDto {
                        node_id: Some(node.id.clone()),
                        skill_name: skill_name.clone(),
                        key: if slot.key.is_empty() {
                            format!("output {}", slot_index + 1)
                        } else {
                            slot.key.clone()
                        },
                        type_name: if slot.type_name.is_empty() {
                            "Unknown".into()
                        } else {
                            slot.type_name.clone()
                        },
                        description: slot.description.clone(),
                        access: "write".into(),
                        slot_index: Some(slot_index),
                        source_kind: "skill".into(),
                        hierarchy_kind: "writer".into(),
                        path: format!("/{path}"),
                        parent_tab_id: parent_tab.id.clone(),
                        parent_machine_name: parent_machine_name.clone(),
                        ancestor_depth: *ancestor_depth,
                    });
                }

                if node.node_type == "submachine" {
                    for (slot_index, slot) in node.inherited_slots.iter().enumerate() {
                        if slot.access != "write" || normalize_slot_path(&slot.path) != path {
                            continue;
                        }

                        let key = format!("{}|{}|{}|submachine", node.id, slot.key, slot_index);
                        if !writer_keys.insert(key) {
                            continue;
                        }

                        entries.push(AncestorSlotAccessDto {
                            node_id: Some(node.id.clone()),
                            skill_name: skill_name.clone(),
                            key: if slot.key.is_empty() {
                                format!("inheritSlot {}", slot_index + 1)
                            } else {
                                slot.key.clone()
                            },
                            type_name: if slot.type_name.is_empty() {
                                "Unknown".into()
                            } else {
                                slot.type_name.clone()
                            },
                            description: slot.description.clone(),
                            access: "write".into(),
                            slot_index: Some(slot_index),
                            source_kind: "submachine".into(),
                            hierarchy_kind: "writer".into(),
                            path: format!("/{path}"),
                            parent_tab_id: parent_tab.id.clone(),
                            parent_machine_name: parent_machine_name.clone(),
                            ancestor_depth: *ancestor_depth,
                        });
                    }
                }
            }

            if let Some(declaration) = inherited_declarations.first() {
                entries.push(AncestorSlotAccessDto {
                    node_id: declaration.node_id.map(ToString::to_string),
                    skill_name: "inheritSlot".into(),
                    key: if declaration.key.is_empty() {
                        "inheritSlot".into()
                    } else {
                        declaration.key.to_string()
                    },
                    type_name: if declaration.type_name.is_empty() {
                        "Unknown".into()
                    } else {
                        declaration.type_name.to_string()
                    },
                    description: declaration.description.to_string(),
                    access: "inherit".into(),
                    slot_index: None,
                    source_kind: "inheritSlot".into(),
                    hierarchy_kind: "inherit".into(),
                    path: format!("/{path}"),
                    parent_tab_id: parent_tab.id.clone(),
                    parent_machine_name,
                    ancestor_depth: *ancestor_depth,
                });
            }

            // Inheritance only crosses this state-machine boundary if the
            // parent explicitly inherits the same path from its own parent.
            if !is_inherited {
                break;
            }
        }

        if entries.is_empty() {
            continue;
        }

        entries.sort_by(|left, right| {
            right
                .ancestor_depth
                .cmp(&left.ancestor_depth)
                .then_with(|| {
                    let left_rank = if left.hierarchy_kind == "writer" { 0 } else { 1 };
                    let right_rank = if right.hierarchy_kind == "writer" { 0 } else { 1 };
                    left_rank.cmp(&right_rank)
                })
                .then_with(|| left.skill_name.cmp(&right.skill_name))
        });

        by_path.insert(path, entries);
    }

    SlotAncestryResponseDto { by_path }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::slots::types::{
        InheritedSlotUsageDto, SkillSlotDto, SlotNodeDto, SlotTabSnapshotDto,
    };

    #[test]
    fn stops_at_first_parent_that_does_not_inherit_path() {
        let request = SlotAncestryRequestDto {
            active_tab_id: Some("child".into()),
            tabs: vec![
                SlotTabDto {
                    id: "root".into(),
                    nodes: vec![SlotNodeDto {
                        id: "root-writer".into(),
                        full_skill_name: "RootWriter".into(),
                        output_slots: vec![SkillSlotDto {
                            key: "Model".into(),
                            type_name: "Model".into(),
                            path: "/pick/model".into(),
                            ..Default::default()
                        }],
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                SlotTabDto {
                    id: "parent".into(),
                    parent_tab_id: Some("root".into()),
                    nodes: vec![SlotNodeDto {
                        id: "parent-writer".into(),
                        full_skill_name: "ParentWriter".into(),
                        output_slots: vec![SkillSlotDto {
                            key: "Model".into(),
                            type_name: "Model".into(),
                            path: "/pick/model".into(),
                            ..Default::default()
                        }],
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                SlotTabDto {
                    id: "child".into(),
                    parent_tab_id: Some("parent".into()),
                    ..Default::default()
                },
            ],
            active_snapshot: Some(SlotTabSnapshotDto {
                parent_tab_id: Some("parent".into()),
                nodes: vec![SlotNodeDto {
                    id: "reader".into(),
                    input_slots: vec![SkillSlotDto {
                        path: "/pick/model".into(),
                        inherited_path: "/pick/model".into(),
                        is_inherited: true,
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
                ..Default::default()
            }),
        };

        let result = resolve_slot_ancestry(&request);
        let entries = result.by_path.get("pick/model").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].node_id.as_deref(), Some("parent-writer"));
    }

    #[test]
    fn follows_inherit_chain_to_root_writer() {
        let request = SlotAncestryRequestDto {
            active_tab_id: Some("child".into()),
            tabs: vec![
                SlotTabDto {
                    id: "root".into(),
                    nodes: vec![SlotNodeDto {
                        id: "root-writer".into(),
                        full_skill_name: "RootWriter".into(),
                        output_slots: vec![SkillSlotDto {
                            path: "/pick/model".into(),
                            ..Default::default()
                        }],
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                SlotTabDto {
                    id: "parent".into(),
                    parent_tab_id: Some("root".into()),
                    manual_slots: vec![SlotDeclarationDto {
                        path: "/pick/model".into(),
                        inherited_path: "/pick/model".into(),
                        slot_kind: "inheritSlot".into(),
                        is_inherited: true,
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                SlotTabDto {
                    id: "child".into(),
                    parent_tab_id: Some("parent".into()),
                    ..Default::default()
                },
            ],
            active_snapshot: Some(SlotTabSnapshotDto {
                parent_tab_id: Some("parent".into()),
                nodes: vec![SlotNodeDto {
                    id: "sub".into(),
                    inherited_slots: vec![InheritedSlotUsageDto {
                        path: "/pick/model".into(),
                        access: "read".into(),
                        ..Default::default()
                    }],
                    input_slots: vec![SkillSlotDto {
                        path: "/pick/model".into(),
                        inherited_path: "/pick/model".into(),
                        is_inherited: true,
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
                ..Default::default()
            }),
        };

        let result = resolve_slot_ancestry(&request);
        let entries = result.by_path.get("pick/model").unwrap();
        assert!(entries.iter().any(|entry| entry.node_id.as_deref() == Some("root-writer")));
        assert!(entries.iter().any(|entry| entry.hierarchy_kind == "inherit"));
    }
}
