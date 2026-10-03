use std::collections::{HashMap, HashSet};

use super::helpers::{focus_node, node_label, normalize_slot_path, normalize_slot_type, problem, slot_name};
use super::types::{EditorProblemDto, ValidationNodeDto, ValidationRequestDto, ValidationSlotDto};

pub(super) fn validate_slots(request: &ValidationRequestDto, problems: &mut Vec<EditorProblemDto>) {
    #[derive(Clone, Copy)]
    struct SlotAccess<'a> {
        node: &'a ValidationNodeDto,
        slot: &'a ValidationSlotDto,
        index: usize,
    }

    let mut readers: HashMap<String, Vec<SlotAccess<'_>>> = HashMap::new();
    let mut writers: HashMap<String, Vec<SlotAccess<'_>>> = HashMap::new();

    for node in &request.nodes {
        for (index, slot) in node.input_slots.iter().enumerate() {
            let path = normalize_slot_path(&slot.path);
            if path.is_empty() {
                let mut item = problem(
                    format!("slot-input-empty-{}-{index}", node.id),
                    "warning",
                    "Slots",
                    "Input slot is not connected",
                    format!(
                        "{}.{} has no slot path.",
                        node_label(node),
                        slot_name(slot, "input", index)
                    ),
                );
                focus_node(&mut item, node.id.clone());
                item.detail_tab = Some("slots".into());
                item.mode = Some("overview".into());
                problems.push(item);
                continue;
            }
            readers.entry(path).or_default().push(SlotAccess { node, slot, index });
        }

        for (index, slot) in node.output_slots.iter().enumerate() {
            let path = normalize_slot_path(&slot.path);
            if path.is_empty() {
                let mut item = problem(
                    format!("slot-output-empty-{}-{index}", node.id),
                    "warning",
                    "Slots",
                    "Output slot is not connected",
                    format!(
                        "{}.{} has no slot path.",
                        node_label(node),
                        slot_name(slot, "output", index)
                    ),
                );
                focus_node(&mut item, node.id.clone());
                item.detail_tab = Some("slots".into());
                item.mode = Some("overview".into());
                problems.push(item);
                continue;
            }
            writers.entry(path).or_default().push(SlotAccess { node, slot, index });
        }
    }

    let inherited_paths: HashSet<String> = request
        .inherited_slot_paths
        .iter()
        .map(|path| normalize_slot_path(path))
        .filter(|path| !path.is_empty())
        .collect();
    let ancestor_writer_paths: HashSet<String> = request
        .ancestor_writer_slot_paths
        .iter()
        .map(|path| normalize_slot_path(path))
        .filter(|path| !path.is_empty())
        .collect();

    let paths: HashSet<String> = readers
        .keys()
        .chain(writers.keys())
        .cloned()
        .collect();

    for path in paths {
        let path_readers = readers.get(&path).cloned().unwrap_or_default();
        let path_writers = writers.get(&path).cloned().unwrap_or_default();

        for reader in &path_readers {
            for writer in &path_writers {
                let input_type = normalize_slot_type(&reader.slot.type_name);
                let output_type = normalize_slot_type(&writer.slot.type_name);
                if !input_type.is_empty() && !output_type.is_empty() && input_type != output_type {
                    let mut item = problem(
                        format!(
                            "slot-type-{path}-{}-{}-{}-{}",
                            reader.node.id, reader.index, writer.node.id, writer.index
                        ),
                        "error",
                        "Slots",
                        "Slot type mismatch",
                        format!(
                            "/{path}: {}.{} ({}) → {}.{} ({}).",
                            node_label(writer.node),
                            writer.slot.key,
                            writer.slot.type_name,
                            node_label(reader.node),
                            reader.slot.key,
                            reader.slot.type_name
                        ),
                    );
                    item.node_id = Some(reader.node.id.clone());
                    item.detail_tab = Some("slots".into());
                    item.mode = Some("overview".into());
                    item.focus_node_ids = vec![writer.node.id.clone(), reader.node.id.clone()];
                    problems.push(item);
                }
            }
        }

        if !path_readers.is_empty() && path_writers.is_empty() {
            if inherited_paths.contains(&path) && ancestor_writer_paths.contains(&path) {
                continue;
            }

            // A missing writer is a property of the slot path, not of any
            // individual reader. Report it once per path and target the slot
            // itself so Problems navigation can focus the canonical slot node.
            let mut item = problem(
                format!("slot-no-writer-{path}"),
                "warning",
                "Slots",
                "Slot has no writer",
                format!("/{path} is being read but has no writer."),
            );
            item.slot_path = Some(format!("/{path}"));
            item.mode = Some("overview".into());
            problems.push(item);
        }
    }
}
